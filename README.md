<div align="center">
  <img src="logo.png" width="128" alt="Power Mode">
  <h1>Power Mode 打字特效</h1>
  <p>打字时在光标处迸发粒子 / 烟花特效，颜色跟随代码语法高亮——代码是什么颜色，特效就是什么颜色。</p>
  <p>
    <a href="#中文">中文</a> ·
    <a href="#english">English</a>
  </p>
</div>

---

## 中文

### 这是什么

一个纯装饰性的 VS Code 扩展。每次输入（**包括退格删除**）时，在光标处迸发一小簇粒子。

和同类插件最大的区别是配色：默认**跟随代码颜色**——粒子颜色不是写死的，而是实时取当前主题里该位置语法高亮的真实颜色。敲注释是注释色，敲字符串是字符串色，敲关键字是关键字色。

### 特性

- **5 种特效风格**：经典粒子 / 烟花 / 火焰 / 魔法 / 爆裂
- **3 种配色模式**：跟随代码颜色 / 随机彩虹 / 固定颜色
- **连击加成**：连续快速输入时粒子数量递增，越打越爽（倍率上限可配）
- **输入法友好**：拼音组字期间不出特效，落字后才爆，不会干扰候选框定位（见下方说明）
- **性能优先**：从零按低端笔记本的目标设计，连按删除也不掉帧（见「性能设计」）
- **状态栏指示**：只占一个图标（`⚡` 开启 / `⊘` 关闭），单击即可开关，悬停查看当前风格 / 配色 / 最近取色

### 安装

**从 VSIX 安装**

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
| `powermode.color` | string | `#ffcc00` | `colorMode = fixed` 时使用的颜色；推荐用 `Power Mode: 选择颜色` 命令挑选，也可在 `settings.json` 里点击色块取色 |
| `powermode.fps` | number | `30` | 帧率，范围 10–120，越大越顺滑但越耗性能 |
| `powermode.combo.enabled` | boolean | `true` | 是否开启连击 |
| `powermode.combo.maxMultiplier` | number | `2.5` | 连击带来的粒子数量倍率上限 |
| `powermode.shake` | boolean | `false` | 打字时当前行文字轻微抖动（模仿原版 POWERMODE，可能引起排版抖动，默认关闭） |
| `powermode.shakeIntensity` | number | `0.6` | 抖动强度(px) |
| `powermode.excludeLanguages` | array | `[]` | 不启用特效的 languageId 列表，例如 `["markdown", "plaintext"]` |
| `powermode.showStatusBar` | boolean | `true` | 是否在状态栏显示开关图标（悬停查看当前参数） |

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

所有数值与 POWERMODE 原版手感对齐。

| 风格 | 每次粒子数 | 边长(px) | 重力 | 透明度衰减 | 特点 |
| --- | --- | --- | --- | --- | --- |
| `particles` | 5–15 | 2–3 | 0.075 | 0.96 | 经典：少量粒子向上飘散 |
| `fireworks` | 30–60 | 2–4 | 0.10 | 0.945 | 烟花：大量粒子向四周炸开，含 4 个原地爆闪 |
| `flames` | 10–22 | 2–5 | -0.02 | 0.95 | 火焰：向上喷射，15% 概率混入随机彩虹色 |
| `magic` | 8–16 | 1–3 | 0.02 | 0.93 | 魔法：细腻星尘，35% 概率混入随机彩虹色 |
| `explosion` | 45–90 | 2–5 | 0.13 | 0.94 | 爆裂：超大量粒子的强烈爆炸，含 8 个原地爆闪 |

**连击**：每累计 12 个字符，倍率 +0.25，最高 `combo.maxMultiplier`（默认 2.5x）；输入停顿（超过判定窗口未输入）即清零。

### 配色模式

- **`code`（跟随代码颜色，推荐）**
  VS Code 没有对外提供查询 token 颜色的 API，因此扩展直接解析当前主题的 `tokenColors`（自动处理 `include` 继承链），把光标处的语法类型映射到主题里的实际颜色。识别的语法类型包括：注释、字符串、数字、关键字、类型、函数、属性、运算符、标点、常量。取不到时回退到主题的 `editor.foreground`，再回退到 `#ffcc00`。
  普通标识符（裸变量名）刻意不做单独取色：轻量词法无法判断它在主题里究竟算 `variable` 还是普通文本，而主题往往给 `variable` 单独上色（如 Dark Modern 的浅蓝），照搬就会出现「白字迸出蓝粒子」。所以这类没把握的标识符统一用 `editor.foreground`，保证「字是什么颜色，特效就是什么颜色」。

