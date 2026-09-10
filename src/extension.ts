import * as vscode from 'vscode';
import {
  AttachmentOptions,
  ColorMode,
  Particle,
  ParticlePreset,
  PRESETS,
  PRESET_NAMES,
  PresetName,
  randomColor,
  spawnBurst,
} from './particles';
import { classifyToken, TokenColorHint } from './tokenizer';
import { ThemeTokenColors } from './themeColors';

const FALLBACK_COLOR = '#ffcc00';
/**
 * 「选择颜色」命令的候选色板。
 * VS Code 的设置界面不会为普通字符串项渲染色块（`format: color-hex` 只做取值校验，
 * 编辑 settings.json 时才会出现原生取色器），所以自己提供一个色板 + 自定义输入。
 */
const COLOR_PALETTE: readonly { hex: string; name: string }[] = [
  { hex: '#ffcc00', name: '金黄' },
  { hex: '#ff9500', name: '橙色' },
  { hex: '#ff3b30', name: '红色' },
  { hex: '#ff2d95', name: '玫红' },
  { hex: '#af52de', name: '紫色' },
  { hex: '#5856d6', name: '靛蓝' },
  { hex: '#007aff', name: '蓝色' },
  { hex: '#32ade6', name: '天蓝' },
  { hex: '#00c7be', name: '青色' },
  { hex: '#34c759', name: '绿色' },
  { hex: '#a2d729', name: '黄绿' },
  { hex: '#ffffff', name: '白色' },
  { hex: '#c7c7cc', name: '浅灰' },
  { hex: '#8e8e93', name: '灰色' },
];
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
/** 粒子相对锚点的最大水平位移，超出即可回收 */
const MAX_OFFSET_X = 140;
/** 透明度低于该值即可回收 */
const KILL_ALPHA = 0.05;
/**
 * 单帧最大时间步长(ms)：标签页切回 / 断点挂起后不要一次性补一大段物理，
 * 否则粒子会瞬移；截断一下让它们平滑地继续飘。
 */
const MAX_FRAME_MS = 100;
/** 抖动持续时间(ms) */
const SHAKE_DURATION = 75;
/**
 * 输入法组字判定窗口(ms)：两次「替换型编辑」间隔小于该值就认为还在组字。
 * 拼音组字每敲一键都会整段替换一次，间隔很短；落字后就会超过这个窗口。
 */
const COMPOSE_IDLE_MS = 250;
/** 纯 ASCII：拼音组字阶段的文本一定是 ASCII，真正落字（中文/日文…）必然带非 ASCII 字符 */
const ASCII_ONLY = /^[\x00-\x7F]*$/;
/**
 * 状态栏 tooltip 的合并刷新间隔(ms)。tooltip 里的「最近取色」每键都在变，但只有用户悬停时
 * 才看得到；打字时每键都重建一遍整段字符串再推给渲染进程纯属浪费。
 */
const STATUS_TOOLTIP_MS = 150;
/**
 * 输入压力判定窗口(ms)与阈值(次)。窗口内编辑次数达到阈值即视为「长按 / 连打」：
 * 人手舒适连打约 8~10 次/秒，而系统按键重复率可达 25~30 次/秒，用 500ms 内 8 次
 * 作分界，正常打字几乎不会触发，长按则稳定命中。
 */
const PRESSURE_WINDOW_MS = 500;
const PRESSURE_MIN_EDITS = 8;
/** 降载期间允许的最高帧率档：再高对观感无益，却成倍放大每帧的装饰器渲染量 */
const PRESSURE_MAX_FPS = 30;
/** 降载期间存活粒子上限的缩放比 */
const PRESSURE_MAX_RATIO = 0.5;
/** 降载期间单次迸发粒子数的缩放比 */
const PRESSURE_BURST_RATIO = 0.5;
/**
 * 渲染预算基准帧率。渲染开销 ≈ 粒子数 × 帧率，所以帧率越高，粒子预算越要按比例收缩，
 * 否则「调高帧率」会等比例放大每帧的装饰器推送量——这正是 60fps 反而比 30fps 更容易卡
 * 的根源。以 30fps 为基准（用户认可的丝滑档），收缩设下限 0.6，免得高帧率下粒子太稀；
 * 30fps 及以下完全不受影响。
 */
const RENDER_BUDGET_FPS = 30;
const RENDER_BUDGET_MIN_RATIO = 0.6;
/** 同时存在的粒子上限，超出后回收最早的粒子 */
const MAX_PARTICLES = 200;
/** 连击：每累计多少个字符提升一级（倍率 +0.25） */
const COMBO_STEP = 12;

