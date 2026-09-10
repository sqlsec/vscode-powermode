<div align="center">
  <img src="logo.png" width="128" alt="Power Mode">
  <h1>Power Mode 打字特效</h1>
  <p>打字时在光标处迸发粒子特效，颜色跟随代码语法高亮——代码是什么颜色，特效就是什么颜色。</p>
  <p>
    <a href="#中文">中文</a> ·
    <a href="#english">English</a>
  </p>
</div>

---

## 中文

### 这是什么

一个纯装饰性的 VS Code 扩展。每次输入（**包括退格删除**）时，在光标处迸发一小簇粒子。

和同类插件最大的区别是配色：默认**跟随代码颜色**，粒子颜色实时取自当前主题里该位置语法高亮的真实颜色。敲注释是注释色，敲字符串是字符串色，敲关键字是关键字色。

### 特性

- **5 种特效风格**：经典粒子 / 烟花 / 火焰 / 魔法 / 爆裂
- **3 种配色模式**：跟随代码颜色 / 随机彩虹 / 固定颜色
- **连击加成**：连续快速输入时粒子数量递增，越打越爽（倍率上限可配）
- **输入法友好**：拼音组字期间不出特效，落字后才爆，不会干扰候选框定位
- **状态栏指示**：只占一个图标（`⚡` 开启 / `⊘` 关闭），单击即可开关，悬停查看当前风格 / 配色 / 最近取色
- **性能优先**：面向低端笔记本设计，连续长按退格也不掉帧

### 安装

1. 下载 `vscode-powermode-0.1.0.vsix`
2. VS Code 中打开命令面板（`Ctrl/Cmd + Shift + P`）
3. 执行 `Extensions: Install from VSIX...`，选择该文件

也可以直接用命令行：

```bash
code --install-extension vscode-powermode-0.1.0.vsix
```

安装后随窗口启动自动启用，无需手动开启。

### 使用

打开命令面板（`Ctrl/Cmd + Shift + P`），输入 `Power Mode`：

| 命令 | 说明 |
| --- | --- |
| `Power Mode: 开启 / 关闭` | 切换特效开关 |
| `Power Mode: 开启` | 开启特效 |
| `Power Mode: 关闭` | 关闭特效 |
| `Power Mode: 选择特效风格` | 弹出列表快速切换风格 |
| `Power Mode: 选择颜色` | 弹出色板挑固定颜色（也可自定义输入 `#RRGGBB`），选完自动切到 `fixed` 模式 |
| `Power Mode: 查看当前语法的取色结果` | 诊断用：显示光标处的语法类型、命中的主题 scope 和最终颜色 |

状态栏右侧只显示一个图标（`⚡` 开启 / `⊘` 关闭），**单击即可开关**，悬停可看到当前风格、配色、最近取色等实时信息。

### 配置

在「设置」中搜索 `powermode`，或直接编辑 `settings.json`。

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `powermode.enabled` | boolean | `true` | 是否开启打字特效 |
| `powermode.preset` | string | `particles` | 特效风格，见下方「风格预设」 |
| `powermode.colorMode` | string | `code` | 配色来源：`code` / `rainbow` / `fixed` |
| `powermode.color` | string | `#ffcc00` | `colorMode = fixed` 时使用的颜色 |
| `powermode.fps` | number | `30` | 帧率，范围 10–120，越大越顺滑但越耗性能 |
| `powermode.combo.enabled` | boolean | `true` | 是否开启连击 |
| `powermode.combo.maxMultiplier` | number | `2.5` | 连击带来的粒子数量倍率上限 |
| `powermode.shake` | boolean | `false` | 打字时当前行文字轻微抖动（可能引起排版抖动，默认关闭） |
| `powermode.shakeIntensity` | number | `0.6` | 抖动强度(px) |
| `powermode.excludeLanguages` | array | `[]` | 不启用特效的 languageId 列表，例如 `["markdown", "plaintext"]` |
| `powermode.showStatusBar` | boolean | `true` | 是否在状态栏显示开关图标 |

示例：

```jsonc
{
  "powermode.preset": "fireworks",
  "powermode.colorMode": "code",
  "powermode.combo.maxMultiplier": 3,
  "powermode.excludeLanguages": ["markdown", "plaintext", "log"]
}
```

### 风格预设

| 风格 | 特点 |
| --- | --- |
| `particles` | 经典：少量粒子向上飘散 |
| `fireworks` | 烟花：大量粒子向四周炸开 |
| `flames` | 火焰：向上喷射的火焰粒子 |
| `magic` | 魔法：细腻的星尘 |
| `explosion` | 爆裂：超大量粒子的强烈爆炸 |

**连击**：每累计 12 个字符，倍率 +0.25，最高 `combo.maxMultiplier`（默认 2.5x）；输入停顿即清零。

### 配色模式

- **`code`（跟随代码颜色，推荐）**
  VS Code 没有开放查询 token 颜色的 API，因此扩展直接解析当前主题的 `tokenColors`（自动处理 `include` 继承链），把光标处的语法类型映射为实际颜色。识别的类型包括：注释、字符串、数字、关键字、类型、函数、属性、运算符、标点、常量。取不到时回退到主题的 `editor.foreground`。

- **`rainbow`（彩虹）**
  每个粒子完全随机取色。

- **`fixed`（固定）**
  全部使用 `powermode.color`。

### 常见问题

