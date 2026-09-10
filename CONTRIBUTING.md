# 贡献指南

感谢有兴趣参与改进！本文档说明本地开发、调试与打包流程。

## 环境要求

- Node.js 18 及以上
- VS Code 1.75 及以上

## 本地开发

```bash
npm install
npm run compile   # 单次编译
npm run watch     # 监听模式，改代码自动重编译
```

## 调试

仓库已包含 `.vscode/launch.json` 与 `.vscode/tasks.json`（`.gitignore` 对这两个文件做了例外，其余 `.vscode/` 内容仍被忽略）。克隆后执行 `npm install`，按 `F5` 即会先跑一次 `npm: compile`，再启动「扩展开发宿主」窗口；在新窗口里打开任意代码文件打字即可看到效果。

若需要手动重建，配置内容为：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "运行扩展",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/out/**/*.js"],
      "preLaunchTask": "npm: compile"
    }
  ]
}
```

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "npm",
      "script": "compile",
      "group": "build",
      "problemMatcher": "$tsc",
      "label": "npm: compile"
    },
    {
      "type": "npm",
      "script": "watch",
      "group": "build",
      "isBackground": true,
      "problemMatcher": "$tsc-watch",
      "label": "npm: watch"
    }
  ]
}
```

调试取色的常用手段：

- 命令面板执行 `Power Mode: 查看当前语法的取色结果`，会弹出光标处的语法类型、命中的主题 scope 与实际颜色。
- 悬停状态栏图标可看到当前风格、配色与最近取色。

## 打包

```bash
npx @vscode/vsce package
```

产物为 `vscode-powermode-0.1.0.vsix`。打包规则见 `.vscodeignore`——`src/`、`*.ts`、`*.map`、`node_modules/` 都不会进入安装包。

发布到 Marketplace 前请确认：

- `README.md`、`CHANGELOG.md`、`LICENSE` 均为最新
- `package.json` 中的 `version` 已递增，且 `CHANGELOG.md` 有对应条目
- `logo.png` 为 256×256 以内（过大会显著增加安装包体积）

## 代码结构

| 文件 | 职责 |
| --- | --- |
| `src/extension.ts` | 扩展入口与运行器：命令注册、文档变更事件、组字判定、帧循环、渲染、状态栏 |
| `src/particles.ts` | 粒子数据结构、5 种风格预设与物理参数、单次迸发的粒子生成 |
| `src/tokenizer.ts` | 光标处的语法分类（注释 / 字符串 / 关键字…），按语言配置注释符号 |
| `src/themeColors.ts` | 解析当前主题 JSON，把语法类型映射为实际颜色（含 `include` 继承链与缓存） |

## 约定

**性能**

热路径为 `explode()` → `tick()` → `render()` → `toDecoration()`，以及每次按键调用的 `classifyToken()` 与 `ThemeTokenColors.lookup()`。这些路径上应避免每键或每帧分配对象；新增分配前先考虑能否复用或缓存。输入延迟是这个项目的核心指标，优先级高于代码简洁度。

**渲染原理**

特效通过 `TextEditorDecorationType` 的伪元素附件实现。视觉上只影响渲染，不修改文档内容，也不进撤销栈——请勿引入任何会改写文档的实现方式。

**注释**

代码注释使用中文，重点解释「为什么这么做」，而不是复述代码在做什么。对于依赖 VS Code 内部行为的地方（例如借 `text-decoration` 注入 CSS、组字期间不能放装饰器），务必写清楚原因，否则后来者很容易把它当成冗余代码删掉。

## 提交

- 提交信息用简洁的祈使句描述变更意图，例如 `修复行首定位偏移`、`缓存主题取色结果`。
- 一个提交只做一件事，避免把重构与功能改动混在一起。
- 提交前请确保 `npm run compile` 无错误。
