import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { TokenType } from './tokenizer';

interface TokenRule {
  scope?: string | string[];
  settings?: { foreground?: string; fontStyle?: string };
}

interface ThemeData {
  colors: Record<string, string>;
  tokenColors: TokenRule[];
}

/** token 类型 -> 主题里的候选 scope（按 TextMate 语义，最具体的命中优先） */
const SCOPE_HINTS: Record<TokenType, string[]> = {
  comment: ['comment'],
  string: ['string'],
  number: ['constant.numeric'],
  constant: ['constant.language', 'constant.other', 'constant'],
  keyword: ['keyword.control', 'storage.modifier', 'storage.type', 'keyword'],
  type: ['entity.name.type', 'entity.name.class', 'support.class', 'entity.name.namespace', 'storage.type'],
  function: ['entity.name.function', 'support.function', 'variable.function', 'meta.function-call'],
  property: ['variable.other.property', 'variable.other.object.property', 'entity.name.tag'],
  operator: ['keyword.operator', 'punctuation.definition'],
  punctuation: ['punctuation.separator', 'punctuation.definition', 'punctuation'],
  /**
   * variable 故意留空：轻量词法无法判断一个标识符在主题里到底算 variable 还是普通文本
   * （纯文本 / Markdown 里的每个词都会被我们判成 variable），而主题往往把 variable 单独
   * 上了色（如 Dark Modern 的 #9CDCFE 浅蓝）——直接按它取色就会出现「明明是白字却迸出蓝
   * 粒子」。这类「没把握」的标识符统一回退到主题的默认前景色（editor.foreground，也就是
   * 普通文本实际显示的颜色），保证「字什么颜色，特效就什么颜色」。
   */
  variable: [],
};

interface ThemeEntry {
  id: string;
  label: string;
  file: string;
}

/**
 * 读取当前主题的 tokenColors，把「光标处的语法类型」映射成实际颜色。
 *
 * VSCode 不对外暴露查询 token 颜色的命令（只有语义高亮 provider 的注册侧命令），
 * 所以这里直接解析主题 JSON（含 include 继承链）。
 */
export class ThemeTokenColors {
  private data: ThemeData = { colors: {}, tokenColors: [] };
  private loadedTheme = '';
  private loading: Promise<void> | undefined;
  /**
   * token 类型 → 取色结果的缓存。
   * 取色结果只取决于主题数据，而主题数据在两次主题切换之间是稳定的；不缓存的话，
   * 每次按键的每个粒子都会把几百条 tokenColors 规则重新扫一遍，是输入卡顿的主因之一。
   * 命中/未命中都用 null 记录，避免每次都重新计算「确实找不到」的类型。
   */
  private lookupCache = new Map<TokenType, { color: string; scope: string } | null>();
  private tokenForegroundCache: { value: string } | undefined;

  /** 主题变化时重新加载（下次取色时生效） */
  async reload(): Promise<void> {
    this.loadedTheme = '';
    this.invalidate();
    await this.ensure();
  }

  async ensure(): Promise<void> {
    const themeName = vscode.workspace.getConfiguration('workbench').get<string>('colorTheme') ?? '';
    if (themeName === this.loadedTheme && this.data.tokenColors.length > 0) {
      return;
    }
    if (this.loading) {
      return this.loading;
    }
    this.loading = (async () => {
      try {
        const file = this.findThemeFile(themeName);
        this.data = file
          ? this.mergeTheme(file, 0)
          : { colors: {}, tokenColors: [] };
        this.loadedTheme = themeName;
      } catch {
        this.data = { colors: {}, tokenColors: [] };
        this.loadedTheme = themeName;
      } finally {
        this.invalidate();
        this.loading = undefined;
      }
    })();
    return this.loading;
  }

  private invalidate(): void {
    this.lookupCache.clear();
    this.tokenForegroundCache = undefined;
  }

  /** 主题里 editor.foreground 的颜色（作为兜底） */
  get foreground(): string {
    return this.data.colors['editor.foreground'] ?? '';
  }

  /** 按 token 类型取色，取不到返回 undefined */
  lookup(type: TokenType): { color: string; scope: string } | undefined {
    const cached = this.lookupCache.get(type);
    if (cached !== undefined) {
      return cached ?? undefined;
    }
    const result = this.computeLookup(type);
    this.lookupCache.set(type, result ?? null);
    return result;
  }

  private computeLookup(type: TokenType): { color: string; scope: string } | undefined {
    const hints = SCOPE_HINTS[type];
    if (!hints) {
      return undefined;
    }
    // hints 已按「从具体到宽泛」排好序：第一个能命中的提示就是最合适的，
    // 不要在提示之间比分数，否则其它语言的深层 scope 会抢走更贴近的浅层 scope。
    for (const hint of hints) {
      const found = this.matchScope(hint);
      if (found) {
        return { color: found.color, scope: found.scope };
      }
    }
    return undefined;
  }