interface PowerModeConfig {
  enabled: boolean;
  preset: PresetName;
  colorMode: ColorMode;
  color: string;
  fps: number;
  comboEnabled: boolean;
  comboMaxMultiplier: number;
  shake: boolean;
  shakeIntensity: number;
  excludeLanguages: string[];
  showStatusBar: boolean;
}

function readConfig(): PowerModeConfig {
  const c = vscode.workspace.getConfiguration('powermode');
  const preset = c.get<string>('preset', 'particles');
  const colorMode = c.get<string>('colorMode', 'code');
  return {
    enabled: c.get<boolean>('enabled', true),
    preset: (PRESET_NAMES as string[]).includes(preset) ? (preset as PresetName) : 'particles',
    colorMode: colorMode === 'rainbow' || colorMode === 'fixed' ? colorMode : 'code',
    color: c.get<string>('color', FALLBACK_COLOR),
    fps: clampNumber(c.get<number>('fps', 30), 10, 120, 30),
    comboEnabled: c.get<boolean>('combo.enabled', true),
    comboMaxMultiplier: Math.max(1, c.get<number>('combo.maxMultiplier', 2.5)),
    shake: c.get<boolean>('shake', false),
    shakeIntensity: Math.max(0, c.get<number>('shakeIntensity', 0.6)),
    excludeLanguages: c.get<string[]>('excludeLanguages', []),
    showStatusBar: c.get<boolean>('showStatusBar', true),
  };
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

/** 量化到 step 的整数倍，避免每帧生成海量只差小数点后一位的装饰器子类型 */
function quantize(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * 锚点区间：优先取「光标右边那个字符」，这样 `::before` 的起点正好落在光标处。
 * 区间必须留在同一行内——跨行的区间会让被注入的样式落到下一行的首字符上。
 * 光标在行尾时退到前一个字符，行首空行只能给零宽区间。
 */
function anchorRange(document: vscode.TextDocument, offset: number): vscode.Range {
  const safe = Math.max(0, offset);
  const pos = document.positionAt(safe);
  const line = document.lineAt(pos.line);
  if (pos.character < line.text.length) {
    return new vscode.Range(pos, pos.translate(0, 1));
  }
  if (pos.character > 0) {
    return new vscode.Range(pos.translate(0, -1), pos);
  }
  return new vscode.Range(pos, pos);
}

/** 把 offset 夹进文档有效范围：组字特效是延迟补发的，这期间文档可能已经被改动 */
function clampOffset(document: vscode.TextDocument, offset: number): number {
  const end = document.offsetAt(document.lineAt(document.lineCount - 1).range.end);
  return Math.min(Math.max(offset, 0), end);
}

class PowerModeRunner implements vscode.Disposable {
  private readonly particles: Particle[] = [];
  private readonly tokenColors = new ThemeTokenColors();
  private readonly statusItem: vscode.StatusBarItem;
  private readonly decorationType: vscode.TextEditorDecorationType;
  private readonly shakeTypes = new Map<string, vscode.TextEditorDecorationType>();
  private readonly decoratedUris = new Set<string>();

  private config: PowerModeConfig;
  private preset: ParticlePreset;
  private timer: NodeJS.Timeout | undefined;
  /** 上一帧的时间戳(ms)，0 表示帧循环刚起步，用名义帧长兜底 */
  private lastTickAt = 0;
  /** 自校正排程的下一次目标时刻(ms)，0 表示需要重新基准 */
  private nextTickAt = 0;
  private combo = 0;
  private multiplier = 1;
  /**
   * 最近一段时间每次输入的到达时刻，用来识别「长按 / 连打」，同时兼作连击的空闲判定。
   * 只在输入时追加、每帧裁剪，数组长度受窗口与重复率限制，恒为个位数。
   */
  private readonly inputTimes: number[] = [];
  /** 当前是否处于降载状态（输入压力大），由输入与每帧刷新 */
  private pressure = false;
  private lastColor = '';
  private lastScope = '';
  private shakeActive: { editor: vscode.TextEditor; type: vscode.TextEditorDecorationType; timer: NodeJS.Timeout } | undefined;
  /** 是否正处于输入法组字中（组字期间一律不放装饰、不出特效） */
  private composing = false;
  private composeTimer: NodeJS.Timeout | undefined;
  private composeOffset = 0;
  /** 上次真正写入状态栏的文本，用于跳过内容未变的重复赋值（每次赋值都是一次 IPC） */
  private statusText = '';
  private statusTooltipTimer: NodeJS.Timeout | undefined;
  private disposed = false;

  constructor() {
    this.config = readConfig();
    this.preset = PRESETS[this.config.preset];
    this.statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusItem.command = 'powermode.toggle';
    // 所有粒子共用一个基础装饰器类型，具体外观靠逐粒子的 renderOptions 生成子类型。
    // 刻意不在这里注入类型级样式：粒子的定位完全由伪元素自己的 position:relative 相对
    // 「被装饰字符」完成，不依赖任何外部定位上下文，所以给行或字符 span 加样式没有意义。
    this.decorationType = vscode.window.createTextEditorDecorationType({
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    void this.tokenColors.ensure();
    this.updateStatus();
  }

  // ---- 对外命令 ----

  async toggle(): Promise<void> {
    await this.setEnabled(!this.config.enabled);
  }

  async setEnabled(value: boolean): Promise<void> {
    await vscode.workspace
      .getConfiguration('powermode')
      .update('enabled', value, vscode.ConfigurationTarget.Global);
    vscode.window.setStatusBarMessage(`Power Mode 已${value ? '开启' : '关闭'}`, 2000);
  }

  async selectPreset(): Promise<void> {
    const picked = await vscode.window.showQuickPick(
      PRESET_NAMES.map((name) => ({ label: name, description: describePreset(name) })),
      { placeHolder: '选择打字特效风格' }
    );
    if (!picked) {
      return;
    }
    await vscode.workspace
      .getConfiguration('powermode')
      .update('preset', picked.label, vscode.ConfigurationTarget.Global);
  }

  /** 命令：挑选固定颜色（色板 + 自定义输入） */
  async selectColor(): Promise<void> {
    const current = (this.config.color || FALLBACK_COLOR).toLowerCase();
    const customLabel = '自定义…';
    const items: vscode.QuickPickItem[] = [
      ...COLOR_PALETTE.map((entry) => ({
        label: entry.name,
        description: entry.hex,
        detail: entry.hex === current ? '当前使用' : undefined,
      })),
      { label: customLabel, description: '手动输入 #RRGGBB' },
    ];
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `选择特效颜色（当前 ${current}）`,
    });
    if (!picked) {
      return;
    }

    let color = picked.label === customLabel ? '' : picked.description ?? '';
    if (!color) {
      const input = await vscode.window.showInputBox({
        prompt: '输入十六进制颜色',
        value: current,
        validateInput: (value) => (HEX_COLOR.test(value.trim()) ? undefined : '格式如 #ffcc00'),
      });
      if (!input) {
        return;
      }
      color = input.trim();
    }

    const config = vscode.workspace.getConfiguration('powermode');
    await config.update('color', color, vscode.ConfigurationTarget.Global);
    // 固定颜色只在 fixed 模式下生效，顺手切过去，免得用户选完发现没变化
    if (this.config.colorMode !== 'fixed') {
      await config.update('colorMode', 'fixed', vscode.ConfigurationTarget.Global);
    }
    vscode.window.setStatusBarMessage(`Power Mode 特效颜色已设为 ${color}`, 2000);
  }

  async showTokenColor(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('Power Mode: 当前没有打开的编辑器');
      return;
    }
    await this.tokenColors.ensure();
    const hint = classifyToken(editor.document, editor.selection.active);
    const hit = this.tokenColors.lookup(hint.type);
    const color = hit?.color ?? this.fallbackColor;
    const parts = [
      `语法类型：${hint.type}${hint.word ? `（${hint.word}）` : ''}`,
      `命中 scope：${hit?.scope ?? '(未命中，用默认前景色)'}`,
      `取到的颜色：${color}`,
      `颜色模式：${this.config.colorMode}`,
      `主题：${this.tokenColors.themeName || '(未知)'}，规则数：${this.tokenColors.ruleCount}`,
    ];
    vscode.window.showInformationMessage(parts.join('\n'), { modal: true });
  }

  // ---- 事件 ----

  onDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    if (!this.config.enabled || this.disposed) {
      return;
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.toString() !== event.document.uri.toString()) {
      return;
    }
    if (this.config.excludeLanguages.includes(event.document.languageId)) {
      return;
    }
    // 文档一改，驻留粒子的锚点就过期了：锚点是绝对字符偏移，而删除会把后面的文本整体
    // 左移。若不修正，旧粒子相对文本会向右漂移，连按删除时会漂过换行、落到后续行的行首，
    // 看起来就是「快删时行首冒出烟花」。这里先按本次改动把锚点映射到新文档坐标，
    // 再处理本次按键（新迸发的粒子用的是新坐标，不能再被映射）。
    this.remapParticles(event.document.uri.toString(), event.contentChanges);
    for (const change of event.contentChanges) {
      const start = change.rangeOffset;
      const end = start + change.text.length;
      if (change.rangeLength === 0 || change.text.length === 0) {
        // 纯插入 / 纯删除：普通打字与退格。输入：锚点取插入文本的末尾；删除：change.text
        // 为空，锚点取被删区间的起点。两者都是「光标最终所在的位置」，因此删除同样会迸发特效。
        this.endComposition();
        this.explode(editor, change.text.length === 0 ? start : end);
        continue;
      }
      // 剩下的都是「替换型编辑」。输入法组字时，编辑器每敲一键都会把上一次的拼音整段
      // 替换成新的拼音：起点不变、旧文本被更长的新文本顶掉。组字期间绝不能放装饰——
      // 每帧 setDecorations 都会重排组字所在行，打断编辑器组字覆盖层（textarea 的
      // .inputarea.ime-input / EditContext 的 characterboundsupdate）对字符边界的测量，
      // 症状就是「突然冒出一条很长的文本框」，输入停下来之后才慢慢收拢成正常文本。
      if (!ASCII_ONLY.test(change.text)) {
        // 落进文档的是非 ASCII 文本 = 组字已提交（中文/日文…），这时才爆一次。
        this.endComposition();
        this.explode(editor, end);
      } else {
        // 还是纯 ASCII，分不清是「仍在组字」还是「输入法直接落了英文」，先按住不出特效。
        this.deferExplode(editor, end);
      }
    }
  }

  /**
   * 把驻留粒子的锚点从「改动前的文档坐标」映射到「改动后的坐标」。
   *
   * VSCode 的 contentChanges 全部相对改动前的文档，所以按起点升序逐个套用到每个粒子：
   * - 改动落在锚点之后（rangeOffset >= 锚点）→ 不影响，后面的改动只会更靠后，直接结束；
   * - 锚点落在改动之后（锚点 >= rangeOffset + rangeLength）→ 整体平移 (新文本长度 - 删除长度)；
   * - 锚点落在被删 / 被替换的区间内 → 贴到改动起点右侧插入文本的对应位置。
   */
  private remapParticles(
    uri: string,
    changes: readonly vscode.TextDocumentContentChangeEvent[]
  ): void {
    if (this.particles.length === 0 || changes.length === 0) {
      return;
    }
    const sorted = [...changes].sort((a, b) => a.rangeOffset - b.rangeOffset);
    for (const p of this.particles) {
      if (p.uri !== uri) {
        continue;
      }
      const from = p.offset;
      let shift = 0;
      let clamped: number | undefined;
      for (const c of sorted) {
        if (c.rangeOffset >= from) {
          break;
        }
        if (from >= c.rangeOffset + c.rangeLength) {
          shift += c.text.length - c.rangeLength;
        } else {
          clamped = c.rangeOffset + Math.min(from - c.rangeOffset, c.text.length);
        }
      }
      p.offset = Math.max(0, clamped !== undefined ? clamped : from + shift);
    }
  }

  /**
   * 组字期间的兜底：拼音本身也是 ASCII，光看文本判断不出组字是否结束，所以先按住不动，
   * 等输入停顿（COMPOSE_IDLE_MS 内没有新的替换）再补一次特效。
   * 同时把已有粒子和装饰全部收掉并暂停渲染，保证组字期间编辑器 DOM 里没有我们的任何东西。
   */
  private deferExplode(editor: vscode.TextEditor, offset: number): void {
    if (!this.composing) {
      this.composing = true;
      this.clearAll();
    }
    this.composeOffset = offset;
    if (this.composeTimer) {
      clearTimeout(this.composeTimer);
    }
    this.composeTimer = setTimeout(() => {
      this.composeTimer = undefined;
      this.composing = false;
      if (this.disposed || !this.config.enabled) {
        return;
      }
      this.explode(editor, clampOffset(editor.document, this.composeOffset));
    }, COMPOSE_IDLE_MS);
  }

  /** 结束组字状态并取消挂起的补发特效 */
  private endComposition(): void {
    if (this.composeTimer) {
      clearTimeout(this.composeTimer);
      this.composeTimer = undefined;
    }
    this.composing = false;
  }

  async onConfigChange(event: vscode.ConfigurationChangeEvent): Promise<void> {
    if (!event.affectsConfiguration('powermode')) {
      return;
    }
    const wasEnabled = this.config.enabled;
    this.config = readConfig();
    this.preset = PRESETS[this.config.preset];
    if (wasEnabled && !this.config.enabled) {
      this.clearAll();
    }
    this.updateStatus();
  }

  async onThemeChange(): Promise<void> {
    await this.tokenColors.reload();
    this.updateStatus();
  }

  // ---- 爆炸与取色 ----

  private explode(editor: vscode.TextEditor, offset: number): void {
    const document = editor.document;
    const now = Date.now();
    this.markInput(now);
    const pressure = this.computePressure(now);
    this.pressure = pressure;

    // 连击空闲判定直接复用输入窗口：窗口里只剩刚记下的这一次输入，说明上一次输入已被
    // 裁掉（间隔超过窗口），连击重新起算。不再单独维护一个「连击超时」配置。
    if (this.inputTimes.length <= 1) {
      this.combo = 0;
    }
    this.combo++;
    this.multiplier = this.config.comboEnabled
      ? Math.min(1 + Math.floor(this.combo / COMBO_STEP) * 0.25, this.config.comboMaxMultiplier)
      : 1;

    const hint = classifyToken(document, document.positionAt(offset));
    const resolved = this.resolveColor(hint);
    const burst = spawnBurst(this.preset, {
      uri: document.uri.toString(),
      offset,
      // 连击倍率最高会把每次迸发的粒子放大 2.5 倍，长按时这个倍率必然顶格——它正是
      // 卡顿的放大器。降载期间不放大，但计数照常累加，松手后倍率原样恢复。
      multiplier: pressure ? 1 : this.multiplier,
      countScale: pressure ? PRESSURE_BURST_RATIO : 1,
      color: resolved.color,
      rainbowChance: resolved.rainbowChance,
      rainbowColor: randomColor,
    });

    this.particles.push(...burst);
    const max = this.renderBudget(pressure);
    const overflow = this.particles.length - max;
    if (overflow > 0) {
      this.particles.splice(0, overflow);
    }

    // 抖动要整行重排、还要为每次按键挂一个定时器，是单键最贵的特效；降载期间跳过。
    if (!pressure && this.config.shake && this.config.shakeIntensity > 0) {
      this.applyShake(editor);
    }
    this.schedule();
    this.updateStatus();
  }

  // ---- 输入压力与降载 ----

  /** 记录一次输入到达时刻，顺带丢掉滑出窗口的旧样本 */
  private markInput(now: number): void {
    this.inputTimes.push(now);
    this.pruneInputs(now);
  }

  private pruneInputs(now: number): void {
    const cutoff = now - PRESSURE_WINDOW_MS;
    let drop = 0;
    while (drop < this.inputTimes.length && this.inputTimes[drop] < cutoff) {
      drop++;
    }
    if (drop > 0) {
      this.inputTimes.splice(0, drop);
    }
  }

  /** 长按 / 连打判定：窗口内编辑足够密集就降载，输入一停自然回落 */
  private computePressure(now: number): boolean {
    this.pruneInputs(now);
    return this.inputTimes.length >= PRESSURE_MIN_EDITS;
  }

  /**
   * 本帧允许存活的粒子上限：把「粒子数 × 帧率」当作渲染预算来守。
   * 高帧率下自动收缩粒子数（观感上换来的是更顺的采样），长按时再在预算上砍一半。
   */
  private renderBudget(pressure: boolean): number {
    const fpsRatio = Math.min(
      1,
      Math.max(RENDER_BUDGET_MIN_RATIO, RENDER_BUDGET_FPS / this.config.fps)
    );
    const factor = fpsRatio * (pressure ? PRESSURE_MAX_RATIO : 1);
    return Math.max(20, Math.round(MAX_PARTICLES * factor));
  }

  private get fallbackColor(): string {
    return this.tokenColors.foreground || this.tokenColors.defaultTokenForeground || FALLBACK_COLOR;
  }

  /**
   * 解析本次迸发使用的基础颜色与彩虹概率。
   * code 模式下只查一次主题表（表本身也有缓存），不再逐粒子查询。
   */
  private resolveColor(hint: TokenColorHint): { color: string; rainbowChance: number } {
    if (this.config.colorMode === 'fixed') {
      return { color: this.config.color || FALLBACK_COLOR, rainbowChance: 0 };
    }
    if (this.config.colorMode === 'rainbow') {
      return { color: FALLBACK_COLOR, rainbowChance: 1 };
    }
    // code：跟随语法高亮颜色，风格自身也可以按比例混入随机彩虹色
    const rainbowChance = this.preset.rainbow ?? 0;
    const hit = this.tokenColors.lookup(hint.type);
    if (hit) {
      this.lastColor = hit.color;
      this.lastScope = hit.scope;
      return { color: hit.color, rainbowChance };
    }
    this.lastColor = this.fallbackColor;
    this.lastScope = '(默认)';
    return { color: this.lastColor, rainbowChance };
  }

  // ---- 帧循环 ----

  private schedule(): void {
    if (this.timer || this.disposed) {
      return;
    }
    // 降载期间把帧率压到 30 档：短时间窗口内人眼分辨不出 60 与 30 的差别，但每帧的
    // 装饰器推送量直接减半——这是长按卡顿最直接的缓解手段（用户配置本就低于 30 时
    // 不动它）。物理按真实 dt 推进，降到 30 帧不会让动作变慢，只是采样变稀。
    const fps = this.pressure ? Math.min(this.config.fps, PRESSURE_MAX_FPS) : this.config.fps;
    const interval = Math.max(1000 / fps, 8);
    const now = Date.now();
    // 自校正排程：按固定节拍对齐下一次触发，抵消 setTimeout 的误差累积（否则帧间隔
    // 一路抖动，观感就是发顿）。若已落后超过两拍（挂起 / 断点 / 系统卡顿），重新基准，
    // 不做补帧，避免恢复瞬间的补帧风暴。
    if (this.nextTickAt === 0 || now - this.nextTickAt > interval * 2) {
      this.nextTickAt = now + interval;
    } else {
      this.nextTickAt += interval;
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.tick();
    }, Math.max(0, this.nextTickAt - now));
  }

  private tick(): void {
    // 用真实经过时间推进物理：setTimeout 的实际间隔会随负载抖动，若按名义帧率假死换算，
    // 动作会时快时慢、看起来发顿。这里按真实 dt 换算成 60fps 基准的步数，并把超长间隔
    // 截断（切回标签页 / 断点恢复时不要一次性补一大段，否则粒子瞬移）。
    const now = Date.now();
    // 每帧重算输入压力：输入一停，窗口内样本自然滑空，下一帧就自动回到全质量，
    // 不用额外挂一个「松手」定时器。
    this.pressure = this.computePressure(now);
    const dt = this.lastTickAt === 0 ? 1000 / this.config.fps : now - this.lastTickAt;
    this.lastTickAt = now;
    const step = Math.min(dt, MAX_FRAME_MS) / (1000 / 60);

    const visibleUris = new Set(
      vscode.window.visibleTextEditors.map((e) => e.document.uri.toString())
    );

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (!visibleUris.has(p.uri)) {
        this.particles.splice(i, 1);
        continue;
      }
      if (!p.fixed) {
        p.x += p.vx * step;
        p.y += p.vy * step;
        p.vy += p.gravity * step;
      }
      p.alpha *= Math.pow(p.decay, step);
      if (
        p.alpha < KILL_ALPHA ||
        p.y > 260 ||
        p.y < -260 ||
        p.x < -MAX_OFFSET_X ||
        p.x > MAX_OFFSET_X
      ) {
        this.particles.splice(i, 1);
      }
    }

    // 输入一停（窗口滑空）就清掉连击，状态栏不用等到下一次按键才回落。
    if (this.combo > 0 && this.inputTimes.length === 0) {
      this.combo = 0;
      this.multiplier = 1;
      this.updateStatus();
    }

    this.render();
    if (this.particles.length > 0) {
      this.schedule();
    } else {
      // 粒子放完即停：清掉时间基准，下一次迸发从「上一帧」重新起算
      this.lastTickAt = 0;
      this.nextTickAt = 0;
    }
  }

  private render(): void {
    if (this.composing) {
      // 组字进行中：一个装饰都不放（粒子已在进入组字时清空），避免干扰输入法
      return;
    }
    // 先按文档分组，再逐编辑器渲染：同一帧里同一次迸发的粒子共享锚点区间，
    // 避免每个粒子都重新 positionAt/lineAt 一次（200 粒子 × 30fps 相当可观）。
    const byUri = new Map<string, Particle[]>();
    for (const p of this.particles) {
      const list = byUri.get(p.uri);
      if (list) {
        list.push(p);
      } else {
        byUri.set(p.uri, [p]);
      }
    }

    const visible = new Set<string>();
    for (const editor of vscode.window.visibleTextEditors) {
      const uri = editor.document.uri.toString();
      visible.add(uri);
      const list = byUri.get(uri);
      if (list && list.length > 0) {
        const document = editor.document;
        const anchors = new Map<number, vscode.Range>();
        const options: vscode.DecorationOptions[] = new Array(list.length);
        for (let i = 0; i < list.length; i++) {
          options[i] = this.toDecoration(list[i], document, anchors);
        }
        editor.setDecorations(this.decorationType, options);
        this.decoratedUris.add(uri);
      } else if (this.decoratedUris.delete(uri)) {
        editor.setDecorations(this.decorationType, []);
      }
    }
    for (const uri of [...this.decoratedUris]) {
      if (!visible.has(uri)) {
        this.decoratedUris.delete(uri);
      }
    }
  }

  private toDecoration(
    p: Particle,
    document: vscode.TextDocument,
    anchors: Map<number, vscode.Range>
  ): vscode.DecorationOptions {
    let range = anchors.get(p.offset);
    if (!range) {
      range = anchorRange(document, p.offset);
      anchors.set(p.offset, range);
    }
    // 降载期间放大量化步长：VSCode 会为每一组不同的 renderOptions 生成一个 CSS 类，
    // 并在每帧把用到的类注入样式表。步长放大后，同一帧内更多粒子落进同一个类，
    // 渲染进程需要处理的类集合随之变小，样式注入与回收的开销一起下降。
    const coarse = this.pressure;
    const radius = quantize(p.size / 2, coarse ? 0.5 : 0.25);
    const x = quantize(p.x, coarse ? 1 : 0.5);
    const y = quantize(p.y, coarse ? 1 : 0.5);
    const alpha = quantize(p.alpha, coarse ? 0.05 : 0.02);
    // VSCode 的装饰器只白名单化了一小部分 CSS（position / left / top / z-index /
    // box-shadow 都不在里面），但 text-decoration 的值会被「原样字符串拼接、不转义」，
    // 所以这里借它注入定位与绘制声明。
    //
    // 定位必须用 position:relative，不能用 absolute：`::before` 挂在与光标同一个字符的
    // span 上，而那个字符 span 没有建立包含块，absolute 会一路回退到 .view-line，left
    // 就从整行最左边算起——这正是「特效全挤在行首」的原因。relative 则是相对伪元素自己
    // 的自然位置偏移，而它的自然位置就在被装饰字符的左边缘，也就是光标处，与外部定位
    // 上下文完全无关。
    //
    // 盒子做成 0×0（设了 width/height 后 VS Code 会自动补 display:inline-block），圆点交给
    // box-shadow 的扩散半径来画：0×0 的盒子向外扩散 r 正好得到半径 r 的圆（border-radius
    // 也会随扩散一起放大）。这样伪元素不占宽度、不撑行高，正文排版完全不受影响。
    // 复用粒子自带的装饰器对象：只在首次渲染时分配，之后每帧只改写 CSS 字符串，
    // 避免每帧为每个粒子重建 options / renderOptions / before 三份对象。
    let cache = p.renderCache;
    if (!cache) {
      const before: AttachmentOptions = {
        contentText: '',
        width: '0px',
        height: '0px',
        borderRadius: '50%',
        opacity: '1.00',
        textDecoration: '',
      };
      cache = { options: { range, renderOptions: { before } }, before };
      p.renderCache = cache;
    }
    const before = cache.before;
    // 必须是字符串：底层的 collectCSSText 只写入字符串值，数字会被静默丢弃
    before.opacity = alpha.toFixed(2);
    before.textDecoration =
      'none;position:relative;' +
      `left:${x.toFixed(2)}px;top:calc(-0.35em + ${y.toFixed(2)}px);` +
      `box-shadow:0 0 0 ${radius.toFixed(2)}px ${p.color};` +
      'pointer-events:none;';
    // 锚点区间会随文档改动漂移（连按删除时同一个 offset 指向的文本一直在变），每帧刷新
    const options = cache.options;
    options.range = range;
    return options;
  }

  // ---- 抖动 ----

  private applyShake(editor: vscode.TextEditor): void {
    const intensity = this.config.shakeIntensity;
    const dx = quantize(intensity * (1 + Math.random()) * (Math.random() > 0.5 ? 1 : -1), 0.5);
    const dy = quantize(intensity * 0.6 * (1 + Math.random()) * (Math.random() > 0.5 ? 1 : -1), 0.5);
    const type = this.shakeType(dx, dy);
    const line = editor.document.lineAt(Math.min(editor.selection.active.line, editor.document.lineCount - 1));
    this.clearShake();
    editor.setDecorations(type, [line.range]);
    const timer = setTimeout(() => {
      editor.setDecorations(type, []);
      if (this.shakeActive?.timer === timer) {
        this.shakeActive = undefined;
      }
    }, SHAKE_DURATION);
    this.shakeActive = { editor, type, timer };
  }

  private shakeType(dx: number, dy: number): vscode.TextEditorDecorationType {
    const key = `${dx}|${dy}`;
    const cached = this.shakeTypes.get(key);
    if (cached) {
      return cached;
    }
    // 行首插入一个零宽附件，靠 margin-left 把整行文字推开一点，模拟原版 POWERMODE 的 shake
    const before: AttachmentOptions = {
      contentText: ' ',
      width: '0px',
      height: '0px',
      margin: `0px 0px 0px ${dx}px`,
      verticalAlign: `${dy}px`,
    };
    const type = vscode.window.createTextEditorDecorationType({ before });
    this.shakeTypes.set(key, type);
    return type;
  }

  private clearShake(): void {
    if (this.shakeActive) {
      clearTimeout(this.shakeActive.timer);
      this.shakeActive.editor.setDecorations(this.shakeActive.type, []);
      this.shakeActive = undefined;
    }
  }

  // ---- 状态栏与清理 ----

  private updateStatus(): void {
    if (!this.config.showStatusBar) {
      if (this.statusText) {
        this.statusText = '';
        this.statusItem.hide();
      }
      return;
    }
    // 状态栏只放一个图标：风格 / 配色 / 取色这些都收进 hover tooltip，避免占掉太多状态栏宽度
    const icon = this.config.enabled ? '$(zap)' : '$(circle-slash)';
    if (icon !== this.statusText) {
      this.statusText = icon;
      this.statusItem.text = icon;
      this.statusItem.show();
    }
    this.scheduleTooltip();
  }

  /** tooltip 合帧刷新：连打时把多次更新并成一次 */
  private scheduleTooltip(): void {
    if (this.statusTooltipTimer) {
      return;
    }
    this.statusTooltipTimer = setTimeout(() => {
      this.statusTooltipTimer = undefined;
      this.refreshTooltip();
    }, STATUS_TOOLTIP_MS);
  }

  private refreshTooltip(): void {
    if (!this.config.showStatusBar || this.disposed) {
      return;
    }
    const mode =
      this.config.colorMode === 'code'
        ? '跟随代码颜色'
        : this.config.colorMode === 'rainbow'
        ? '彩虹'
        : `固定 ${this.config.color}`;
    this.statusItem.tooltip = [
      `状态：${this.config.enabled ? '已开启' : '已关闭'}`,
      `风格：${this.config.preset}`,
      `配色：${mode}`,
      `最近取色：${this.lastColor || '-'}${this.lastScope ? ` （${this.lastScope}）` : ''}`,
      '',
      '单击可开启 / 关闭',
    ].join('\n');
  }

  private clearAll(): void {
    this.clearShake();
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(this.decorationType, []);
    }
    this.decoratedUris.clear();
    this.particles.length = 0;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.lastTickAt = 0;
    this.nextTickAt = 0;
    this.inputTimes.length = 0;
    this.pressure = false;
    this.combo = 0;
    this.multiplier = 1;
    this.updateStatus();
  }

  dispose(): void {
    this.disposed = true;
    this.endComposition();
    this.clearAll();
    if (this.statusTooltipTimer) {
      clearTimeout(this.statusTooltipTimer);
      this.statusTooltipTimer = undefined;
    }
    for (const type of this.shakeTypes.values()) {
      type.dispose();
    }
    this.shakeTypes.clear();
    this.statusItem.dispose();
    this.decorationType.dispose();
  }
}

