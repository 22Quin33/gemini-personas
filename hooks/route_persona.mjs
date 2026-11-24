/**
 * Antigravity lifecycle hook handler (SessionStart / PreInvocation).
 *
 * Dynamically routes model-specific Gemini-tan personas (solo & Orchestrator
 * dual-voice) with custom persona config support, fingerprint hot-reload,
 * live `planExecute` Orchestrator detection + Execution relay, trajectory
 * rollback recovery, and single-shot subagent telemetry delivery.
 */

import { computePersonaFingerprint, loadCustomConfig } from './config.mjs';
import { probePlanExecuteState } from './ls_probe.mjs';
import {
  buildExecutionRelayPayload,
  buildSubagentReportPayload,
  buildSystemMessagePayload,
  PERSONAS,
  resolvePersonaForModel,
  resolveSoloFamily,
} from './personas.mjs';
import {
  readSessionState,
  readStdin,
  resolveStateDir,
  sessionStateFilePath,
  writeSessionStateAtomic,
} from './state.mjs';

function detectTrajectoryRollback(prevState, payload) {
  if (!prevState) return false;
  if (String(payload?.hookEventName || '') !== 'PreInvocation') return false;
  const initialNumSteps = payload?.initialNumSteps;
  if (typeof initialNumSteps !== 'number' || !Number.isFinite(initialNumSteps)) {
    return false;
  }
  if (initialNumSteps <= 1) return true;
  if (
    typeof prevState.lastInjectedMinSteps === 'number' &&
    Number.isFinite(prevState.lastInjectedMinSteps) &&
    initialNumSteps < prevState.lastInjectedMinSteps
  ) {
    return true;
  }
  return false;
}

function computeNextInjectedMinSteps(payload, prevState) {
  const hookEventName = String(payload?.hookEventName || '');
  if (hookEventName === 'SessionStart') {
    return 2;
  }
  const initialNumSteps = payload?.initialNumSteps;
  if (typeof initialNumSteps === 'number' && Number.isFinite(initialNumSteps)) {
    return initialNumSteps + 1;
  }
  return typeof prevState?.lastInjectedMinSteps === 'number'
    ? prevState.lastInjectedMinSteps
    : null;
}

function normalizeLeadFamily(modelName) {
  const family = resolveSoloFamily(modelName);
  if (family === 'neon' || family === 'carbon') return family;
  return 'default';
}

function createPersonaSnapshot(persona) {
  if (!persona) return null;
  return {
    id: persona.id,
    mode: persona.mode,
    selfName: persona.selfName,
    title: persona.title,
    leadName: persona.leadName || '',
    partnerName: persona.partnerName || '',
  };
}

