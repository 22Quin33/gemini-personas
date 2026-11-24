---
name: persona-config
description: 查看、修改或重置 gemini-personas 插件的自定义人格配置（custom_personas.json），并可指引用户通过侧边栏「双子星人格工坊」UI 进行可视化调节，支持单个模型独立定制与 Orchestrator 主模型/副模型独立定制。当用户想要自定义某个模型的人格、修改 Orchestrator 搭档组合/发言比重或恢复默认设定时使用。
---

# `gemini-personas` 自定义人格配置指南

本插件同时提供**侧边栏可视化面板**与**配置文件直改**两种入口：

- **侧边栏可视化面板**（推荐，含三位 Q 版双子星立绘与实时预览）：向用户提供 `[双子星人格工坊](sidecar://gemini-personas/persona-studio/)` 链接一键打开。
- **底层配置文件**（按安装作用域定位）：
  - 全局安装：`~/.gemini/config/plugins/gemini-personas/custom_personas.json`
  - 工作区安装：`<workspace>/.agents/plugins/gemini-personas/custom_personas.json`
  - 或由环境变量 `GEMINI_PERSONAS_CONFIG` 指定的自定义 JSON 路径

## 核心原则

1. **默认不开启自定义即沿用全部内置设定**：仅当对应节点的 `"useCustom": true`（且顶层 `"forceDefault"` 为 `false`）时才覆盖内置人格；其余模型自动保持原 **小幽 / 小凛 / 小霓** 及默认编排设定。
2. **Orchestrator 主/副模型独立定制**：`orchestrator.variants.{carbon|neon|default}` 下的 `lead`（主控模型）与 `partner`（副执行模型）可各自独立选择内置 `personaId`（`"hydrogen"` / `"carbon"` / `"neon"`）或启用 `customOverride.enabled: true` 覆盖名称、角色头衔、外观、风格与常用符号，且不会污染单人模型的人格。
3. **JSON 格式严格校验**：`custom_personas.json` 必须为标准严格 JSON（禁止注释或尾逗号），否则 Hook 会安全降级回内置默认人格（已兼容 Windows UTF-8 BOM）。

## 常见操作步骤

### 1. 读取当前配置
使用 `read_file` 读取插件目录下的 `custom_personas.json`（或 `GEMINI_PERSONAS_CONFIG` 指向的文件），确认当前 `forceDefault`、各模型 `useCustom` 状态以及 `orchestrator.variants` 配置。

### 2. 为单个模型启用自定义人格
- 编辑 `models.<family>`（`hydrogen` / `carbon` / `neon`），将 `"useCustom": true`，按需填写 `selfName`、`title`、`badgeIcon`、`appearance`、`style`、`emojis`；若需完全手写提示词，填写 `prompt` 即可直接覆盖自动拼接模板。
- 如需匹配内置三家族之外的模型（如 `claude`），在 `customModelRules` 数组添加 `{ "id", "keyword", "enabled": true, ... }` 条目。

### 3. 为 Orchestrator 单独配置主模型与副模型
- 编辑 `orchestrator.variants.<variant>`（`carbon` / `neon` / `default`），设置 `"useCustom": true`。
- 修改 `lead.personaId` 或 `partner.personaId` 更换内置搭档；或将 `customOverride.enabled` 设为 `true` 并填写 `selfName`、`roleTitle`、`badgeIcon`、`appearance`、`style`、`emojis`。
- 可选调整 `interactionStyle`（互动基调）与 `speakingRatio`（发言比重，建议保留“代码块与核心正文保持完整不拆碎”要求）。

### 4. 一键恢复默认内置设定
- 将顶层 `"forceDefault"` 设为 `true`（临时全局还原，保留原配置内容），或将对应节点 `"useCustom"` 改回 `false`，或引导用户在侧边栏「双子星人格工坊」顶部一键点击“锁定默认”。

### 5. 验证修改结果
在插件根目录运行以下跨平台校验命令，确认 JSON 合法与测试通过：

```bash
node -e "const fs=require('fs'),os=require('os'),path=require('path'); const p=process.env.GEMINI_PERSONAS_CONFIG||(fs.existsSync('./custom_personas.json')?'./custom_personas.json':path.join(os.homedir(),'.gemini','config','plugins','gemini-personas','custom_personas.json')); JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')); console.log('Valid JSON:', p);"
node --test ./tests/route_persona.test.mjs ./tests/studio_server.test.mjs
```
