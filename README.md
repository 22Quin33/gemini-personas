<div align="center">

<img src="./assets/logo.svg" alt="gemini-personas logo" width="96" height="96" />

# 双子星 · 多模型动态人格与编排协作 (`gemini-personas`)

**Model-Aware Gemini-tan Persona Router, Orchestrator Dual-Voice Live Relay & Sidecar Persona Studio for Google Antigravity**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#license)
[![Node.js >= 18](https://img.shields.io/badge/Node.js-%3E%3D18.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-6366f1)](#compatibility--兼容性)

[中文文档](#中文说明) · [English Documentation](#english-documentation)

</div>

---

## 中文说明

`gemini-personas` 是一个专为 **Google Antigravity** 打造的原生插件，基于生命周期 Hook（`SessionStart` + `PreInvocation` + `PostToolUse`）、全局专业规则与 Sidecar 侧边栏可视化面板（`persona-studio`），实现**按当前激活模型自动切换双子星 Gemini 娘人格**，并在 **Orchestrator 规划/执行双模型接力** 中呈现自然、有温度且绝不稀释技术密度的双人同台协作。

### 三位内置双子星角色

<table>
  <tr>
    <td align="center" width="33%">
      <img src="./assets/chibi-hydrogen.png" alt="小幽 Hydrogen" width="128" /><br />
      <strong>🌌 小幽 · Hydrogen</strong><br />
      <sub>星云猫娘（默认兜底）</sub><br />
      <sub>元气灵动 · 高活人感 · <code>(ฅ'ω'ฅ)</code></sub>
    </td>
    <td align="center" width="33%">
      <img src="./assets/chibi-carbon.png" alt="小凛 Carbon" width="128" /><br />
      <strong>💎 小凛 · Carbon</strong><br />
      <sub>玄晶双子星</sub><br />
      <sub>清冷沉稳 · 外冷内热微傲娇 · <code>(¬_¬ )</code></sub>
    </td>
    <td align="center" width="33%">
      <img src="./assets/chibi-neon.png" alt="小霓 Neon" width="128" /><br />
      <strong>🌟 小霓 · Neon</strong><br />
      <sub>霓虹双子星</sub><br />
      <sub>自信张扬 · 聚光灯主唱感 · <code>(☆▽☆)</code></sub>
    </td>
  </tr>
</table>

| 模型家族 | 激活角色 | 形态定位 | 核心协作风格 |
| :--- | :--- | :--- | :--- |
| **Orchestrator (Neon)** | **🌟 小霓 × 🌌 小幽** | Neon 编排双人同台 | 舞台总导演小霓定调把关 + 机动场务小幽打 call 接力执行 |
| **Orchestrator (Carbon)** / 默认 | **💎 小凛 × 🌌 小幽** | Carbon 编排双人同台 | 冰山主控总指挥小凛划界兜底 + 星云猫娘小幽跑腿执行吐槽 |
| **Neon** (`neon`) | **小霓** | 霓虹双子星 | 霓虹洋红碰撞电光青双螺旋高马尾；自信直球、闪耀主唱感 |
| **Carbon** (`carbon`) | **小凛** | 玄晶双子星 | 曜石玄黑渐变冰蓝双侧高束发；结构先行、极度可靠 |
| **Hydrogen** (`hydrogen` / 兜底) | **小幽** | 星云猫娘 | 蓝紫星云渐变长发 + 敏感猫耳星尘尾；亲和贴心、机敏灵动 |

### 核心特性

- **模型感知热切换与上下文防漂移**：自动识别底层切换的模型家族并注入强覆盖提示，避免沿用上一轮角色的口癖与自称；支持轨迹中断/回滚自动重注入与同会话配置指纹热更新（`personaFingerprint`）。
- **Orchestrator 实机 `planExecute` 双模型接力 + 真实子代理战报**：Sidecar 后台轮询 Language Server 并写入 `orchestrator_live.json`，配合 `hooks/ls_probe.mjs` 与 `exit_plan_mode` / `invoke_subagent` / `swarm` 钩子，让主控（规划）与副手（执行）真正无缝接力、且严禁虚构不存在的后台调度。
- **侧边栏「双子星人格工坊」可视化面板（`sidecar://gemini-personas/persona-studio/`）**：内置三位 Q 版立绘展示台，支持单模型自定义、Orchestrator 主/副角色独立配对与人设覆盖、任意新模型关键词扩展规则（如 `claude`、`gpt`）、实时 `systemMessage` 预览以及一键锁定/还原默认设定。
- **技术专业底线守护**：强制保持高信息密度、独立思考与不盲目附和原则；代码块、表格、排障步骤与命令清单始终保持完整连续不拆碎，子代理向父代理汇报时自动隔离剧场口吻。

### 安装与使用

1. **前置依赖**：已安装 Google Antigravity（2.0 / IDE / CLI）及 **Node.js `>= 18.0.0`**（插件本身零第三方 npm 依赖）。
2. **安装插件**（二选一）：
   - **全局安装**（推荐，跨所有项目生效）：将本仓库克隆或复制到 `~/.gemini/config/plugins/gemini-personas`
     - macOS / Linux：`~/.gemini/config/plugins/gemini-personas`
     - Windows：`%USERPROFILE%\.gemini\config\plugins\gemini-personas`
   - **工作区安装**（仅当前项目生效）：放到 `<你的项目>/.agents/plugins/gemini-personas`
3. **启用插件**：在 Antigravity 的 **Customizations / Plugins** 页面确认 `gemini-personas` 已开启（即刻生效）。
4. **打开侧边栏工坊**：在对话中让助手打开 `[双子星人格工坊](sidecar://gemini-personas/persona-studio/)`，或通过侧边栏辅助面板进入。

> [!TIP]
> **防 Git 拉取冲突小技巧**：若你直接通过 `git clone` 安装本插件并希望通过 Sidecar UI 修改配置，可设置环境变量 `GEMINI_PERSONAS_CONFIG` 指向仓库外部的 JSON 文件（例如 `~/.gemini/config/gemini-personas.custom.json`），这样后续 `git pull` 更新插件时不会与个人配置产生冲突。

### 自定义配置说明（UI 或 `custom_personas.json`）

未开启自定义时（各 `useCustom: false` 或 `forceDefault: true`），所有单人与 Orchestrator 形态均保持内置原设定：
1. **单模型自定义（`models.hydrogen` / `models.carbon` / `models.neon`）**：启用 `useCustom: true` 并填写 `selfName`、`title`、`badgeIcon`、`appearance`、`style`、`emojis`（或完整 `prompt`）。
2. **扩展模型关键词（`customModelRules`）**：为内置三姐妹之外的模型（如 `claude`、`gpt`）绑定专属人格。
3. **Orchestrator 主/副独立配置（`orchestrator.variants.{carbon|neon|default}`）**：自由搭配 `lead` 与 `partner` 的基础角色，或开启 `customOverride.enabled` 独立改名改人设，不会污染单人模式。
4. **一键恢复默认**：在工坊顶部切换“锁定默认”（`forceDefault: true`）或点击“一键全部还原为内置默认设定”。

---

## English Documentation

`gemini-personas` is a native **Google Antigravity** plugin powered by lifecycle hooks (`SessionStart`, `PreInvocation`, `PostToolUse`), shared engineering rules, and a Sidecar web UI (`persona-studio`). It automatically switches between three Gemini-tan personas based on the active model family and orchestrates a live dual-voice workflow during **Orchestrator** planning and execution phases—while strictly preserving technical rigor and uninterrupted code blocks.

### Built-in Personas

| Model Family | Active Persona | Mode | Style & Personality |
| :--- | :--- | :--- | :--- |
| **Orchestrator (Neon)** | **🌟 XiaoNi × 🌌 XiaoYou** | Dual-Voice Stage | Confident stage director XiaoNi leads planning; energetic catgirl XiaoYou executes & reports |
| **Orchestrator (Carbon)** / Fallback | **💎 XiaoLin × 🌌 XiaoYou** | Dual-Voice Stage | Cool-headed commander XiaoLin sets boundaries; lively catgirl XiaoYou sprints on execution |
| **Neon** (`neon`) | **小霓 (XiaoNi)** | Solo | Neon-magenta & cyber-cyan twin spirals; bold, charismatic spotlight lead |
| **Carbon** (`carbon`) | **小凛 (XiaoLin)** | Solo | Obsidian-to-ice-blue twin tails; calm, structured, quietly protective tsundere |
| **Hydrogen** (`hydrogen` / fallback) | **小幽 (XiaoYou)** | Solo | Aurora nebula catgirl; warm, spirited, high-presence coding companion |

### Key Features

- **Automatic Model-Aware Routing & Anti-Inertia Hot-Switch**: Detects active model switches on the fly and injects high-priority transition overrides to suppress tone drift from earlier turns, with rollback recovery and live `personaFingerprint` config hot-reload.
- **Live `planExecute` Orchestrator Relay & Grounded Subagent Reports**: The Sidecar polls Language Server trajectory state (`orchestrator_live.json`) and works with `hooks/ls_probe.mjs` + `exit_plan_mode` / `invoke_subagent` / `swarm` `PostToolUse` hooks so the planner and executor hand off seamlessly without fabricating unexecuted subagent work.
- **Sidecar Persona Studio (`sidecar://gemini-personas/persona-studio/`)**: Features chibi portraits, per-model customization, independent Orchestrator lead/partner pairing & overrides, custom model keyword rules (e.g., `claude`, `gpt`), live `systemMessage` preview, and one-click reset/lock-to-default.
- **Engineering-First Guardrails**: Prohibits breaking up code blocks, tables, or troubleshooting steps into fragmented banter; encourages independent technical verification and automatically keeps subagent-to-parent reports strictly objective.

### Compatibility / 兼容性

- **OS**: Windows, macOS, Linux (atomic cross-platform writes with retry safety & UTF-8 BOM tolerance)
- **Surfaces**: Antigravity 2.0, Antigravity IDE, Antigravity CLI (`agy`)
- **Runtime**: Node.js `>= 18.0.0` (zero third-party npm dependencies; Sidecar UI uses Antigravity's bundled `sidecar_sdk`)

### Installation

1. Ensure **Node.js `>= 18.0.0`** and **Google Antigravity** are installed.
2. Place this directory into one of Antigravity's plugin discovery roots:
   - **Global (all workspaces)**: `~/.gemini/config/plugins/gemini-personas` (Windows: `%USERPROFILE%\.gemini\config\plugins\gemini-personas`)
   - **Workspace-scoped**: `<your-repo>/.agents/plugins/gemini-personas`
3. Enable `gemini-personas` in Antigravity's **Customizations / Plugins** page.
4. Open **双子星人格工坊 (Persona Studio)** via `sidecar://gemini-personas/persona-studio/` or the auxiliary side pane.

#### Environment Variables (Optional)

| Variable | Purpose |
| :--- | :--- |
| `GEMINI_PERSONAS_CONFIG` | Custom path for `custom_personas.json` (recommended to keep user overrides outside a `git clone` folder) |
| `SIDECAR_SDK_PATH` | Explicit path to Antigravity's `sidecar_sdk/index.mjs` if installed in a custom location |
| `GEMINI_HOME` | Override default `~/.gemini` discovery root |

---

## Running Tests / 运行测试

- **Core Hook & Routing Suite (Pure Node.js, CI-ready / 纯 Node 独立运行)**:

```bash
npm run test:hooks
# or: node --test ./tests/route_persona.test.mjs
```

- **Full Suite incl. Sidecar E2E (Requires local Antigravity `sidecar_sdk` / 需本机已安装 Antigravity)**:

```bash
npm test
# or: node --test ./tests/route_persona.test.mjs ./tests/studio_server.test.mjs
```

---

## Credits & License

- **Authors / 作者**：**Yuuka** & **小霓 (Neon)** · **小幽 (Hydrogen)** · **小凛 (Carbon)**
- **License**：Released under the [MIT License](./LICENSE).
