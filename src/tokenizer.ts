import * as vscode from 'vscode';

/** 用于取色的粗粒度 token 类型 */
export type TokenType =
  | 'comment'
  | 'string'
  | 'number'
  | 'keyword'
  | 'type'
  | 'function'
  | 'property'
  | 'operator'
  | 'punctuation'
  | 'constant'
  | 'variable';

interface LangSyntax {
  lineComments: string[];
  blockComments: Array<[string, string]>;
  /** 支持 python 的三引号字符串 */
  tripleQuotes?: boolean;
}

const C_LIKE: LangSyntax = {
  lineComments: ['//'],
  blockComments: [['/*', '*/']],
};

const HASH_LIKE: LangSyntax = {
  lineComments: ['#'],
  blockComments: [],
};

const HASH_OR_C: LangSyntax = {
  lineComments: ['#', '//'],
  blockComments: [['/*', '*/']],
};

const MARKUP: LangSyntax = {
  lineComments: [],
  blockComments: [['<!--', '-->']],
};

const LANG_SYNTAX: Record<string, LangSyntax> = {
  python: { lineComments: ['#'], blockComments: [], tripleQuotes: true },
  ruby: { lineComments: ['#'], blockComments: [['=begin', '=end']] },
  shellscript: HASH_LIKE,
  shell: HASH_LIKE,
  bash: HASH_LIKE,
  powershell: { lineComments: ['#'], blockComments: [['<#', '#>']] },
  yaml: HASH_LIKE,
  toml: HASH_LIKE,
  ini: HASH_LIKE,
  properties: HASH_LIKE,
  makefile: HASH_LIKE,
  dockerfile: HASH_LIKE,
  perl: HASH_LIKE,
  r: HASH_LIKE,
  julia: HASH_OR_C,
  elixir: HASH_LIKE,
  lua: { lineComments: ['--'], blockComments: [['--[[', ']]']] },
  sql: { lineComments: ['--'], blockComments: [['/*', '*/']] },
  haskell: { lineComments: ['--'], blockComments: [['{-', '-}']] },
  html: MARKUP,
  xml: MARKUP,
  svg: MARKUP,
  vue: MARKUP,
  svelte: MARKUP,
  razor: MARKUP,
  handlebars: MARKUP,
  markdown: { lineComments: [], blockComments: [['<!--', '-->']] },
  css: { lineComments: [], blockComments: [['/*', '*/']] },
  scss: C_LIKE,
  less: C_LIKE,
  jsonc: C_LIKE,
  json: { lineComments: [], blockComments: [] },
  json5: C_LIKE,
  coffeescript: HASH_LIKE,
  php: HASH_OR_C,
  graphql: HASH_LIKE,
  terraform: HASH_LIKE,
  hcl: HASH_LIKE,
  nginx: HASH_LIKE,
  plaintext: { lineComments: [], blockComments: [] },
  log: { lineComments: [], blockComments: [] },
  diff: { lineComments: [], blockComments: [] },
};

function syntaxFor(languageId: string): LangSyntax {
  return LANG_SYNTAX[languageId] ?? C_LIKE;
}

/**
 * 光标前最多回看的字符数。取色只需要判断「当前处于代码 / 注释 / 字符串」，没必要
 * 每次按键都把光标前几百行重新扫一遍——在长行或大文件里那会直接拖慢输入响应。
 * 6000 字符已覆盖绝大多数场景，截断也仅在超长块注释等极端情况下才影响精度。
 */
const MAX_SCAN_CHARS = 6000;

const ASCII_LIMIT = 128;

/**
 * 预编译的语法标记：按首字符分桶。原实现每个字符都要跑一遍 `find`+`startsWith`
 * 的闭包，是逐键扫描里最重的一部分；分桶后绝大多数字符只需一次数组索引即可跳过。
 */
interface CompiledSyntax {
  lineMarkers: Array<string[] | undefined>;
  blockMarkers: Array<Array<[string, string]> | undefined>;
  tripleQuotes: boolean;
}

const compiledCache = new Map<string, CompiledSyntax>();

