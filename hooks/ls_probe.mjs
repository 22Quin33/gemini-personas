/**
 * Fast read-only Language Server probe (with local sidecar file fallback) for
 * detecting Antigravity Orchestrator (`planExecute`) state on the active turn.
 */

import { join } from 'node:path';
import { readJsonSafe } from './fs_utils.mjs';

const LIVE_FILE_MAX_AGE_MS = 120_000;

/**
 * Normalize an LS host:port or URL into an HTTP(S) base URL without trailing slash.
 */
export function normalizeBaseUrl(address) {
  const trimmed = String(address || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

function readLiveBridgeFile(stateDir, conversationId) {
  try {
    if (!stateDir || !conversationId) return null;
    const data = readJsonSafe(join(stateDir, 'orchestrator_live.json'), null);
    if (!data) return null;
    const entry = data.conversations?.[conversationId];
    if (!entry || typeof entry !== 'object') return null;

    const updatedMs = Number(entry.updatedMs || data.updatedMs || 0);
    if (!Number.isFinite(updatedMs) || Date.now() - updatedMs > LIVE_FILE_MAX_AGE_MS) {
      return null;
    }
    if (typeof entry.planExecute !== 'boolean') return null;

    return {
      planExecute: entry.planExecute,
      planModel: String(entry.planModel || ''),
      executionModel: String(entry.executionModel || ''),
    };
  } catch {
    return null;
  }
}

export async function probePlanExecuteState({
  conversationId,
  initialNumSteps,
  stateDir = '',
  lsAddress,
  csrfToken,
  timeoutMs = 450,
} = {}) {
  const convId = String(conversationId || '').trim();
  if (!convId) return null;

  try {
    const baseUrl = normalizeBaseUrl(lsAddress ?? process.env.ANTIGRAVITY_LS_ADDRESS);
    const token = String(csrfToken ?? process.env.ANTIGRAVITY_CSRF_TOKEN ?? '').trim();
    if (baseUrl && token) {
      const stepOffset =
        typeof initialNumSteps === 'number' && Number.isFinite(initialNumSteps) && initialNumSteps > 0
          ? Math.max(0, initialNumSteps - 4)
          : 0;

      const res = await fetch(
        `${baseUrl}/exa.language_server_pb.LanguageServerService/GetCascadeTrajectorySteps`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-codeium-csrf-token': token,
          },
          body: JSON.stringify({
            cascadeId: convId,
            stepOffset,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );

      if (res.ok) {
        const data = await res.json();
        const steps = Array.isArray(data?.steps) ? data.steps : [];

        for (let i = steps.length - 1; i >= 0; i--) {
          const step = steps[i];
          if (step?.type === 'CORTEX_STEP_TYPE_USER_INPUT') {
            const ui = step.userInput || {};
            const planExecute = Boolean(
              ui.userAgentSpec?.builtinAgent?.defaultAgent?.planExecute ||
                ui.userConfig?.plannerConfig?.planExecuteConfig?.executionModel,
            );
            return {
              planExecute,
              planModel: String(ui.userConfig?.plannerConfig?.planModel || ''),
              executionModel: String(
                ui.userConfig?.plannerConfig?.planExecuteConfig?.executionModel || '',
              ),
            };
          }
        }
      }
    }
  } catch {
    // Fall through to local sidecar live file fallback.
  }

  return readLiveBridgeFile(stateDir, convId);
}