  /** 主题里 token 的默认前景色（没有 scope 的那条规则） */
  get defaultTokenForeground(): string {
    if (this.tokenForegroundCache) {
      return this.tokenForegroundCache.value;
    }
    let value = '';
    for (let i = this.data.tokenColors.length - 1; i >= 0; i--) {
      const rule = this.data.tokenColors[i];
      if (!rule.scope && rule.settings?.foreground) {
        value = rule.settings.foreground;
        break;
      }
    }
    this.tokenForegroundCache = { value };
    return value;
  }

  get themeName(): string {
    return this.loadedTheme;
  }

  get ruleCount(): number {
    return this.data.tokenColors.length;
  }

  // ---- 内部实现 ----

  /**
   * 为一个 scope 提示找颜色：层级与提示最接近的规则优先（避免命中
   * `storage.type.object.array.java` 这种其它语言的深层 scope），
   * 同层级取靠后的规则（TextMate 里后写覆盖先写）。
   */
  private matchScope(hint: string): { color: string; scope: string } | undefined {
    const hintDepth = hint.split('.').length;
    let best: { color: string; scope: string; distance: number; index: number } | undefined;
    for (let i = 0; i < this.data.tokenColors.length; i++) {
      const rule = this.data.tokenColors[i];
      const color = rule.settings?.foreground;
      if (!color || !rule.scope) {
        continue;
      }
      const selectors = Array.isArray(rule.scope) ? rule.scope : [rule.scope];
      for (const selector of selectors) {
        for (const raw of String(selector).split(',')) {
          const clean = normalizeSelector(raw);
          if (!clean) {
            continue;
          }
          const matched = clean === hint || clean.startsWith(hint + '.') || hint.startsWith(clean);
          if (!matched) {
            continue;
          }
          const distance = Math.abs(clean.split('.').length - hintDepth);
          if (!best || distance < best.distance || (distance === best.distance && i > best.index)) {
            best = { color, scope: clean, distance, index: i };
          }
        }
      }
    }
    return best ? { color: best.color, scope: best.scope } : undefined;
  }

  private findThemeFile(themeName: string): string | undefined {
    const entries = this.collectThemes();
    if (entries.length === 0) {
      return undefined;
    }
    const wanted = [normalizeName(themeName), normalizeName(themeName.replace(/^default\s+/i, ''))];
    const exact = entries.find(
      (e) => wanted.includes(normalizeName(e.id)) || wanted.includes(normalizeName(e.label))
    );
    if (exact) {
      return exact.file;
    }
    const loose = entries.find((e) => {
      const id = normalizeName(e.id);
      const label = normalizeName(e.label);
      return wanted.some((w) => w.length > 2 && (id.includes(w) || w.includes(label)));
    });
    return loose?.file;
  }

  private collectThemes(): ThemeEntry[] {
    const result: ThemeEntry[] = [];
    for (const root of this.extensionRoots()) {
      let dirs: string[] = [];
      try {
        dirs = fs.readdirSync(root).filter((d) => !d.startsWith('.'));
      } catch {
        continue;
      }
      for (const dir of dirs) {
        const pkgFile = path.join(root, dir, 'package.json');
        try {
          if (!fs.existsSync(pkgFile)) {
            continue;
          }
          const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
          const themes = pkg?.contributes?.themes;
          if (!Array.isArray(themes)) {
            continue;
          }
          for (const theme of themes) {
            if (!theme?.path) {
              continue;
            }
            result.push({
              id: String(theme.id ?? theme.label ?? ''),
              label: String(theme.label ?? ''),
              file: path.resolve(path.join(root, dir), theme.path),
            });
          }
        } catch {
          // 单个扩展包异常不影响整体
        }
      }
    }
    return result;
  }

  private extensionRoots(): string[] {
    const roots = [path.join(vscode.env.appRoot, 'extensions')];
    const home = os.homedir();
    for (const dir of ['.vscode', '.vscode-insiders', '.vscode-oss', '.vscode-server', '.vscode-remote']) {
      const candidate = path.join(home, dir, 'extensions');
      if (fs.existsSync(candidate)) {
        roots.push(candidate);
      }
    }
    return roots;
  }

  private mergeTheme(file: string, depth: number): ThemeData {
    if (depth > 12 || !fs.existsSync(file)) {
      return { colors: {}, tokenColors: [] };
    }
    let json: { include?: string; colors?: Record<string, string>; tokenColors?: TokenRule[] };
    try {
      json = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return { colors: {}, tokenColors: [] };
    }

    let base: ThemeData = { colors: {}, tokenColors: [] };
    if (json.include) {
      let includePath = path.resolve(path.dirname(file), json.include);
      if (!fs.existsSync(includePath) && !includePath.endsWith('.json')) {
        includePath += '.json';
      }
      base = this.mergeTheme(includePath, depth + 1);
    }

    return {
      colors: { ...base.colors, ...(json.colors ?? {}) },
      tokenColors: [...base.tokenColors, ...(json.tokenColors ?? [])],
    };
  }
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** 去掉 `L:lang` / 排除 `-` 前缀，复合选择器只取最后一段 */
function normalizeSelector(selector: string): string {
  const parts = selector
    .replace(/^L:[a-z0-9-]+\s*/i, '')
    .replace(/^-/, '')
    .trim()
    .split(/\s+/)
    .filter((p) => !p.startsWith('-'));
  return parts[parts.length - 1] ?? '';
}