function compileSyntax(languageId: string): CompiledSyntax {
  const cached = compiledCache.get(languageId);
  if (cached) {
    return cached;
  }
  const syn = syntaxFor(languageId);
  const lineMarkers: Array<string[] | undefined> = new Array(ASCII_LIMIT);
  const blockMarkers: Array<Array<[string, string]> | undefined> = new Array(ASCII_LIMIT);
  for (const marker of syn.lineComments) {
    const code = marker.charCodeAt(0);
    if (code < ASCII_LIMIT) {
      (lineMarkers[code] ??= []).push(marker);
    }
  }
  for (const marker of syn.blockComments) {
    const code = marker[0].charCodeAt(0);
    if (code < ASCII_LIMIT) {
      (blockMarkers[code] ??= []).push(marker);
    }
  }
  const compiled: CompiledSyntax = {
    lineMarkers,
    blockMarkers,
    tripleQuotes: syn.tripleQuotes === true,
  };
  compiledCache.set(languageId, compiled);
  return compiled;
}

/** 运算符首字符查表，替代逐字符正则 */
const OPERATOR_CODES = new Uint8Array(ASCII_LIMIT);
for (const ch of '+-*/%=<>!&|^~?') {
  OPERATOR_CODES[ch.charCodeAt(0)] = 1;
}

function isIdentStartCode(code: number): boolean {
  return (
    (code >= 97 && code <= 122) || // a-z
    (code >= 65 && code <= 90) || // A-Z
    code === 95 || // _
    code === 36 || // $
    code === 64 // @
  );
}

function isIdentCharCode(code: number): boolean {
  return isIdentStartCode(code) || (code >= 48 && code <= 57);
}

/** 数字字面量的后续字符：0-9 a-f A-F x X o O b B e E . _ + - */
function isNumberCharCode(code: number): boolean {
  if (code >= 48 && code <= 57) {
    return true;
  }
  if (code >= 97 && code <= 102) {
    return true;
  }
  if (code >= 65 && code <= 70) {
    return true;
  }
  return (
    code === 120 || code === 88 || // x X
    code === 111 || code === 79 || // o O
    code === 98 || code === 66 || // b B
    code === 101 || code === 69 || // e E
    code === 46 || // .
    code === 95 || // _
    code === 43 || // +
    code === 45 // -
  );
}

/** 各语言常见关键字合集（跨语言合并，仅用于取色，取不到就回退普通变量色） */
const KEYWORDS = new Set(
  (
    'abstract as assert async await base begin box break case catch class const constructor continue declare defer del delete do done dyn dynamic elif else elseif end enum except export extends extern false final finally fn for foreach from function get global go goto if impl implements import in include inline instanceof interface is let local loop macro match mod module move mut namespace native new next nil none not null of or override package pass priv private protected pub public raise readonly record ref require return sealed self select static struct super switch sync then this throw throws trait transient true try type typeof union unless unsafe until use using var virtual void when where while with yield ' +
    'and as def from import lambda nonlocal assert elif except finally global in is not or pass raise with while del print ' +
    'int float double long short byte char bool string void uint ulong ushort decimal object string var dynamic ' +
    'function class extends implements interface public private protected static final abstract synchronized volatile transient native strictfp throws throw try catch finally this super new return if else for while do switch case default break continue ' +
    'let const export import from default async await of in typeof instanceof delete void yield ' +
    'select from where insert update delete join group order by having limit offset union create table alter drop index view primary key foreign references default null'
  ).split(/\s+/)
);

const TYPE_HINTS = new Set(
  'int float double long short byte char bool boolean string str uint ulong ushort decimal object numeric date datetime Array Object String Number Boolean Map Set List Dict Promise Error Exception'.split(
    /\s+/
  )
);

export interface TokenColorHint {
  type: TokenType;
  /** 正在输入的标识符（可能为空），用于状态栏展示 */
  word: string;
}

/**
 * 用一个极轻量的词法状态机判断光标处的 token 类型。
 * 只扫描光标前有限的一段文本（受 MAX_SCAN_CHARS 约束），代价可控；
 * 目的不是精确着色，而是选一个合理的颜色。
 */
