import * as vscode from 'vscode';

/**
 * 装饰器附件的可用 CSS 字段。
 *
 * VSCode 官方 d.ts 里 ThemableDecorationAttachmentRenderOptions 只声明了部分字段，
 * 但底层实现（workbench 的 getCSSTextForModelDecorationContentClassName +
 * collectBorderSettingsCSSText）实际还会把 borderRadius / opacity / padding /
 * verticalAlign / letterSpacing 写进 `.ced-xxx::after` 的样式里，所以这里做一下扩展声明。
 */
export interface AttachmentOptions extends vscode.ThemableDecorationAttachmentRenderOptions {
  borderRadius?: string;
  /**
   * 注意：底层 collectCSSText 只会写入字符串值（`typeof value === 'string'`），
   * 传数字会被静默丢弃，所以这里必须是字符串，例如 '0.42'。
   */
  opacity?: string;
  letterSpacing?: string;
  verticalAlign?: string;
  padding?: string;
}

export type ColorMode = 'code' | 'rainbow' | 'fixed';

export type PresetName = 'particles' | 'fireworks' | 'flames' | 'magic' | 'explosion';

export const PRESET_NAMES: PresetName[] = ['particles', 'fireworks', 'flames', 'magic', 'explosion'];

export interface ParticlePreset {
  /** 每次输入的粒子数区间 */
  count: [number, number];
  /** 粒子边长(px)区间 */
  size: [number, number];
  /** 水平初速度区间(px/帧，60fps 基准) */
  vx: [number, number];
  /** 垂直初速度区间(px/帧，60fps 基准)，负值向上 */
  vy: [number, number];
  /** 重力加速度(px/帧²) */
  gravity: number;
  /** 每帧透明度衰减系数 */
  decay: number;
  /** 随机彩虹色概率(0~1)，用于在代码取色基础上混入随机色 */
  rainbow?: number;
  /** 原地的爆闪粒子数量 */
  flash?: number;
}

/** 五种风格，数值与 POWERMODE 原版手感对齐 */
export const PRESETS: Record<PresetName, ParticlePreset> = {
  particles: {
    count: [5, 15],
    size: [2, 3],
    vx: [-1, 1],
    vy: [-3.5, -1.5],
    gravity: 0.075,
    decay: 0.96,
  },
  fireworks: {
    count: [30, 60],
    size: [2, 4],
    vx: [-3.5, 3.5],
    vy: [-4.5, 1],
    gravity: 0.1,
    decay: 0.945,
    flash: 4,
  },
  flames: {
    count: [10, 22],
    size: [2, 5],
    vx: [-1, 1],
    vy: [-4.5, -1.5],
    gravity: -0.02,
    decay: 0.95,
    rainbow: 0.15,
  },
  magic: {
    count: [8, 16],
    size: [1, 3],
    vx: [-1.5, 1.5],
    vy: [-2.5, -0.5],
    gravity: 0.02,
    decay: 0.93,
    rainbow: 0.35,
  },
  explosion: {
    count: [45, 90],
    size: [2, 5],
    vx: [-5, 5],
    vy: [-5, 4],
    gravity: 0.13,
    decay: 0.94,
    flash: 8,
  },
};

export interface Particle {
  /** 所属文档 */
  uri: string;
  /** 锚定的文档字符偏移（特效从这里迸发） */
  offset: number;
  /** 相对锚点的像素偏移 */
  x: number;
  y: number;
  /** 速度 */
  vx: number;
  vy: number;
  /** 重力 / 衰减，逐粒子保存以便不同风格同时存在 */
  gravity: number;
  decay: number;
  alpha: number;
  size: number;
  color: string;
  /** 原地爆闪粒子（不移动） */
  fixed?: boolean;
  /**
   * 渲染期的装饰器配置对象，逐粒子复用同一个实例。
   * 原先每帧要为每个粒子重建 options / renderOptions / before 三个对象，连按删除时
   * 200 粒子 × 30fps ≈ 1.8 万个对象/秒，是可见的 GC 压力来源。这里由扩展侧在首次
   * 渲染时填充，之后每帧只改 CSS 字符串，不再重新分配。
   */
  renderCache?: {
    options: vscode.DecorationOptions;
    before: AttachmentOptions;
  };
}

export function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function randomInt(min: number, max: number): number {
  return Math.floor(randomFloat(min, max + 1));
}

export function randomPick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/** 随机彩虹色（HSLA 字符串） */
export function randomColor(): string {
  const hue = randomFloat(0, 360);
  return `hsla(${hue.toFixed(0)}, 100%, ${randomFloat(55, 75).toFixed(0)}%, 1)`;
}

export interface BurstContext {
  uri: string;
  offset: number;
  multiplier: number;
  /**
   * 本次迸发解析好的基础颜色。调用方已经按颜色模式解析完成（code 模式查表一次），
   * 避免每个粒子都去主题规则里重扫一遍——这是输入卡顿的主要来源之一。
   */
  color: string;
  /** 单个粒子改用随机彩虹色的概率；rainbow 模式为 1，code 模式取风格自身的 rainbow 配置 */
  rainbowChance: number;
  /**
   * 单次迸发粒子数的缩放系数（缺省 1）。长按降载时用它把迸发规模整体砍半——
   * 在生成前缩放，比「先生成再裁掉」少一次分配和一轮随机数开销。
   */
  countScale?: number;
  /** 生成随机彩虹色，仅在 rainbowChance > 0 时按需调用 */
  rainbowColor: () => string;
}

/** 在锚点处生成一次迸发 */
export function spawnBurst(preset: ParticlePreset, ctx: BurstContext): Particle[] {
  const scale = ctx.countScale ?? 1;
  const count = Math.max(
    1,
    Math.round(randomInt(preset.count[0], preset.count[1]) * ctx.multiplier * scale)
  );
  const result: Particle[] = [];
  for (let i = 0; i < count; i++) {
    result.push(makeParticle(preset, ctx));
  }
  const flash = Math.round((preset.flash ?? 0) * scale);
  for (let i = 0; i < flash; i++) {
    const p = makeParticle(preset, ctx);
    p.fixed = true;
    p.x = randomFloat(-4, 4);
    p.y = randomFloat(-4, 2);
    p.size = randomFloat(preset.size[0], preset.size[1] + 2);
    p.alpha = 0.55;
    p.decay = Math.min(p.decay, 0.88);
    result.push(p);
  }
  return result;
}

function makeParticle(preset: ParticlePreset, ctx: BurstContext): Particle {
  return {
    uri: ctx.uri,
    offset: ctx.offset,
    x: randomFloat(-2, 2),
    y: 0,
    vx: randomFloat(preset.vx[0], preset.vx[1]),
    vy: randomFloat(preset.vy[0], preset.vy[1]),
    gravity: preset.gravity,
    decay: Math.min(0.995, preset.decay + randomFloat(-0.005, 0.005)),
    alpha: 1,
    size: randomFloat(preset.size[0], preset.size[1]),
    color: ctx.rainbowChance > 0 && Math.random() < ctx.rainbowChance ? ctx.rainbowColor() : ctx.color,
  };
}
