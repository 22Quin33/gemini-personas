/**
 * Antigravity PostToolUse hook handler for Orchestrator handoffs & subagent telemetry.
 *
 * Captures:
 * 1. `exit_plan_mode`: transitions an active Planning turn into the Orchestrator
 *    Execution Phase handoff (`handoffPending: true`) with concise plan summary.
 * 2. `invoke_subagent` / `swarm` (`action: "add"`): queues concise subagent
 *    dispatch summaries when running in Orchestrator mode for single-shot
 *    delivery on the next PreInvocation.
 */

import { loadCustomConfig } from './config.mjs';
import { resolvePersonaForModel, resolveSoloFamily } from './personas.mjs';
import {
  readSessionState,
  readStdin,
  resolveStateDir,
  sessionStateFilePath,
  writeSessionStateAtomic,
} from './state.mjs';

const MAX_PENDING_REPORTS = 5;
const MAX_SUMMARY_CHARS = 180;

function compactSummary(text) {
  const cleaned = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  if (cleaned.length <= MAX_SUMMARY_CHARS) return cleaned;
  return `${cleaned.slice(0, MAX_SUMMARY_CHARS - 1)}…`;
}

function normalizeLeadFamily(modelName) {
  const family = resolveSoloFamily(modelName);
  if (family === 'neon' || family === 'carbon') return family;
  return 'default';
}

function extractReport(payload) {
  const toolCall = payload?.toolCall;
  if (!toolCall || typeof toolCall !== 'object') return null;

  const toolName = String(toolCall.name || '').trim();
  const args = toolCall.args && typeof toolCall.args === 'object' ? toolCall.args : {};
  const errorText = compactSummary(payload?.error || '');
  const id = String(toolCall.id || '').trim();

  if (toolName === 'invoke_subagent') {
    const role = compactSummary(args.Role || args.role || args.TypeName || args.typeName || 'subagent');
    const typeName = compactSummary(args.TypeName || args.typeName || '');
    const taskSummary = compactSummary(args.Prompt || args.prompt || '');
    return {
      id,
      toolName,
      role,
      typeName,
      taskSummary,
      error: errorText,
      stepIdx: typeof payload?.stepIdx === 'number' ? payload.stepIdx : null,
      recordedAt: new Date().toISOString(),
    };
  }

  if (toolName === 'swarm') {
    const action = String(args.action || '').trim().toLowerCase();
    if (action !== 'add') return null;
    const role = compactSummary(args.name || 'swarm-worker');
    const briefSource =
      args.brief || (Array.isArray(args.tasks) ? args.tasks.join(' / ') : '');
    const taskSummary = compactSummary(briefSource);
    return {
      id,
      toolName,
      role,
      typeName: 'swarm',
      taskSummary,
      error: errorText,
      stepIdx: typeof payload?.stepIdx === 'number' ? payload.stepIdx : null,
      recordedAt: new Date().toISOString(),
    };
  }

  return null;
}

async function main() {
  try {
    const raw = await readStdin();
    if (!raw || !raw.trim()) {
      process.stdout.write('{}\n');
      return;
    }

    const payload = JSON.parse(raw);
    const conversationId = String(payload?.conversationId || '').trim();
    if (!conversationId) {
      process.stdout.write('{}\n');
      return;
    }

    const toolCall = payload?.toolCall;
    const toolName = String(toolCall?.name || '').trim();
    const args = toolCall?.args && typeof toolCall.args === 'object' ? toolCall.args : {};
    const modelName = String(payload?.modelName || '').trim();

    const stateDir = resolveStateDir(payload);
    const stateFile = sessionStateFilePath(stateDir, conversationId);
    const prevState = readSessionState(stateFile);

    if (toolName === 'exit_plan_mode') {
      const leadFamily = prevState?.orchestrator?.leadFamily || normalizeLeadFamily(modelName);
      const planSummary = compactSummary(args.plan || '');
      const baseState = prevState || {
        conversationId,
        personaId: '',
        personaFingerprint: '',
        modelName,
        hookEventName: 'PostToolUse',
        switchCount: 0,
        lastInjectedMinSteps: null,
        pendingSubagentReports: [],
      };

      writeSessionStateAtomic(stateFile, {
        ...baseState,
        conversationId,
        orchestrator: {
          ...(baseState.orchestrator || {}),
          active: true,
          source: 'planExecute',
          leadFamily,
          planModelName: baseState.orchestrator?.planModelName || modelName,
          phase: 'executing',
          lastPlanSummary: planSummary,
          handoffPending: true,
        },
        updatedAt: new Date().toISOString(),
      });

      process.stdout.write('{}\n');
      return;
    }

    const config = loadCustomConfig();
    const currentPersona = resolvePersonaForModel(modelName, {
      config,
      forceOrchestratorLeadFamily: prevState?.orchestrator?.active
        ? prevState.orchestrator.leadFamily
        : '',
    });
    const isOrchestratorActive =
      currentPersona.mode === 'orchestrator' || prevState?.orchestrator?.active === true;

    if (!isOrchestratorActive) {
      process.stdout.write('{}\n');
      return;
    }

    const report = extractReport(payload);
    if (!report) {
      process.stdout.write('{}\n');
      return;
    }

    const baseState = prevState || {
      conversationId,
      personaId: '',
      personaFingerprint: '',
      modelName,
      hookEventName: 'PostToolUse',
      switchCount: 0,
      lastInjectedMinSteps: null,
      pendingSubagentReports: [],
    };

    const existing = Array.isArray(baseState.pendingSubagentReports)
      ? baseState.pendingSubagentReports
      : [];
    const deduped = report.id ? existing.filter((item) => item?.id !== report.id) : existing;
    const nextReports = [...deduped, report].slice(-MAX_PENDING_REPORTS);

    writeSessionStateAtomic(stateFile, {
      ...baseState,
      conversationId,
      pendingSubagentReports: nextReports,
      updatedAt: new Date().toISOString(),
    });

    process.stdout.write('{}\n');
  } catch {
    process.stdout.write('{}\n');
  }
}

await main();