export function classifyToken(
  document: vscode.TextDocument,
  position: vscode.Position
): TokenColorHint {
  const syn = compileSyntax(document.languageId);

  // 只取光标前有限的一段：按字符预算回溯，并对齐到行首，避免在行中间截断词法状态。
  const endOffset = document.offsetAt(position);
  const startOffset = Math.max(0, endOffset - MAX_SCAN_CHARS);
  const startLine = startOffset === 0 ? 0 : document.positionAt(startOffset).line;
  const start = new vscode.Position(startLine, 0);
  const prefix = start.isEqual(position) ? '' : document.getText(new vscode.Range(start, position));

  const line = position.line < document.lineCount ? document.lineAt(position.line).text : '';
  const nextChar = line.length > position.character ? line[position.character] : '';

  let state: 'code' | 'lineComment' | 'blockComment' | 'string' | 'triple' = 'code';
  let blockEnd = '';
  let quoteChar = '';
  let tripleQuote = '';
  let lastType: TokenType = 'variable';
  let word = '';

  const length = prefix.length;
  let i = 0;
  while (i < length) {
    const c = prefix[i];
    const code = c.charCodeAt(0);

    if (state === 'lineComment') {
      if (c === '\n') {
        state = 'code';
      }
      lastType = 'comment';
      i++;
      continue;
    }

    if (state === 'blockComment') {
      if (blockEnd && prefix.startsWith(blockEnd, i)) {
        i += blockEnd.length;
        state = 'code';
      } else {
        i++;
      }
      lastType = 'comment';
      continue;
    }

    if (state === 'string' || state === 'triple') {
      if (c === '\\') {
        i += 2;
      } else if (state === 'triple') {
        if (prefix.startsWith(tripleQuote, i)) {
          i += 3;
          state = 'code';
        } else {
          i++;
        }
      } else if (c === quoteChar) {
        i++;
        state = 'code';
      } else if (c === '\n' && quoteChar !== '`') {
        // 单行字符串不跨行：视为未闭合，回到代码态
        i++;
        state = 'code';
      } else {
        i++;
      }
      lastType = 'string';
      continue;
    }

    // ---- 代码态 ----
    if (c === '\n' || c === ' ' || c === '\t' || c === '\r') {
      i++;
      continue;
    }

    if (code < ASCII_LIMIT) {
      const lineMarkers = syn.lineMarkers[code];
      if (lineMarkers) {
        for (const marker of lineMarkers) {
          if (prefix.startsWith(marker, i)) {
            i += marker.length;
            state = 'lineComment';
            lastType = 'comment';
            break;
          }
        }
        if (state === 'lineComment') {
          continue;
        }
      }

      const blockMarkers = syn.blockMarkers[code];
      if (blockMarkers) {
        let matched = false;
        for (const marker of blockMarkers) {
          if (prefix.startsWith(marker[0], i)) {
            i += marker[0].length;
            blockEnd = marker[1];
            state = 'blockComment';
            lastType = 'comment';
            matched = true;
            break;
          }
        }
        if (matched) {
          continue;
        }
      }
    }

    if (syn.tripleQuotes && (prefix.startsWith('"""', i) || prefix.startsWith("'''", i))) {
      quoteChar = c;
      tripleQuote = c.repeat(3);
      i += 3;
      state = 'triple';
      lastType = 'string';
      continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      quoteChar = c;
      i++;
      state = 'string';
      lastType = 'string';
      continue;
    }

    if (code >= 48 && code <= 57 && !isIdentCharCode(i > 0 ? prefix.charCodeAt(i - 1) : 32)) {
      while (i < length && isNumberCharCode(prefix.charCodeAt(i))) {
        i++;
      }
      lastType = 'number';
      word = '';
      continue;
    }

    if (isIdentStartCode(code)) {
      const startIdx = i;
      while (i < length && isIdentCharCode(prefix.charCodeAt(i))) {
        i++;
      }
      const raw = prefix.slice(startIdx, i);
      const after = i < length ? prefix[i] : nextChar;
      lastType = resolveIdentifier(raw, after);
      // 若末尾仍处于标识符中间，保留 word 供状态栏展示
      word = i === length ? raw : '';
      continue;
    }

    if (code < ASCII_LIMIT && OPERATOR_CODES[code]) {
      lastType = 'operator';
    } else if (c === '.' && word) {
      lastType = 'property';
    } else {
      lastType = 'punctuation';
    }
    word = '';
    i++;
  }

  if (state === 'string' || state === 'triple') {
    return { type: 'string', word: '' };
  }
  if (state === 'blockComment' || state === 'lineComment') {
    return { type: 'comment', word: '' };
  }
  return { type: lastType, word };
}

function resolveIdentifier(raw: string, nextChar: string): TokenType {
  const lower = raw.toLowerCase();
  if (KEYWORDS.has(lower)) {
    if (lower === 'true' || lower === 'false' || lower === 'null' || lower === 'nil' || lower === 'none') {
      return 'constant';
    }
    return 'keyword';
  }
  if (TYPE_HINTS.has(raw)) {
    return 'type';
  }
  if (/^[A-Z][A-Za-z0-9_]*$/.test(raw)) {
    return 'type';
  }
  if (nextChar === '(') {
    return 'function';
  }
  return 'variable';
}