- **`rainbow`（彩虹）**
  每个粒子完全随机取色。

- **`fixed`（固定）**
  全部使用 `powermode.color`。

### 性能设计

目标是让低端平台（如 i5-1200U 级别的笔记本）在**连续长按退格**这种最坏情况下也能保持流畅。为此做了以下优化：

1. **取色结果按 token 类型缓存**——主题数据在两次主题切换之间是稳定的，不缓存的话每次按键都要重扫几百条 `tokenColors` 规则。未命中也会被记住。
2. **每次迸发只解析一次颜色**——绝不在逐粒子循环里查主题表。
3. **语法判断有扫描预算**——判断「光标处于代码 / 注释 / 字符串」只在光标前 6000 字符内回看，超长行和大文件不会拖慢输入响应。
4. **装饰器对象逐粒子复用**——每个粒子的装饰器配置对象只分配一次，之后每帧只改写 CSS 字符串。连按删除时（200 粒子 × 30fps）原本每秒会产生约 1.8 万个临时对象，现在趋近于零。
5. **帧内锚点缓存**——同一帧里共享锚点的粒子复用同一个 `Range`，不重复做 `positionAt` / `lineAt`。
6. **状态栏合帧刷新**——文本没变就不写入（每次写入都是一次跨进程 IPC），悬停提示按 150ms 合并刷新。
7. **粒子按真实时间推进 + 自校正排程**——物理步长取真实帧间隔而非名义帧率，`setTimeout` 也按固定节拍对齐，抵消误差累积，连续输入时动作更均匀丝滑。
8. **单帧步长上限 100ms**——切回标签页 / 断点恢复后不做补帧，粒子不会瞬移。
9. **输入压力降载**——0.5 秒内编辑达到 8 次（约 16 次/秒，高于人手连打、接近系统按键重复率）即判定为长按 / 连打，自动降到 30 帧档、粒子数与单次迸发量各砍一半，并暂停连击放大与行抖动；输入一停当帧即自动恢复全质量。
10. **渲染预算按帧率归一**——渲染开销 ≈ 粒子数 × 帧率，故 60fps 下粒子上限收缩为 30fps 时的 60%（下限 0.6）。此前「调高帧率」会等比例放大每帧的装饰器推送量，这正是 60fps 反而比 30fps 更容易卡的原因；现在高帧率换来的是更顺的采样而非更高的负载。
11. **粒子上限固定 200**——超出后回收最早的粒子，避免瞬时爆炸式增长。

如果仍觉得卡，可以按此顺序调整：降低 `powermode.fps` → 换成 `particles` / `magic` 这类粒子较少的风格。

### 关于输入法

使用中文、日文等输入法时，拼音组字阶段编辑器会不断把上一次的拼音整段替换掉。如果这时在组字位置放装饰器，会迫使编辑器重排该行，打断输入法对字符边界的测量，典型症状是「候选框附近突然冒出一条很长的文本框」，要等输入停下来才慢慢收拢。

因此扩展在检测到组字时会**主动暂停特效并暂停渲染**，等输入停顿（250ms）后再补爆一次。这是刻意的设计，不是 bug。

### 常见问题

**Q：特效完全不出来？**
依次检查：`powermode.enabled` 是否为 `true`；当前语言是否在 `powermode.excludeLanguages` 里；状态栏图标是不是 `⊘`（关闭状态，单击可开）。仍不行可用 `Power Mode: 查看当前语法的取色结果` 看取色是否正常。

**Q：明明是浅色主题，粒子颜色却不对 / 一直是默认色？**
说明主题文件没被读到。扩展会扫描 VS Code 内置主题目录和 `~/.vscode*/extensions` 下的主题扩展；远程开发、容器等场景下如果主题文件不在本地，就会回退到 `editor.foreground`。

**Q：换了主题，特效颜色没跟着变？**
切换主题会自动重载。如果颜色仍停留在旧主题，切换一次主题或重载窗口即可。