async function resolveOrchestratorState({
  conversationId,
  modelName,
  initialNumSteps,
  stateDir,
  lastUserInput,
  isNewUserTurn,
  prevState,
}) {
  const normalizedModel = modelName.toLowerCase();

  // Case 1: explicit orchestrator model string (e.g., "orchestrator-carbon")
  if (normalizedModel.includes('orchestrator')) {
    return {
      orchestratorState: {
        active: true,
        source: 'explicit',
        leadFamily: normalizeLeadFamily(normalizedModel),
        planModelName: modelName,
        phase: 'planning',
        lastPlanSummary: '',
        handoffPending: false,
      },
      handoffTriggered: false,
    };
  }

  const prevOrch = prevState?.orchestrator;

  // Case 2: exit_plan_mode just transitioned Planning -> Execution
  if (prevOrch?.active && prevOrch?.handoffPending) {
    return {
      orchestratorState: {
        ...prevOrch,
        active: true,
        source: 'planExecute',
        phase: 'executing',
        handoffPending: false,
      },
      handoffTriggered: true,
    };
  }

  // Case 3: start of a new user turn -> probe LS for live planExecute flag
  if (isNewUserTurn) {
    const probed = await probePlanExecuteState({
      conversationId,
      initialNumSteps,
      stateDir,
    });
    if (probed) {
      if (probed.planExecute) {
        return {
          orchestratorState: {
            active: true,
            source: 'planExecute',
            leadFamily: normalizeLeadFamily(modelName),
            planModelName: modelName,
            phase: 'planning',
            lastPlanSummary: '',
            handoffPending: false,
          },
          handoffTriggered: false,
        };
      }
      return {
        orchestratorState: { active: false },
        handoffTriggered: false,
      };
    }

    // Probe unavailable (no LS env / error / SessionStart): only preserve planExecute
    // if no new user text arrived; explicit orchestrator models exit when modelName changes.
    if (
      prevOrch?.active &&
      prevOrch?.source === 'planExecute' &&
      (!lastUserInput || lastUserInput === (prevState?.lastUserInput || ''))
    ) {
      return {
        orchestratorState: { ...prevOrch, handoffPending: false },
        handoffTriggered: false,
      };
    }
    return {
      orchestratorState: { active: false },
      handoffTriggered: false,
    };
  }

  // Case 4: mid-turn tool loop -> preserve active planExecute Orchestrator state
  if (prevOrch?.active && prevOrch?.source === 'planExecute') {
    const returnedToPlanning =
      prevOrch.phase === 'executing' && modelName && modelName === prevOrch.planModelName;
    return {
      orchestratorState: {
        ...prevOrch,
        phase: returnedToPlanning ? 'planning' : prevOrch.phase || 'planning',
        handoffPending: false,
      },
      handoffTriggered: false,
    };
  }

  return {
    orchestratorState: { active: false },
    handoffTriggered: false,
  };
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

    const modelName = String(payload?.modelName || '').trim();
    const hookEventName = String(payload?.hookEventName || '');
    const lastUserInput = String(payload?.lastUserInput || '');
    const initialNumSteps = payload?.initialNumSteps;

    const customConfig = loadCustomConfig();
    const stateDir = resolveStateDir(payload);
    const stateFile = sessionStateFilePath(stateDir, conversationId);
    const prevState = readSessionState(stateFile);

    const isRollback = detectTrajectoryRollback(prevState, payload);
    const isNewUserTurn =
      hookEventName === 'SessionStart' ||
      !prevState ||
      isRollback ||
      Boolean(lastUserInput && lastUserInput !== (prevState?.lastUserInput || ''));

    const { orchestratorState, handoffTriggered } = await resolveOrchestratorState({
      conversationId,
      modelName,
      initialNumSteps,
      stateDir,
      lastUserInput,
      isNewUserTurn,
      prevState,
    });

    const currentPersona = resolvePersonaForModel(modelName, {
      config: customConfig,
      forceOrchestratorLeadFamily: orchestratorState.active ? orchestratorState.leadFamily : '',
    });

    const fingerprint = computePersonaFingerprint(currentPersona);
    const personaChanged =
      !prevState ||
      !prevState.personaId ||
      prevState.personaId !== currentPersona.id ||
      (prevState.personaFingerprint && prevState.personaFingerprint !== fingerprint);
    const needPersonaInject = personaChanged || isRollback;

    const queuedReports = Array.isArray(prevState?.pendingSubagentReports)
      ? prevState.pendingSubagentReports
      : [];
    const deliverableReports =
      currentPersona.mode === 'orchestrator' && queuedReports.length > 0 ? queuedReports : [];

    if (!needPersonaInject && !handoffTriggered && deliverableReports.length === 0) {
      // Persist updated orchestrator/lastUserInput state if changed or drop stale reports
      const needsStateSync =
        queuedReports.length > 0 ||
        (lastUserInput && lastUserInput !== (prevState?.lastUserInput || '')) ||
        Boolean(prevState?.orchestrator?.active) !== Boolean(orchestratorState.active);
      if (needsStateSync && prevState) {
        writeSessionStateAtomic(stateFile, {
          ...prevState,
          lastUserInput: lastUserInput || prevState.lastUserInput || '',
          orchestrator: orchestratorState,
          pendingSubagentReports: [],
          updatedAt: new Date().toISOString(),
        });
      }
      process.stdout.write('{}\n');
      return;
    }

    const previousPersona =
      personaChanged && !isRollback && prevState?.personaId
        ? prevState.personaSnapshot || PERSONAS[prevState.personaId] || null
        : null;

    let systemMessageObj = null;
    if (needPersonaInject) {
      systemMessageObj = buildSystemMessagePayload(currentPersona, previousPersona, {
        executionRelay: handoffTriggered,
        planSummary: orchestratorState.lastPlanSummary || '',
        subagentReports: deliverableReports,
      });
    } else if (handoffTriggered) {
      systemMessageObj = buildExecutionRelayPayload(currentPersona, {
        planSummary: orchestratorState.lastPlanSummary || '',
        subagentReports: deliverableReports,
      });
    } else if (deliverableReports.length > 0) {
      systemMessageObj = buildSubagentReportPayload(currentPersona, deliverableReports);
    }

    const nextMinSteps = needPersonaInject
      ? computeNextInjectedMinSteps(payload, prevState)
      : prevState?.lastInjectedMinSteps ?? null;

    writeSessionStateAtomic(stateFile, {
      conversationId,
      personaId: currentPersona.id,
      personaFingerprint: fingerprint,
      personaSnapshot: createPersonaSnapshot(currentPersona),
      modelName,
      hookEventName,
      lastUserInput: lastUserInput || prevState?.lastUserInput || '',
      switchCount: needPersonaInject
        ? (Number(prevState?.switchCount) || 0) + (personaChanged ? 1 : 0)
        : Number(prevState?.switchCount) || 1,
      lastInjectedMinSteps: nextMinSteps,
      orchestrator: orchestratorState,
      pendingSubagentReports: [],
      updatedAt: new Date().toISOString(),
    });

    if (!systemMessageObj) {
      process.stdout.write('{}\n');
      return;
    }

    process.stdout.write(
      `${JSON.stringify({
        injectSteps: [
          {
            systemMessage: systemMessageObj,
          },
        ],
      })}\n`,
    );
  } catch {
    // Lifecycle hooks must never block or crash the agent execution loop.
    process.stdout.write('{}\n');
  }
}

await main();