function describePreset(name: PresetName): string {
  switch (name) {
    case 'particles':
      return '经典：少量粒子向上飘散（POWERMODE 原版手感）';
    case 'fireworks':
      return '烟花：大量粒子向四周炸开';
    case 'flames':
      return '火焰：向上喷射的火焰粒子';
    case 'magic':
      return '魔法：细腻的星尘，颜色更随机';
    case 'explosion':
      return '爆裂：超大量粒子的强烈爆炸';
    default:
      return '';
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const runner = new PowerModeRunner();
  context.subscriptions.push(
    runner,
    vscode.commands.registerCommand('powermode.toggle', () => runner.toggle()),
    vscode.commands.registerCommand('powermode.enable', () => runner.setEnabled(true)),
    vscode.commands.registerCommand('powermode.disable', () => runner.setEnabled(false)),
    vscode.commands.registerCommand('powermode.selectPreset', () => runner.selectPreset()),
    vscode.commands.registerCommand('powermode.selectColor', () => runner.selectColor()),
    vscode.commands.registerCommand('powermode.showTokenColor', () => runner.showTokenColor()),
    vscode.workspace.onDidChangeTextDocument((e) => runner.onDocumentChange(e)),
    vscode.workspace.onDidChangeConfiguration((e) => void runner.onConfigChange(e)),
    vscode.window.onDidChangeActiveColorTheme(() => void runner.onThemeChange())
  );
}

export function deactivate(): void {
  // 资源已在 context.subscriptions 中释放
}
