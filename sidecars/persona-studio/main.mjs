/**
 * Antigravity Sidecar backend for 双子星人格工坊 (`gemini-personas/persona-studio`).
 *
 * - Serves the Chibi Persona Studio Web UI and chibi PNG portraits in the aux pane.
 * - Reads/writes `custom_personas.json` atomically using the shared hook config contract.
 * - Provides live prompt/fingerprint previews via `resolvePersonaForModel`.
 * - Periodically polls Antigravity LS trajectories (when attached) and mirrors
 *   fresh `planExecute` flags into `<appData>/plugin_data/gemini-personas/orchestrator_live.json`
 *   so lifecycle hooks can detect real Orchestrator turns in zero latency.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  computePersonaFingerprint,
  createDefaultCustomConfig,
  loadCustomConfig,
  normalizeCustomConfig,
  resolveCustomConfigPath,
  saveCustomConfigAtomic,
} from '../../hooks/config.mjs';
import { writeFileAtomic } from '../../hooks/fs_utils.mjs';
import { normalizeBaseUrl } from '../../hooks/ls_probe.mjs';
import {
  buildSystemMessagePayload,
  PERSONAS,
  resolvePersonaForModel,
} from '../../hooks/personas.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(dirname(__dirname));
const ASSETS_DIR = join(PLUGIN_ROOT, 'assets');

function getGeminiRoot() {
  const customHome = String(process.env.GEMINI_HOME || '').trim();
  return customHome || join(homedir(), '.gemini');
}

function findAppDataDirs() {
  const execDataDir = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR;
  if (execDataDir) {
    for (let d = execDataDir; d !== dirname(d); d = dirname(d)) {
      if (basename(d) === 'sidecar_data') {
        const appData = dirname(d);
        if (existsSync(appData)) return [appData];
      }
    }
  }
  if (process.env.ANTIGRAVITY_APP_DATA_DIR && existsSync(process.env.ANTIGRAVITY_APP_DATA_DIR)) {
    return [process.env.ANTIGRAVITY_APP_DATA_DIR];
  }
  const geminiRoot = getGeminiRoot();
  const out = [];
  try {
    for (const entry of readdirSync(geminiRoot)) {
      const candidate = join(geminiRoot, entry);
      if (
        existsSync(join(candidate, 'brain')) ||
        existsSync(join(candidate, 'lib', 'node_modules', 'sidecar_sdk', 'index.mjs'))
      ) {
        out.push(candidate);
      }
    }
  } catch {
    // Ignore unreadable root.
  }
  return out;
}

function resolveAppDataDir() {
  return findAppDataDirs()[0] || join(getGeminiRoot(), 'antigravity');
}

function resolvePluginDataDir() {
  const envData = String(process.env.PLUGIN_DATA || '').trim();
  if (envData) return envData;
  return join(resolveAppDataDir(), 'plugin_data', 'gemini-personas');
}

async function loadSidecarSdk() {
  const explicitSdk = String(process.env.SIDECAR_SDK_PATH || '').trim();
  if (explicitSdk && existsSync(explicitSdk)) {
    return await import(pathToFileURL(explicitSdk).href);
  }
  try {
    return await import('sidecar_sdk');
  } catch {
    for (const appData of findAppDataDirs()) {
      const sdkPath = join(appData, 'lib', 'node_modules', 'sidecar_sdk', 'index.mjs');
      if (existsSync(sdkPath)) {
        return await import(pathToFileURL(sdkPath).href);
      }
    }
    const geminiRoot = getGeminiRoot();
    for (const surface of ['antigravity', 'antigravity-ide', 'antigravity-cli']) {
      const fallback = join(geminiRoot, surface, 'lib', 'node_modules', 'sidecar_sdk', 'index.mjs');
      if (existsSync(fallback)) {
        return await import(pathToFileURL(fallback).href);
      }
    }
    throw new Error('Unable to locate sidecar_sdk');
  }
}

if (!process.env.ANTIGRAVITY_SIDECAR_WEB_PORT) {
  process.env.ANTIGRAVITY_SIDECAR_WEB_PORT = process.env.PORT || '18923';
}
if (!process.env.ANTIGRAVITY_LS_ADDRESS) {
  process.env.ANTIGRAVITY_LS_ADDRESS = '127.0.0.1:5387';
}
if (!process.env.ANTIGRAVITY_CSRF_TOKEN) {
  process.env.ANTIGRAVITY_CSRF_TOKEN = 'standalone';
}

const { SidecarApp, Response } = await loadSidecarSdk();
const app = new SidecarApp();

const LS_ADDRESS = process.env.ANTIGRAVITY_LS_ADDRESS;
const CSRF_TOKEN = process.env.ANTIGRAVITY_CSRF_TOKEN;
const POLL_DISABLED = process.env.PERSONA_STUDIO_DISABLE_LS_POLL === '1';

let lastLiveOrchestrator = {
  updatedMs: 0,
  conversations: {},
};
let pollBusy = false;

function buildBuiltinMetadata() {
  return {
    solo: {
      hydrogen: {
        id: 'hydrogen',
        selfName: PERSONAS.hydrogen.selfName,
        title: PERSONAS.hydrogen.title,
        badgeIcon: PERSONAS.hydrogen.badgeIcon,
        appearance: PERSONAS.hydrogen.appearance,
        style: PERSONAS.hydrogen.style,
        emojis: PERSONAS.hydrogen.emojis,
      },
      carbon: {
        id: 'carbon',
        selfName: PERSONAS.carbon.selfName,
        title: PERSONAS.carbon.title,
        badgeIcon: PERSONAS.carbon.badgeIcon,
        appearance: PERSONAS.carbon.appearance,
        style: PERSONAS.carbon.style,
        emojis: PERSONAS.carbon.emojis,
      },
      neon: {
        id: 'neon',
        selfName: PERSONAS.neon.selfName,
        title: PERSONAS.neon.title,
        badgeIcon: PERSONAS.neon.badgeIcon,
        appearance: PERSONAS.neon.appearance,
        style: PERSONAS.neon.style,
        emojis: PERSONAS.neon.emojis,
      },
    },
    orchestrator: {
      carbon: {
        id: 'orchestrator_carbon',
        selfName: PERSONAS.orchestrator_carbon.selfName,
        title: PERSONAS.orchestrator_carbon.title,
        badgeIcon: PERSONAS.orchestrator_carbon.badgeIcon,
        leadId: PERSONAS.orchestrator_carbon.leadId,
        partnerId: PERSONAS.orchestrator_carbon.partnerId,
        leadName: PERSONAS.orchestrator_carbon.leadName,
        partnerName: PERSONAS.orchestrator_carbon.partnerName,
        interactionStyle: '冰山总指挥小凛冷静拍板兜底 × 星云猫娘小幽跑腿执行吐槽',
        speakingRatio: '开场拌嘴（1~3 句） + 技术正文与代码块保持完整高密度不拆碎 + 收尾一唱一和（1~2 句）',
      },
      neon: {
        id: 'orchestrator_neon',
        selfName: PERSONAS.orchestrator_neon.selfName,
        title: PERSONAS.orchestrator_neon.title,
        badgeIcon: PERSONAS.orchestrator_neon.badgeIcon,
        leadId: PERSONAS.orchestrator_neon.leadId,
        partnerId: PERSONAS.orchestrator_neon.partnerId,
        leadName: PERSONAS.orchestrator_neon.leadName,
        partnerName: PERSONAS.orchestrator_neon.partnerName,
        interactionStyle: '舞台总导演小霓闪耀定调 × 机动场务小幽打 call 拌嘴执行',
        speakingRatio: '开场拌嘴（1~3 句） + 技术正文与代码块保持完整高密度不拆碎 + 收尾一唱一和（1~2 句）',
      },
      default: {
        id: 'orchestrator_carbon',
        selfName: PERSONAS.orchestrator_carbon.selfName,
        title: PERSONAS.orchestrator_carbon.title,
        badgeIcon: PERSONAS.orchestrator_carbon.badgeIcon,
        leadId: PERSONAS.orchestrator_carbon.leadId,
        partnerId: PERSONAS.orchestrator_carbon.partnerId,
        leadName: PERSONAS.orchestrator_carbon.leadName,
        partnerName: PERSONAS.orchestrator_carbon.partnerName,
        interactionStyle: '冰山总指挥小凛冷静拍板兜底 × 星云猫娘小幽跑腿执行吐槽',
        speakingRatio: '开场拌嘴（1~3 句） + 技术正文与代码块保持完整高密度不拆碎 + 收尾一唱一和（1~2 句）',
      },
    },
  };
}

async function lsRpc(method, body = {}, timeoutMs = 1800) {
  const baseUrl = normalizeBaseUrl(LS_ADDRESS);
  if (!baseUrl) return null;
  const res = await fetch(
    `${baseUrl}/exa.language_server_pb.LanguageServerService/${method}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-codeium-csrf-token': CSRF_TOKEN,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  if (!res.ok) return null;
  return res.json();
}

async function pollLiveOrchestratorState() {
  if (POLL_DISABLED || pollBusy || !LS_ADDRESS || !CSRF_TOKEN || CSRF_TOKEN === 'standalone') {
    return;
  }
  pollBusy = true;
  try {
    const allTraj = await lsRpc('GetAllCascadeTrajectories', {}, 2000);
    const summaries = allTraj?.trajectorySummaries || {};
    const candidates = Object.entries(summaries)
      .map(([cid, sum]) => ({
        cid,
        running: String(sum?.status || '').includes('RUNNING'),
        stepCount: Number(sum?.stepCount || 0),
        lastUserInputStepIndex: Number(sum?.lastUserInputStepIndex),
        annotPlanExecute:
          typeof sum?.annotations?.planExecute === 'boolean'
            ? sum.annotations.planExecute
            : null,
        modMs: Date.parse(sum?.lastModifiedTime || '') || 0,
      }))
      .sort((a, b) => {
        if (a.running !== b.running) return Number(b.running) - Number(a.running);
        return b.modMs - a.modMs;
      })
      .slice(0, 6);

    const now = Date.now();
    const conversations = {};

    await Promise.all(
      candidates.map(async ({ cid, stepCount, lastUserInputStepIndex, annotPlanExecute }) => {
        try {
          const stepOffset =
            Number.isFinite(lastUserInputStepIndex) && lastUserInputStepIndex >= 0
              ? lastUserInputStepIndex
              : stepCount > 12
                ? stepCount - 12
                : 0;
          const res = await lsRpc(
            'GetCascadeTrajectorySteps',
            { cascadeId: cid, stepOffset },
            1500,
          );
          const steps = Array.isArray(res?.steps) ? res.steps : [];
          let recorded = false;
          for (let i = steps.length - 1; i >= 0; i--) {
            const step = steps[i];
            if (step?.type === 'CORTEX_STEP_TYPE_USER_INPUT') {
              const ui = step.userInput || {};
              const planExecute = Boolean(
                ui.userAgentSpec?.builtinAgent?.defaultAgent?.planExecute ||
                  ui.userConfig?.plannerConfig?.planExecuteConfig?.executionModel ||
                  annotPlanExecute,
              );
              conversations[cid] = {
                planExecute,
                planModel: String(ui.userConfig?.plannerConfig?.planModel || ''),
                executionModel: String(
                  ui.userConfig?.plannerConfig?.planExecuteConfig?.executionModel || '',
                ),
                updatedMs: now,
              };
              recorded = true;
              break;
            }
          }
          if (!recorded && annotPlanExecute !== null) {
            conversations[cid] = {
              planExecute: annotPlanExecute,
              planModel: '',
              executionModel: '',
              updatedMs: now,
            };
          }
        } catch {
          if (annotPlanExecute !== null) {
            conversations[cid] = {
              planExecute: annotPlanExecute,
              planModel: '',
              executionModel: '',
              updatedMs: now,
            };
          }
        }
      }),
    );

    const snapshot = {
      updatedMs: now,
      conversations,
    };
    lastLiveOrchestrator = snapshot;
    writeFileAtomic(join(resolvePluginDataDir(), 'orchestrator_live.json'), JSON.stringify(snapshot));
  } catch {
    // Polling is best-effort and must never crash the sidecar.
  } finally {
    pollBusy = false;
  }
}

if (!POLL_DISABLED && CSRF_TOKEN !== 'standalone') {
  pollLiveOrchestratorState();
  setInterval(pollLiveOrchestratorState, 1500).unref();
}

function serveImageAsset(filename) {
  const fullPath = join(ASSETS_DIR, filename);
  if (!existsSync(fullPath)) {
    return new Response('Not found', { status: 404, contentType: 'text/plain; charset=utf-8' });
  }
  return new Response(readFileSync(fullPath), {
    contentType: 'image/png',
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
  });
}

app.page('/', () => readFileSync(join(__dirname, 'index.html'), 'utf-8'));
app.page('/styles.css', () =>
  new Response(readFileSync(join(__dirname, 'styles.css'), 'utf-8'), {
    contentType: 'text/css; charset=utf-8',
  }),
);
app.page('/app.js', () =>
  new Response(readFileSync(join(__dirname, 'app.js'), 'utf-8'), {
    contentType: 'application/javascript; charset=utf-8',
  }),
);
app.page('/assets/chibi-hydrogen.png', () => serveImageAsset('chibi-hydrogen.png'));
app.page('/assets/chibi-carbon.png', () => serveImageAsset('chibi-carbon.png'));
app.page('/assets/chibi-neon.png', () => serveImageAsset('chibi-neon.png'));

app.api(
  '/api/state',
  async () => {
    const configPath = resolveCustomConfigPath();
    const config = normalizeCustomConfig(loadCustomConfig(configPath));
    return {
      ok: true,
      config,
      configPath,
      builtins: buildBuiltinMetadata(),
      hostConversationId: app.config.conversationId || '',
      liveOrchestrator: lastLiveOrchestrator,
    };
  },
  'GET',
);

app.api(
  '/api/config',
  async (data) => {
    const configPath = resolveCustomConfigPath();
    const incoming = data && typeof data === 'object' ? (data.config || data) : {};
    const saved = saveCustomConfigAtomic(incoming, configPath);
    return { ok: true, config: saved, configPath };
  },
  'POST',
);

app.api(
  '/api/reset',
  async (data) => {
    const configPath = resolveCustomConfigPath();
    const current = normalizeCustomConfig(loadCustomConfig(configPath));
    const defaults = createDefaultCustomConfig();
    const scope = String(data?.scope || 'all').trim();
    const key = String(data?.key || '').trim();

    let next = current;
    if (scope === 'all') {
      next = defaults;
    } else if (scope === 'solo') {
      next = { ...current, models: defaults.models };
    } else if (scope === 'model' && defaults.models[key]) {
      next = {
        ...current,
        models: { ...current.models, [key]: defaults.models[key] },
      };
    } else if (scope === 'orchestrator') {
      next = { ...current, orchestrator: defaults.orchestrator };
    } else if (scope === 'variant' && defaults.orchestrator.variants[key]) {
      next = {
        ...current,
        orchestrator: {
          ...current.orchestrator,
          variants: {
            ...current.orchestrator.variants,
            [key]: defaults.orchestrator.variants[key],
          },
        },
      };
    }

    const saved = saveCustomConfigAtomic(next, configPath);
    return { ok: true, config: saved, configPath };
  },
  'POST',
);

app.api(
  '/api/preview',
  async (data) => {
    const modelName = String(data?.modelName || 'gemini-4-hydrogen-xhigh').trim();
    const cfg = data?.config
      ? normalizeCustomConfig(data.config)
      : normalizeCustomConfig(loadCustomConfig());
    const persona = resolvePersonaForModel(modelName, { config: cfg });
    const fingerprint = computePersonaFingerprint(persona);
    const payload = buildSystemMessagePayload(persona);
    return {
      ok: true,
      persona: {
        id: persona.id,
        mode: persona.mode,
        selfName: persona.selfName,
        title: persona.title,
        badgeIcon: persona.badgeIcon,
        leadName: persona.leadName || '',
        partnerName: persona.partnerName || '',
      },
      fingerprint,
      systemMessage: payload.systemMessage,
    };
  },
  'POST',
);

await app.run();