**Q：会不会改我的文件 / 进撤销栈 / 影响保存？**
不会。全部通过 `TextEditorDecorationType` 实现，只影响渲染，不进文档内容，也不进撤销栈。

**Q：想关掉某些文件类型？**
配置 `powermode.excludeLanguages`，例如 `["markdown", "plaintext", "log"]`。

**Q：能只在前台窗口显示吗？**
粒子按文档 URI 关联，不可见编辑器上的粒子会被自动回收，不会在后台累积。

### 开发

开发、调试与打包流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

### 许可

[MIT](LICENSE)

---

## English

### What is this

A purely decorative VS Code extension. Every keystroke — **including backspace** — bursts a small cluster of particles at the cursor.

What sets it apart from similar extensions is the coloring. By default it **follows your code colors**: particle colors are not hard-coded, they are read live from your current theme's syntax highlighting at that exact position. Type a comment and the particles are comment-colored; type a string and they are string-colored.

### Features

- **5 effect presets**: classic particles / fireworks / flames / magic / explosion
- **3 color modes**: follow code colors / random rainbow / fixed color
- **Combo multiplier**: the faster you type, the more particles you get (cap is configurable)
- **IME friendly**: no effects while an IME composition is in progress, so the candidate window is never disturbed
- **Performance first**: designed against low-end laptops, stays smooth even when you hold backspace
- **Status bar indicator**: a single icon (`⚡` on / `⊘` off) — click to toggle, hover for the current preset / color mode / last resolved color

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
| `powermode.color` | string | `#ffcc00` | Color used when `colorMode = fixed`; recommended to use the `Power Mode: 选择颜色` command, or click the swatch in `settings.json` |
| `powermode.fps` | number | `30` | Frame rate, 10–120. Higher is smoother but costs more |
| `powermode.combo.enabled` | boolean | `true` | Enable the combo multiplier |
| `powermode.combo.maxMultiplier` | number | `2.5` | Combo multiplier cap |
| `powermode.shake` | boolean | `false` | Shake the current line while typing (may cause layout jitter, off by default) |
| `powermode.shakeIntensity` | number | `0.6` | Shake amount in px |
| `powermode.excludeLanguages` | array | `[]` | languageIds to skip, e.g. `["markdown", "plaintext"]` |
| `powermode.showStatusBar` | boolean | `true` | Show the toggle icon in the status bar (hover to view current settings) |

```jsonc
{
  "powermode.preset": "fireworks",
  "powermode.colorMode": "code",
  "powermode.combo.maxMultiplier": 3,
  "powermode.excludeLanguages": ["markdown", "plaintext", "log"]
}
```

### Presets

All values are tuned to match the feel of the original POWERMODE.

| Preset | Particles per burst | Size (px) | Gravity | Alpha decay | Notes |
| --- | --- | --- | --- | --- | --- |
| `particles` | 5–15 | 2–3 | 0.075 | 0.96 | Classic: a few particles drifting upward |
| `fireworks` | 30–60 | 2–4 | 0.10 | 0.945 | Fireworks: a large burst in all directions, plus 4 static flashes |
| `flames` | 10–22 | 2–5 | -0.02 | 0.95 | Flames: shooting upward, 15% chance of a random rainbow color |
| `magic` | 8–16 | 1–3 | 0.02 | 0.93 | Magic: fine stardust, 35% chance of a random rainbow color |
| `explosion` | 45–90 | 2–5 | 0.13 | 0.94 | Explosion: a very large burst, plus 8 static flashes |

**Combo**: every 12 characters adds +0.25 to the multiplier, capped at `combo.maxMultiplier` (default 2.5x). It resets as soon as typing pauses beyond the combo detection window.

### Color modes