**特效完全不出来？** 检查 `powermode.enabled` 是否为 `true`、当前语言是否在 `powermode.excludeLanguages` 里、状态栏图标是不是 `⊘`（关闭状态，单击可开）。

**颜色不对 / 一直是默认色？** 说明主题文件没被读到，扩展会回退到主题的 `editor.foreground`。远程开发、容器等场景下较为常见。

**会不会改我的文件 / 进撤销栈？** 不会。全部通过 `TextEditorDecorationType` 实现，只影响渲染，不修改文档内容，也不进撤销栈。

### 开发

开发、调试与打包流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

### 许可

[MIT](LICENSE)

---

## English

### What is this

A purely decorative VS Code extension. Every keystroke — **including backspace** — bursts a small cluster of particles at the cursor.

What sets it apart from similar extensions is the coloring. By default it **follows your code colors**: particle colors are read live from your current theme's syntax highlighting at that exact position. Type a comment and the particles are comment-colored; type a string and they are string-colored.

### Features

- **5 effect presets**: classic particles / fireworks / flames / magic / explosion
- **3 color modes**: follow code colors / random rainbow / fixed color
- **Combo multiplier**: the faster you type, the more particles you get (cap is configurable)
- **IME friendly**: no effects while an IME composition is in progress, so the candidate window is never disturbed
- **Status bar indicator**: a single icon (`⚡` on / `⊘` off) — click to toggle, hover for the current preset / color mode / last resolved color
- **Performance first**: designed against low-end laptops, stays smooth even when you hold backspace

### Installation

1. Download `vscode-powermode-0.1.0.vsix`
2. Open the Command Palette (`Ctrl/Cmd + Shift + P`)
3. Run `Extensions: Install from VSIX...` and pick the file

Or from a terminal:

```bash
code --install-extension vscode-powermode-0.1.0.vsix
```

The extension activates automatically on window startup.

### Usage

Open the Command Palette (`Ctrl/Cmd + Shift + P`) and type `Power Mode`:

| Command | Description |
| --- | --- |
| `Power Mode: 开启 / 关闭` | Toggle effects on or off |
| `Power Mode: 开启` | Enable effects |
| `Power Mode: 关闭` | Disable effects |
| `Power Mode: 选择特效风格` | Pick a preset from a list |
| `Power Mode: 选择颜色` | Pick a fixed color from a palette (or type a custom `#RRGGBB`); switches to `fixed` mode automatically |
| `Power Mode: 查看当前语法的取色结果` | Diagnostics: show the token type, matched theme scope and resolved color at the cursor |

The status bar shows a single icon on the right (`⚡` on / `⊘` off). **Click it to toggle**, hover it to see the current preset, color mode and last resolved color.

### Configuration

Search for `powermode` in Settings, or edit `settings.json` directly.

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `powermode.enabled` | boolean | `true` | Enable typing effects |
| `powermode.preset` | string | `particles` | Effect preset, see "Presets" below |
| `powermode.colorMode` | string | `code` | Color source: `code` / `rainbow` / `fixed` |
| `powermode.color` | string | `#ffcc00` | Color used when `colorMode = fixed` |
| `powermode.fps` | number | `30` | Frame rate, 10–120. Higher is smoother but costs more |
| `powermode.combo.enabled` | boolean | `true` | Enable the combo multiplier |
| `powermode.combo.maxMultiplier` | number | `2.5` | Combo multiplier cap |
| `powermode.shake` | boolean | `false` | Shake the current line while typing (may cause layout jitter, off by default) |
| `powermode.shakeIntensity` | number | `0.6` | Shake amount in px |
| `powermode.excludeLanguages` | array | `[]` | languageIds to skip, e.g. `["markdown", "plaintext"]` |
| `powermode.showStatusBar` | boolean | `true` | Show the toggle icon in the status bar |

```jsonc
{
  "powermode.preset": "fireworks",
  "powermode.colorMode": "code",
  "powermode.combo.maxMultiplier": 3,
  "powermode.excludeLanguages": ["markdown", "plaintext", "log"]
}
```

### Presets

| Preset | Notes |
| --- | --- |
| `particles` | Classic: a few particles drifting upward |
| `fireworks` | Fireworks: a large burst in all directions |
| `flames` | Flames: shooting upward |
| `magic` | Magic: fine stardust |
| `explosion` | Explosion: a very large burst |

**Combo**: every 12 characters adds +0.25 to the multiplier, capped at `combo.maxMultiplier` (default 2.5x). It resets as soon as typing pauses.

### Color modes

- **`code` (follow code colors, recommended)**
  VS Code exposes no API for querying token colors, so the extension parses the active theme's `tokenColors` directly (resolving the `include` inheritance chain) and maps the token type at the cursor to the real color. Recognized types: comment, string, number, keyword, type, function, property, operator, punctuation, constant. Falls back to the theme's `editor.foreground`.

- **`rainbow`** — every particle gets a fully random color.

- **`fixed`** — everything uses `powermode.color`.

### FAQ

**No effects at all?** Check `powermode.enabled`, whether the current language is listed in `powermode.excludeLanguages`, and whether the status bar icon shows `⊘` (disabled — click to enable).

**Colors look wrong, or always fall back to a default?** The theme file could not be read, so the extension fell back to the theme's `editor.foreground`. Common in remote or container setups.

**Does it modify my files or pollute undo?** No. Everything is implemented with `TextEditorDecorationType`, which only affects rendering.

### Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development, debugging and packaging workflow.

### License

MIT