- **`code` (follow code colors, recommended)**
  VS Code exposes no API for querying token colors, so the extension parses the active theme's `tokenColors` directly (resolving the `include` inheritance chain) and maps the token type at the cursor to the real color. Recognized types: comment, string, number, keyword, type, function, property, operator, punctuation, constant. Falls back to the theme's `editor.foreground`, then to `#ffcc00`.
  Plain identifiers (bare variable names) are deliberately not colored on their own: a lightweight lexer cannot tell whether the theme treats an identifier as `variable` or as plain text, and themes often give `variable` its own color (e.g. Dark Modern's light blue) — copying that would produce "blue particles bursting out of white text". So these uncertain identifiers all use `editor.foreground`, guaranteeing "the particles match the color the text actually is".

- **`rainbow`** — every particle gets a fully random color.

- **`fixed`** — everything uses `powermode.color`.

### Performance

The design target is that even a low-end laptop (i5-1200U class) stays smooth under the worst case: **holding down backspace**. Optimizations:

1. **Color lookups are cached per token type** — theme data is stable between theme switches, and without caching every keystroke would re-scan hundreds of `tokenColors` rules. Misses are cached too.
2. **One color resolution per burst** — never inside the per-particle loop.
3. **Bounded syntax scanning** — deciding whether the cursor is in code, a comment or a string only looks back 6000 characters, so very long lines and large files don't slow down typing.
4. **Decoration objects are reused per particle** — the config object is allocated once and only its CSS strings are rewritten each frame. At 200 particles × 30fps the old code allocated roughly 18,000 objects per second; now it's effectively zero.
5. **Per-frame anchor cache** — particles sharing an anchor within a frame reuse the same `Range` instead of redoing `positionAt` / `lineAt`.
6. **Coalesced status bar updates** — text is only written when it actually changes (each write is an IPC round-trip), and the hover tooltip is coalesced to a 150ms cadence.
7. **Real-time physics with self-correcting scheduling** — the physics step uses the real frame interval rather than the nominal FPS, and `setTimeout` is aligned to a fixed cadence so error doesn't accumulate; motion stays even under sustained typing.
8. **Frame step capped at 100ms** — after switching back to the tab or resuming from a breakpoint, no catch-up frames are simulated, so particles never teleport.
9. **Input-pressure downshifting** — 8 edits within 0.5s (~16/s, faster than human typing and close to the OS key-repeat rate) is treated as holding/repeating: the extension drops to the 30fps tier, halves both the particle cap and the per-burst count, and pauses combo scaling and line shake. Full quality returns on the very frame typing stops.
10. **Render budget normalized by FPS** — render cost ≈ particle count × FPS, so at 60fps the particle cap shrinks to 60% of the 30fps cap (floor 0.6). Raising the FPS used to scale each frame's decoration pushes proportionally — which is exactly why 60fps felt heavier than 30fps. Now a higher FPS buys smoother sampling instead of more load.
11. **Particle cap is fixed at 200** — the oldest particles are recycled beyond that.

If it still feels heavy, tune in this order: lower `powermode.fps` → switch to a lighter preset such as `particles` or `magic`.

### Input methods (IME)

While composing Chinese, Japanese or similar text, the editor repeatedly replaces the in-progress text. Placing decorations at the composition position forces the editor to re-layout that line, which breaks the IME's character boundary measurement — the classic symptom is a sudden oversized text box that only collapses once you stop typing.

The extension therefore **pauses effects and rendering** while a composition is detected, and re-fires a single burst 250ms after you stop typing. This is intentional.

### FAQ

**No effects at all?**
Check `powermode.enabled`, whether the current language is listed in `powermode.excludeLanguages`, and whether the status bar icon shows `⊘` (disabled — click to enable). You can also run `Power Mode: 查看当前语法的取色结果` to inspect color resolution.

**Colors look wrong, or always fall back to a default?**
The theme file could not be read. The extension scans VS Code's built-in theme directory and theme extensions under `~/.vscode*/extensions`; in remote or container setups where the theme file isn't local, it falls back to `editor.foreground`.

**Changed my theme but colors didn't update?**
Switching themes reloads automatically. If colors are still stale, switch themes once more or reload the window.

**Does it modify my files, pollute undo, or affect saving?**
No. Everything is implemented with `TextEditorDecorationType`, which only affects rendering. It never touches document content and never enters the undo stack.

**How do I disable it for certain file types?**
Set `powermode.excludeLanguages`, e.g. `["markdown", "plaintext", "log"]`.

**Does it keep running in background windows?**
Particles are tied to a document URI, and particles on non-visible editors are recycled, so nothing accumulates in the background.

### Development

See `CONTRIBUTING.md` in the repository root for the development, debugging and packaging workflow.

### License

MIT
