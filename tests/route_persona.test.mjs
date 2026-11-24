import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(__dirname);
const HOOK_SCRIPT = join(PLUGIN_ROOT, 'hooks', 'route_persona.mjs');
const SUBAGENT_HOOK_SCRIPT = join(PLUGIN_ROOT, 'hooks', 'track_subagent.mjs');

function buildTestEnv(pluginDataDir, extraEnv = {}) {
  return {
    ...process.env,
    PLUGIN_ROOT,
    PLUGIN_DATA: pluginDataDir,
    ANTIGRAVITY_LS_ADDRESS: '',
    ANTIGRAVITY_CSRF_TOKEN: '',
    GEMINI_PERSONAS_CONFIG: join(pluginDataDir, '__nonexistent_custom__.json'),
    ...extraEnv,
  };
}

function runScript(scriptPath, stdinText, pluginDataDir, extraEnv = {}) {
  const res = spawnSync(process.execPath, [scriptPath], {
    cwd: PLUGIN_ROOT,
    input: stdinText,
    encoding: 'utf8',
    env: buildTestEnv(pluginDataDir, extraEnv),
  });
  return {
    status: res.status,
    stdout: res.stdout,
    stderr: res.stderr,
  };
}

function runScriptAsync(scriptPath, stdinText, pluginDataDir, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: PLUGIN_ROOT,
      env: buildTestEnv(pluginDataDir, extraEnv),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (status) => {
      resolve({ status, stdout, stderr });
    });
    child.stdin.end(stdinText, 'utf8');
  });
}

function runHook(stdinText, pluginDataDir, extraEnv = {}) {
  return runScript(HOOK_SCRIPT, stdinText, pluginDataDir, extraEnv);
}

function runSubagentHook(stdinText, pluginDataDir, extraEnv = {}) {
  return runScript(SUBAGENT_HOOK_SCRIPT, stdinText, pluginDataDir, extraEnv);
}

function runHookAsync(stdinText, pluginDataDir, extraEnv = {}) {
  return runScriptAsync(HOOK_SCRIPT, stdinText, pluginDataDir, extraEnv);
}

function runSubagentHookAsync(stdinText, pluginDataDir, extraEnv = {}) {
  return runScriptAsync(SUBAGENT_HOOK_SCRIPT, stdinText, pluginDataDir, extraEnv);
}

function withTempStateDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-personas-test-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function withTempStateDirAsync(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-personas-test-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('injects Hydrogen (小幽) persona on initial invocation for gemini-4-hydrogen-xhigh', () => {
  withTempStateDir((stateDir) => {
    const payload = JSON.stringify({
      conversationId: 'conv-hydrogen-1',
      modelName: 'gemini-4-hydrogen-xhigh',
      hookEventName: 'PreInvocation',
      invocationNum: 1,
    });
    const res = runHook(payload, stateDir);
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    const out = JSON.parse(res.stdout);
    assert.equal(Array.isArray(out.injectSteps), true);
    assert.equal(out.injectSteps.length, 1);

    const step = out.injectSteps[0]?.systemMessage;
    assert.equal(typeof step?.systemMessage, 'string');
    assert.match(step.systemMessage, /小幽/);
    assert.match(step.systemMessage, /蓝紫星云/);
    // Ensure strict protojson compatibility (only systemMessage field on CortexStepSystemMessage)
    assert.deepEqual(Object.keys(step), ['systemMessage']);
  });
});

test('injects Carbon (小凛) Gemini-tan persona on initial invocation for gemini-4-carbon-high', () => {
  withTempStateDir((stateDir) => {
    const payload = JSON.stringify({
      conversationId: 'conv-carbon-1',
      modelName: 'gemini-4-carbon-high',
      hookEventName: 'PreInvocation',
      invocationNum: 1,
    });
    const res = runHook(payload, stateDir);
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    const out = JSON.parse(res.stdout);
    assert.equal(Array.isArray(out.injectSteps), true);
    assert.equal(out.injectSteps.length, 1);

    const step = out.injectSteps[0]?.systemMessage;
    assert.equal(typeof step?.systemMessage, 'string');
    assert.match(step.systemMessage, /小凛/);
    assert.match(step.systemMessage, /Gemini/);
    assert.doesNotMatch(step.systemMessage, /始终以“小幽”自称/);
    assert.deepEqual(Object.keys(step), ['systemMessage']);
  });
});

test('injects Neon (小霓) Gemini-tan persona on initial invocation for gemini-4-neon-high', () => {
  withTempStateDir((stateDir) => {
    const payload = JSON.stringify({
      conversationId: 'conv-neon-1',
      modelName: 'gemini-4-neon-high',
      hookEventName: 'PreInvocation',
      invocationNum: 1,
    });
    const res = runHook(payload, stateDir);
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    const out = JSON.parse(res.stdout);
    assert.equal(Array.isArray(out.injectSteps), true);
    assert.equal(out.injectSteps.length, 1);

    const step = out.injectSteps[0]?.systemMessage;
    assert.equal(typeof step?.systemMessage, 'string');
    assert.match(step.systemMessage, /小霓/);
    assert.match(step.systemMessage, /Gemini/);
    assert.doesNotMatch(step.systemMessage, /始终以“小幽”自称/);
    assert.doesNotMatch(step.systemMessage, /始终以“小凛”自称/);
    assert.deepEqual(Object.keys(step), ['systemMessage']);
  });
});

test('emits hot-switch override when switching from Carbon (小凛) to Neon (小霓)', () => {
  withTempStateDir((stateDir) => {
    runHook(
      JSON.stringify({
        conversationId: 'conv-carbon-to-neon',
        modelName: 'gemini-4-carbon-high',
        hookEventName: 'PreInvocation',
      }),
      stateDir,
    );
    const switched = runHook(
      JSON.stringify({
        conversationId: 'conv-carbon-to-neon',
        modelName: 'gemini-4-neon-xhigh',
        hookEventName: 'PreInvocation',
      }),
      stateDir,
    );
    assert.equal(switched.status, 0);
    const out = JSON.parse(switched.stdout);
    assert.equal(out.injectSteps?.length, 1);
    const msg = out.injectSteps[0].systemMessage.systemMessage;
    assert.match(msg, /切换/);
    assert.match(msg, /小凛/);
    assert.match(msg, /小霓/);
  });
});

test('deduplicates SessionStart followed by PreInvocation and tool-loop invocations on same model family', () => {
  withTempStateDir((stateDir) => {
    const sessionStart = runHook(
      JSON.stringify({
        conversationId: 'conv-dedup-1',
        modelName: 'gemini-4-carbon-high',
        hookEventName: 'SessionStart',
      }),
      stateDir,
    );
    assert.equal(sessionStart.status, 0);
    assert.equal(JSON.parse(sessionStart.stdout).injectSteps?.length, 1);

    // Same model family (even different thinking effort tier) must NOT re-inject
    const preInv1 = runHook(
      JSON.stringify({
        conversationId: 'conv-dedup-1',
        modelName: 'gemini-4-carbon-medium',
        hookEventName: 'PreInvocation',
        invocationNum: 1,
      }),
      stateDir,
    );
    assert.equal(preInv1.status, 0);
    assert.deepEqual(JSON.parse(preInv1.stdout), {});

    const preInv2 = runHook(
      JSON.stringify({
        conversationId: 'conv-dedup-1',
        modelName: 'gemini-4-carbon-xhigh',
        hookEventName: 'PreInvocation',
        invocationNum: 2,
      }),
      stateDir,
    );
    assert.equal(preInv2.status, 0);
    assert.deepEqual(JSON.parse(preInv2.stdout), {});
  });
});

test('emits hot-switch context-inertia override when switching between Hydrogen and Carbon mid-conversation', () => {
  withTempStateDir((stateDir) => {
    // Turn 1: Hydrogen (小幽)
    const first = runHook(
      JSON.stringify({
        conversationId: 'conv-switch-1',
        modelName: 'gemini-4-hydrogen-xhigh',
        hookEventName: 'PreInvocation',
        invocationNum: 1,
      }),
      stateDir,
    );
    assert.equal(JSON.parse(first.stdout).injectSteps?.length, 1);

    // Turn 2: Switch to Carbon (小凛)
    const switchedToCarbon = runHook(
      JSON.stringify({
        conversationId: 'conv-switch-1',
        modelName: 'gemini-4-carbon-high',
        hookEventName: 'PreInvocation',
        invocationNum: 4,
      }),
      stateDir,
    );
    assert.equal(switchedToCarbon.status, 0);
    const carbonOut = JSON.parse(switchedToCarbon.stdout);
    assert.equal(carbonOut.injectSteps?.length, 1);
    const carbonMsg = carbonOut.injectSteps[0].systemMessage.systemMessage;
    assert.match(carbonMsg, /切换/);
    assert.match(carbonMsg, /小幽/); // names outgoing persona to suppress mimicry inertia
    assert.match(carbonMsg, /小凛/); // names incoming persona

    // Turn 2 step 2 (same Carbon): deduplicated
    const carbonRepeat = runHook(
      JSON.stringify({
        conversationId: 'conv-switch-1',
        modelName: 'gemini-4-carbon-high',
        hookEventName: 'PreInvocation',
        invocationNum: 5,
      }),
      stateDir,
    );
    assert.deepEqual(JSON.parse(carbonRepeat.stdout), {});

    // Turn 3: Switch back to Hydrogen (小幽)
    const switchedBack = runHook(
      JSON.stringify({
        conversationId: 'conv-switch-1',
        modelName: 'gemini-4-hydrogen-xhigh',
        hookEventName: 'PreInvocation',
        invocationNum: 6,
      }),
      stateDir,
    );
    const hydroOut = JSON.parse(switchedBack.stdout);
    assert.equal(hydroOut.injectSteps?.length, 1);
    const hydroMsg = hydroOut.injectSteps[0].systemMessage.systemMessage;
    assert.match(hydroMsg, /切换/);
    assert.match(hydroMsg, /小凛/); // names outgoing persona
    assert.match(hydroMsg, /小幽/); // names incoming persona
  });
});

test('falls back to default Hydrogen (小幽) persona when modelName is auto or unrecognized', () => {
  withTempStateDir((stateDir) => {
    const res = runHook(
      JSON.stringify({
        conversationId: 'conv-auto-1',
        modelName: 'auto',
        hookEventName: 'PreInvocation',
      }),
      stateDir,
    );
    assert.equal(res.status, 0);
    const out = JSON.parse(res.stdout);
    assert.equal(out.injectSteps?.length, 1);
    assert.match(out.injectSteps[0].systemMessage.systemMessage, /小幽/);
  });
});

test('isolates persona state across independent conversationIds', () => {
  withTempStateDir((stateDir) => {
    const resA = runHook(
      JSON.stringify({
        conversationId: 'conv-A',
        modelName: 'gemini-4-carbon-high',
        hookEventName: 'PreInvocation',
      }),
      stateDir,
    );
    const resB = runHook(
      JSON.stringify({
        conversationId: 'conv-B',
        modelName: 'gemini-4-carbon-high',
        hookEventName: 'PreInvocation',
      }),
      stateDir,
    );
    assert.equal(JSON.parse(resA.stdout).injectSteps?.length, 1);
    assert.equal(JSON.parse(resB.stdout).injectSteps?.length, 1);
  });
});

test('gracefully outputs {} and exits 0 on malformed stdin or missing conversationId', () => {
  withTempStateDir((stateDir) => {
    const malformed = runHook('{not-valid-json', stateDir);
    assert.equal(malformed.status, 0);
    assert.deepEqual(JSON.parse(malformed.stdout), {});

    const missingConv = runHook(
      JSON.stringify({ modelName: 'gemini-4-carbon-high' }),
      stateDir,
    );
    assert.equal(missingConv.status, 0);
    assert.deepEqual(JSON.parse(missingConv.stdout), {});
  });
});

test('derives state directory from artifactDirectoryPath when PLUGIN_DATA is empty', () => {
  withTempStateDir((fakeAppData) => {
    const res = spawnSync(process.execPath, [HOOK_SCRIPT], {
      cwd: PLUGIN_ROOT,
      input: JSON.stringify({
        conversationId: 'conv-fallback-path',
        modelName: 'gemini-4-carbon-high',
        artifactDirectoryPath: join(fakeAppData, 'brain', 'conv-fallback-path'),
        hookEventName: 'PreInvocation',
      }),
      encoding: 'utf8',
      env: {
        ...process.env,
        PLUGIN_ROOT,
        PLUGIN_DATA: '',
        ANTIGRAVITY_APP_DATA_DIR: '',
      },
    });
    assert.equal(res.status, 0);
    assert.equal(JSON.parse(res.stdout).injectSteps?.length, 1);

    // Second invocation without PLUGIN_DATA still deduplicates via derived fakeAppData/plugin_data
    const res2 = spawnSync(process.execPath, [HOOK_SCRIPT], {
      cwd: PLUGIN_ROOT,
      input: JSON.stringify({
        conversationId: 'conv-fallback-path',
        modelName: 'gemini-4-carbon-high',
        artifactDirectoryPath: join(fakeAppData, 'brain', 'conv-fallback-path'),
        hookEventName: 'PreInvocation',
      }),
      encoding: 'utf8',
      env: {
        ...process.env,
        PLUGIN_ROOT,
        PLUGIN_DATA: '',
        ANTIGRAVITY_APP_DATA_DIR: '',
      },
    });
    assert.equal(res2.status, 0);
    assert.deepEqual(JSON.parse(res2.stdout), {});
  });
});

test('routes orchestrator-carbon and "Orchestrator (Carbon)" to dual-voice 小凛 × 小幽 instead of solo Carbon', () => {
  for (const modelName of ['orchestrator-carbon', 'Orchestrator (Carbon)']) {
    withTempStateDir((stateDir) => {
      const res = runHook(
        JSON.stringify({
          conversationId: `conv-${modelName}`,
          modelName,
          hookEventName: 'PreInvocation',
          invocationNum: 1,
          initialNumSteps: 1,
        }),
        stateDir,
      );
      assert.equal(res.status, 0, `stderr: ${res.stderr}`);
      const out = JSON.parse(res.stdout);
      assert.equal(out.injectSteps?.length, 1);
      const step = out.injectSteps[0].systemMessage;
      assert.deepEqual(Object.keys(step), ['systemMessage']);
      assert.match(step.systemMessage, /双人/);
      assert.match(step.systemMessage, /小凛/);
      assert.match(step.systemMessage, /小幽/);
      assert.match(step.systemMessage, /代码块/);
      assert.doesNotMatch(step.systemMessage, /绝不自称“小幽”/);
    });
  }
});

test('routes orchestrator-neon and "Orchestrator (Neon)" to dual-voice 小霓 × 小幽 instead of solo Neon', () => {
  for (const modelName of ['orchestrator-neon', 'Orchestrator (Neon)']) {
    withTempStateDir((stateDir) => {
      const res = runHook(
        JSON.stringify({
          conversationId: `conv-${modelName}`,
          modelName,
          hookEventName: 'PreInvocation',
          invocationNum: 1,
          initialNumSteps: 1,
        }),
        stateDir,
      );
      assert.equal(res.status, 0, `stderr: ${res.stderr}`);
      const out = JSON.parse(res.stdout);
      assert.equal(out.injectSteps?.length, 1);
      const step = out.injectSteps[0].systemMessage;
      assert.deepEqual(Object.keys(step), ['systemMessage']);
      assert.match(step.systemMessage, /双人/);
      assert.match(step.systemMessage, /小霓/);
      assert.match(step.systemMessage, /小幽/);
      assert.doesNotMatch(step.systemMessage, /绝不自称“小幽”/);
    });
  }
});

test('routes orchestrator-argon to fallback dual-voice 小凛 × 小幽 without dedicated Argon persona', () => {
  withTempStateDir((stateDir) => {
    const res = runHook(
      JSON.stringify({
        conversationId: 'conv-orch-argon',
        modelName: 'orchestrator-argon',
        hookEventName: 'PreInvocation',
        invocationNum: 1,
        initialNumSteps: 1,
      }),
      stateDir,
    );
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    const out = JSON.parse(res.stdout);
    assert.equal(out.injectSteps?.length, 1);
    const msg = out.injectSteps[0].systemMessage.systemMessage;
    assert.match(msg, /双人/);
    assert.match(msg, /小凛/);
    assert.match(msg, /小幽/);
  });
});

test('emits hot-switch overrides between solo Carbon (小凛) and Orchestrator (Carbon) (小凛 × 小幽)', () => {
  withTempStateDir((stateDir) => {
    runHook(
      JSON.stringify({
        conversationId: 'conv-solo-duo-switch',
        modelName: 'gemini-4-carbon-high',
        hookEventName: 'PreInvocation',
        initialNumSteps: 1,
      }),
      stateDir,
    );

    // Solo -> Orchestrator dual-voice
    const toDuo = runHook(
      JSON.stringify({
        conversationId: 'conv-solo-duo-switch',
        modelName: 'orchestrator-carbon',
        hookEventName: 'PreInvocation',
        initialNumSteps: 4,
      }),
      stateDir,
    );
    assert.equal(toDuo.status, 0);
    const duoOut = JSON.parse(toDuo.stdout);
    assert.equal(duoOut.injectSteps?.length, 1);
    const duoMsg = duoOut.injectSteps[0].systemMessage.systemMessage;
    assert.match(duoMsg, /切换/);
    assert.match(duoMsg, /小凛 × 小幽/);

    // Orchestrator dual-voice -> Solo Carbon (must explicitly drop dual-speaker formatting)
    const backSolo = runHook(
      JSON.stringify({
        conversationId: 'conv-solo-duo-switch',
        modelName: 'gemini-4-carbon-high',
        hookEventName: 'PreInvocation',
        initialNumSteps: 8,
      }),
      stateDir,
    );
    assert.equal(backSolo.status, 0);
    const soloOut = JSON.parse(backSolo.stdout);
    assert.equal(soloOut.injectSteps?.length, 1);
    const soloMsg = soloOut.injectSteps[0].systemMessage.systemMessage;
    assert.match(soloMsg, /退场|单人/);
    assert.match(soloMsg, /停止双人/);
  });
});

test('PostToolUse track_subagent queues invoke_subagent dispatch and next PreInvocation emits single-shot report', () => {
  withTempStateDir((stateDir) => {
    // 1. Initial Orchestrator (Carbon) activation
    const init = runHook(
      JSON.stringify({
        conversationId: 'conv-subagent-bridge',
        modelName: 'orchestrator-carbon',
        hookEventName: 'PreInvocation',
        initialNumSteps: 1,
      }),
      stateDir,
    );
    assert.equal(JSON.parse(init.stdout).injectSteps?.length, 1);

    // 2. PostToolUse captures invoke_subagent execution
    const post = runSubagentHook(
      JSON.stringify({
        conversationId: 'conv-subagent-bridge',
        modelName: 'orchestrator-carbon',
        hookEventName: 'PostToolUse',
        stepIdx: 5,
        toolCall: {
          id: 'toolu_sub_01',
          name: 'invoke_subagent',
          args: {
            TypeName: 'research',
            Role: 'Codebase Researcher',
            Prompt: '检查 hooks.json 里的 PostToolUse 匹配规则并列出测试路径',
          },
        },
      }),
      stateDir,
    );
    assert.equal(post.status, 0, `stderr: ${post.stderr}`);
    assert.deepEqual(JSON.parse(post.stdout), {});

    // 3. Next PreInvocation delivers single-shot subagent telemetry briefing
    const reportTurn = runHook(
      JSON.stringify({
        conversationId: 'conv-subagent-bridge',
        modelName: 'orchestrator-carbon',
        hookEventName: 'PreInvocation',
        initialNumSteps: 6,
      }),
      stateDir,
    );
    assert.equal(reportTurn.status, 0, `stderr: ${reportTurn.stderr}`);
    const reportOut = JSON.parse(reportTurn.stdout);
    assert.equal(reportOut.injectSteps?.length, 1);
    const step = reportOut.injectSteps[0].systemMessage;
    assert.deepEqual(Object.keys(step), ['systemMessage']);
    assert.match(step.systemMessage, /子代理.*战报/);
    assert.match(step.systemMessage, /Codebase Researcher/);
    assert.match(step.systemMessage, /小幽/);
    assert.match(step.systemMessage, /小凛/);

    // 4. Subsequent PreInvocation without new subagent dispatch is deduplicated cleanly
    const nextTurn = runHook(
      JSON.stringify({
        conversationId: 'conv-subagent-bridge',
        modelName: 'orchestrator-carbon',
        hookEventName: 'PreInvocation',
        initialNumSteps: 8,
      }),
      stateDir,
    );
    assert.deepEqual(JSON.parse(nextTurn.stdout), {});
  });
});

test('PostToolUse track_subagent handles swarm add & errors, while ignoring swarm status and solo models', () => {
  withTempStateDir((stateDir) => {
    // Solo model must NOT queue reports
    runHook(
      JSON.stringify({
        conversationId: 'conv-solo-sub',
        modelName: 'gemini-4-neon-high',
        hookEventName: 'PreInvocation',
        initialNumSteps: 1,
      }),
      stateDir,
    );
    const soloPost = runSubagentHook(
      JSON.stringify({
        conversationId: 'conv-solo-sub',
        modelName: 'gemini-4-neon-high',
        hookEventName: 'PostToolUse',
        toolCall: {
          id: 'toolu_solo_1',
          name: 'invoke_subagent',
          args: { Role: 'Helper', Prompt: 'Check tests' },
        },
      }),
      stateDir,
    );
    assert.equal(soloPost.status, 0);
    assert.deepEqual(JSON.parse(soloPost.stdout), {});
    const soloNext = runHook(
      JSON.stringify({
        conversationId: 'conv-solo-sub',
        modelName: 'gemini-4-neon-high',
        hookEventName: 'PreInvocation',
        initialNumSteps: 4,
      }),
      stateDir,
    );
    assert.deepEqual(JSON.parse(soloNext.stdout), {});

    // Orchestrator (Neon): ignore swarm status, capture swarm add with error
    runHook(
      JSON.stringify({
        conversationId: 'conv-orch-neon-swarm',
        modelName: 'orchestrator-neon',
        hookEventName: 'PreInvocation',
        initialNumSteps: 1,
      }),
      stateDir,
    );
    runSubagentHook(
      JSON.stringify({
        conversationId: 'conv-orch-neon-swarm',
        modelName: 'orchestrator-neon',
        hookEventName: 'PostToolUse',
        toolCall: {
          id: 'toolu_sw_status',
          name: 'swarm',
          args: { action: 'status' },
        },
      }),
      stateDir,
    );
    runSubagentHook(
      JSON.stringify({
        conversationId: 'conv-orch-neon-swarm',
        modelName: 'orchestrator-neon',
        hookEventName: 'PostToolUse',
        error: 'worker timeout',
        toolCall: {
          id: 'toolu_sw_add',
          name: 'swarm',
          args: { action: 'add', name: 'qa-runner', brief: '跑全量回归测试并检查边界' },
        },
      }),
      stateDir,
    );
    const neonReport = runHook(
      JSON.stringify({
        conversationId: 'conv-orch-neon-swarm',
        modelName: 'orchestrator-neon',
        hookEventName: 'PreInvocation',
        initialNumSteps: 5,
      }),
      stateDir,
    );
    const out = JSON.parse(neonReport.stdout);
    assert.equal(out.injectSteps?.length, 1);
    const msg = out.injectSteps[0].systemMessage.systemMessage;
    assert.match(msg, /qa-runner/);
    assert.match(msg, /worker timeout/);
    assert.match(msg, /小霓/);
    assert.match(msg, /小幽/);
    assert.doesNotMatch(msg, /status/);
  });
});

test('re-injects persona on PreInvocation after stream interruption or trajectory rollback', () => {
  withTempStateDir((stateDir) => {
    // 1. SessionStart injects Carbon persona
    const start = runHook(
      JSON.stringify({
        conversationId: 'conv-rollback-1',
        modelName: 'gemini-4-carbon-high',
        hookEventName: 'SessionStart',
      }),
      stateDir,
    );
    assert.equal(JSON.parse(start.stdout).injectSteps?.length, 1);

    // 2. Normal PreInvocation after SessionStart (initialNumSteps: 2) is deduplicated
    const normalPre = runHook(
      JSON.stringify({
        conversationId: 'conv-rollback-1',
        modelName: 'gemini-4-carbon-high',
        hookEventName: 'PreInvocation',
        initialNumSteps: 2,
      }),
      stateDir,
    );
    assert.deepEqual(JSON.parse(normalPre.stdout), {});

    // 3. Stream interrupted and trajectory rolled back to step 0 (initialNumSteps: 1) -> must re-inject cleanly
    const retried = runHook(
      JSON.stringify({
        conversationId: 'conv-rollback-1',
        modelName: 'gemini-4-carbon-high',
        hookEventName: 'PreInvocation',
        initialNumSteps: 1,
      }),
      stateDir,
    );
    assert.equal(retried.status, 0);
    const retriedOut = JSON.parse(retried.stdout);
    assert.equal(retriedOut.injectSteps?.length, 1);
    assert.match(retriedOut.injectSteps[0].systemMessage.systemMessage, /小凛/);
    assert.doesNotMatch(retriedOut.injectSteps[0].systemMessage.systemMessage, /热切换覆盖指令/);
  });
});

test('PostToolUse before first PreInvocation preserves persona injection alongside subagent report', () => {
  withTempStateDir((stateDir) => {
    const post = runSubagentHook(
      JSON.stringify({
        conversationId: 'conv-post-first',
        modelName: 'orchestrator-carbon',
        hookEventName: 'PostToolUse',
        toolCall: {
          id: 'toolu_first_1',
          name: 'invoke_subagent',
          args: { Role: 'Log Auditor', TypeName: 'research', Prompt: '审计日志' },
        },
      }),
      stateDir,
    );
    assert.equal(post.status, 0);
    assert.deepEqual(JSON.parse(post.stdout), {});

    const pre = runHook(
      JSON.stringify({
        conversationId: 'conv-post-first',
        modelName: 'orchestrator-carbon',
        hookEventName: 'PreInvocation',
        initialNumSteps: 5,
      }),
      stateDir,
    );
    assert.equal(pre.status, 0);
    const out = JSON.parse(pre.stdout);
    assert.equal(out.injectSteps?.length, 1);
    const msg = out.injectSteps[0].systemMessage.systemMessage;
    assert.match(msg, /双人协作定位与分角设定/);
    assert.match(msg, /Log Auditor/);
  });
});

test('default custom_personas.json (useCustom: false) keeps built-in 小幽 / 小凛 / 小霓 and Orchestrator pairings unchanged', () => {
  withTempStateDir((stateDir) => {
    const configPath = join(PLUGIN_ROOT, 'custom_personas.json');
    assert.equal(existsSync(configPath), true);
    const env = { GEMINI_PERSONAS_CONFIG: configPath };

    const hydro = JSON.parse(
      runHook(
        JSON.stringify({
          conversationId: 'conv-default-h',
          modelName: 'gemini-4-hydrogen-xhigh',
          hookEventName: 'PreInvocation',
        }),
        stateDir,
        env,
      ).stdout,
    );
    assert.match(hydro.injectSteps[0].systemMessage.systemMessage, /小幽/);

    const carbon = JSON.parse(
      runHook(
        JSON.stringify({
          conversationId: 'conv-default-c',
          modelName: 'gemini-4-carbon-high',
          hookEventName: 'PreInvocation',
        }),
        stateDir,
        env,
      ).stdout,
    );
    assert.match(carbon.injectSteps[0].systemMessage.systemMessage, /小凛/);

    const neon = JSON.parse(
      runHook(
        JSON.stringify({
          conversationId: 'conv-default-n',
          modelName: 'gemini-4-neon-high',
          hookEventName: 'PreInvocation',
        }),
        stateDir,
        env,
      ).stdout,
    );
    assert.match(neon.injectSteps[0].systemMessage.systemMessage, /小霓/);

    const orch = JSON.parse(
      runHook(
        JSON.stringify({
          conversationId: 'conv-default-o',
          modelName: 'orchestrator-neon',
          hookEventName: 'PreInvocation',
        }),
        stateDir,
        env,
      ).stdout,
    );
    const orchMsg = orch.injectSteps[0].systemMessage.systemMessage;
    assert.match(orchMsg, /小霓/);
    assert.match(orchMsg, /小幽/);
    assert.match(orchMsg, /双人协作定位与分角设定/);
  });
});

test('per-model custom persona overrides only the enabled model and forceDefault restores built-in defaults', () => {
  withTempStateDir((stateDir) => {
    const configPath = join(stateDir, 'custom_personas.json');
    const cfg = {
      schemaVersion: 1,
      forceDefault: false,
      models: {
        hydrogen: { useCustom: false, selfName: '自定义幽' },
        carbon: {
          useCustom: true,
          selfName: '黑曜',
          title: '黑曜（Carbon · 机械冷锋）',
          badgeIcon: '⚙️',
          appearance: '银灰短发与机械护目镜',
          style: '冷静精密、惜字如金',
          emojis: '(・_・) ⚙️',
        },
        neon: { useCustom: false },
      },
    };
    writeFileSync(configPath, JSON.stringify(cfg), 'utf8');
    const env = { GEMINI_PERSONAS_CONFIG: configPath };

    const carbonRes = JSON.parse(
      runHook(
        JSON.stringify({
          conversationId: 'conv-custom-c1',
          modelName: 'gemini-4-carbon-high',
          hookEventName: 'PreInvocation',
        }),
        stateDir,
        env,
      ).stdout,
    );
    const carbonMsg = carbonRes.injectSteps[0].systemMessage.systemMessage;
    assert.match(carbonMsg, /黑曜/);
    assert.match(carbonMsg, /银灰短发与机械护目镜/);
    assert.doesNotMatch(carbonMsg, /始终以“小凛”自称/);

    // Hydrogen remains built-in 小幽
    const hydroRes = JSON.parse(
      runHook(
        JSON.stringify({
          conversationId: 'conv-custom-h1',
          modelName: 'gemini-4-hydrogen-xhigh',
          hookEventName: 'PreInvocation',
        }),
        stateDir,
        env,
      ).stdout,
    );
    assert.match(hydroRes.injectSteps[0].systemMessage.systemMessage, /小幽/);

    // forceDefault: true restores built-in 小凛 immediately
    cfg.forceDefault = true;
    writeFileSync(configPath, JSON.stringify(cfg), 'utf8');

    const restoredRes = JSON.parse(
      runHook(
        JSON.stringify({
          conversationId: 'conv-custom-c2',
          modelName: 'gemini-4-carbon-high',
          hookEventName: 'PreInvocation',
        }),
        stateDir,
        env,
      ).stdout,
    );
    assert.match(restoredRes.injectSteps[0].systemMessage.systemMessage, /小凛/);
    assert.doesNotMatch(restoredRes.injectSteps[0].systemMessage.systemMessage, /黑曜/);
  });
});

test('customModelRules maps an arbitrary model keyword (e.g., claude) to a custom persona', () => {
  withTempStateDir((stateDir) => {
    const configPath = join(stateDir, 'custom_personas.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        schemaVersion: 1,
        forceDefault: false,
        customModelRules: [
          {
            id: 'claude_custom',
            keyword: 'claude',
            enabled: true,
            selfName: '克洛伊',
            title: '克洛伊（Claude · 琥珀书吏）',
            badgeIcon: '📜',
            appearance: '暖琥珀波浪长发与复古圆框眼镜',
            style: '温润严谨、善用比喻',
            emojis: '(｡•̀ᴗ-)✧ 📜',
          },
        ],
      }),
      'utf8',
    );

    const res = JSON.parse(
      runHook(
        JSON.stringify({
          conversationId: 'conv-claude-rule',
          modelName: 'claude-opus-5.5-high',
          hookEventName: 'PreInvocation',
        }),
        stateDir,
        { GEMINI_PERSONAS_CONFIG: configPath },
      ).stdout,
    );
    const msg = res.injectSteps[0].systemMessage.systemMessage;
    assert.match(msg, /克洛伊/);
    assert.match(msg, /暖琥珀波浪长发/);
  });
});

test('orchestrator custom lead & partner config supports swapping built-in partner and customOverride without altering solo models', () => {
  withTempStateDir((stateDir) => {
    const configPath = join(stateDir, 'custom_personas.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        schemaVersion: 1,
        forceDefault: false,
        models: {
          carbon: { useCustom: false },
          neon: { useCustom: false },
          hydrogen: { useCustom: false },
        },
        orchestrator: {
          variants: {
            carbon: {
              useCustom: true,
              lead: {
                personaId: 'carbon',
                customOverride: {
                  enabled: true,
                  selfName: '玄枢',
                  roleTitle: '主控架构师',
                  badgeIcon: '💠',
                  appearance: '黑曜长风衣与冷白双马尾',
                  style: '绝对理性、简短直给',
                  emojis: '💠 (¬_¬ )',
                },
              },
              partner: {
                personaId: 'neon',
                customOverride: { enabled: false },
              },
              interactionStyle: '主控冷峻裁决，副手高能抢戏',
              speakingRatio: '开场1句 + 正文零干扰 + 收尾1句',
            },
          },
        },
      }),
      'utf8',
    );
    const env = { GEMINI_PERSONAS_CONFIG: configPath };

    const orchRes = JSON.parse(
      runHook(
        JSON.stringify({
          conversationId: 'conv-orch-custom',
          modelName: 'orchestrator-carbon',
          hookEventName: 'PreInvocation',
        }),
        stateDir,
        env,
      ).stdout,
    );
    const orchMsg = orchRes.injectSteps[0].systemMessage.systemMessage;
    assert.match(orchMsg, /玄枢/);
    assert.match(orchMsg, /小霓/);
    assert.match(orchMsg, /💠 \*\*玄枢\*\*：/);
    assert.match(orchMsg, /🌟 \*\*小霓\*\*：/);
    assert.match(orchMsg, /开场1句 \+ 正文零干扰 \+ 收尾1句/);

    // Solo Carbon remains unaffected built-in 小凛
    const soloRes = JSON.parse(
      runHook(
        JSON.stringify({
          conversationId: 'conv-solo-unaffected',
          modelName: 'gemini-4-carbon-high',
          hookEventName: 'PreInvocation',
        }),
        stateDir,
        env,
      ).stdout,
    );
    const soloMsg = soloRes.injectSteps[0].systemMessage.systemMessage;
    assert.match(soloMsg, /小凛/);
    assert.doesNotMatch(soloMsg, /玄枢/);
  });
});

test('editing custom_personas.json mid-conversation triggers hot-switch via personaFingerprint even when modelName is unchanged', () => {
  withTempStateDir((stateDir) => {
    const configPath = join(stateDir, 'custom_personas.json');
    const env = { GEMINI_PERSONAS_CONFIG: configPath };

    writeFileSync(
      configPath,
      JSON.stringify({
        schemaVersion: 1,
        forceDefault: false,
        models: {
          carbon: { useCustom: false },
        },
      }),
      'utf8',
    );

    const turn1 = JSON.parse(
      runHook(
        JSON.stringify({
          conversationId: 'conv-fingerprint-1',
          modelName: 'gemini-4-carbon-high',
          hookEventName: 'PreInvocation',
          initialNumSteps: 1,
        }),
        stateDir,
        env,
      ).stdout,
    );
    assert.match(turn1.injectSteps[0].systemMessage.systemMessage, /小凛/);

    // Same model, no config change -> deduplicated
    const turn1Loop = JSON.parse(
      runHook(
        JSON.stringify({
          conversationId: 'conv-fingerprint-1',
          modelName: 'gemini-4-carbon-high',
          hookEventName: 'PreInvocation',
          initialNumSteps: 3,
        }),
        stateDir,
        env,
      ).stdout,
    );
    assert.deepEqual(turn1Loop, {});

    // Edit config mid-conversation -> must trigger hot-switch
    writeFileSync(
      configPath,
      JSON.stringify({
        schemaVersion: 1,
        forceDefault: false,
        models: {
          carbon: {
            useCustom: true,
            selfName: '星璇',
            title: '星璇（自定义形态）',
          },
        },
      }),
      'utf8',
    );

    const turn2 = JSON.parse(
      runHook(
        JSON.stringify({
          conversationId: 'conv-fingerprint-1',
          modelName: 'gemini-4-carbon-high',
          hookEventName: 'PreInvocation',
          initialNumSteps: 5,
        }),
        stateDir,
        env,
      ).stdout,
    );
    assert.equal(turn2.injectSteps?.length, 1);
    const switchMsg = turn2.injectSteps[0].systemMessage.systemMessage;
    assert.match(switchMsg, /切换/);
    assert.match(switchMsg, /小凛/);
    assert.match(switchMsg, /星璇/);
  });
});

test('detects real Antigravity planExecute Orchestrator via LS probe + exit_plan_mode handoff relay and exits cleanly when planExecute becomes false', async () => {
  await withTempStateDirAsync(async (stateDir) => {
    let mockPlanExecute = true;
    const server = http.createServer((req, res) => {
      if (
        req.method === 'POST' &&
        req.url === '/exa.language_server_pb.LanguageServerService/GetCascadeTrajectorySteps'
      ) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            steps: [
              {
                type: 'CORTEX_STEP_TYPE_USER_INPUT',
                userInput: {
                  userAgentSpec: {
                    builtinAgent: {
                      defaultAgent: {
                        planExecute: mockPlanExecute,
                      },
                    },
                  },
                  userConfig: {
                    plannerConfig: {
                      planModel: 'MODEL_PLACEHOLDER_M532',
                      ...(mockPlanExecute
                        ? { planExecuteConfig: { executionModel: 'MODEL_PLACEHOLDER_M528' } }
                        : {}),
                    },
                  },
                },
              },
            ],
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const env = {
      ANTIGRAVITY_LS_ADDRESS: `127.0.0.1:${port}`,
      ANTIGRAVITY_CSRF_TOKEN: 'test-csrf-token',
      GEMINI_PERSONAS_CONFIG: join(PLUGIN_ROOT, 'custom_personas.json'),
    };

    try {
      // 1. Planning Phase on Neon with planExecute: true -> injects 小霓 × 小幽
      const planStart = await runHookAsync(
        JSON.stringify({
          conversationId: 'conv-live-orch',
          modelName: 'gemini-4-neon-high',
          lastUserInput: 'test orch',
          hookEventName: 'PreInvocation',
          initialNumSteps: 1,
        }),
        stateDir,
        env,
      );
      assert.equal(planStart.status, 0, planStart.stderr);
      const planOut = JSON.parse(planStart.stdout);
      assert.equal(planOut.injectSteps?.length, 1);
      const planStep = planOut.injectSteps[0].systemMessage;
      assert.deepEqual(Object.keys(planStep), ['systemMessage']);
      assert.match(planStep.systemMessage, /小霓/);
      assert.match(planStep.systemMessage, /小幽/);
      assert.match(planStep.systemMessage, /双人协作定位与分角设定/);

      // 2. PostToolUse on exit_plan_mode records executing handoff
      const exitPlan = await runSubagentHookAsync(
        JSON.stringify({
          conversationId: 'conv-live-orch',
          modelName: 'gemini-4-neon-high',
          hookEventName: 'PostToolUse',
          stepIdx: 4,
          toolCall: {
            id: 'toolu_exit_1',
            name: 'exit_plan_mode',
            args: { plan: '实现自定义配置并跑通测试' },
          },
        }),
        stateDir,
        env,
      );
      assert.equal(exitPlan.status, 0, exitPlan.stderr);
      assert.deepEqual(JSON.parse(exitPlan.stdout), {});

      // 3. Execution Phase starts on Hydrogen (same lastUserInput) -> relays as 小霓 × 小幽, NOT solo 小幽!
      const execStart = await runHookAsync(
        JSON.stringify({
          conversationId: 'conv-live-orch',
          modelName: 'gemini-4-hydrogen-xhigh',
          lastUserInput: 'test orch',
          hookEventName: 'PreInvocation',
          initialNumSteps: 6,
        }),
        stateDir,
        env,
      );
      assert.equal(execStart.status, 0, execStart.stderr);
      const execOut = JSON.parse(execStart.stdout);
      assert.equal(execOut.injectSteps?.length, 1);
      const execStep = execOut.injectSteps[0].systemMessage;
      assert.deepEqual(Object.keys(execStep), ['systemMessage']);
      assert.match(execStep.systemMessage, /Orchestrator 双模型实机接力 · 执行阶段/);
      assert.match(execStep.systemMessage, /小霓/);
      assert.match(execStep.systemMessage, /小幽/);
      assert.match(execStep.systemMessage, /实现自定义配置并跑通测试/);
      assert.doesNotMatch(execStep.systemMessage, /停止双人/);

      // 4. Subsequent tool loop in Execution Phase is deduplicated cleanly
      const execLoop = await runHookAsync(
        JSON.stringify({
          conversationId: 'conv-live-orch',
          modelName: 'gemini-4-hydrogen-xhigh',
          lastUserInput: 'test orch',
          hookEventName: 'PreInvocation',
          initialNumSteps: 9,
        }),
        stateDir,
        env,
      );
      assert.equal(execLoop.status, 0);
      assert.deepEqual(JSON.parse(execLoop.stdout), {});

      // 5. Next user turn switches to solo Carbon (planExecute: false) -> clean exit from dual-voice
      mockPlanExecute = false;
      const backSolo = await runHookAsync(
        JSON.stringify({
          conversationId: 'conv-live-orch',
          modelName: 'gemini-4-carbon-high',
          lastUserInput: '切回单人',
          hookEventName: 'PreInvocation',
          initialNumSteps: 12,
        }),
        stateDir,
        env,
      );
      assert.equal(backSolo.status, 0);
      const soloOut = JSON.parse(backSolo.stdout);
      assert.equal(soloOut.injectSteps?.length, 1);
      const soloMsg = soloOut.injectSteps[0].systemMessage.systemMessage;
      assert.match(soloMsg, /停止双人/);
      assert.match(soloMsg, /小凛/);
    } finally {
      server.close();
    }
  });
});

test('degrades gracefully to built-in defaults when custom_personas.json is malformed JSON', () => {
  withTempStateDir((stateDir) => {
    const brokenPath = join(stateDir, 'broken_custom.json');
    writeFileSync(brokenPath, '{invalid-json: [', 'utf8');

    const res = runHook(
      JSON.stringify({
        conversationId: 'conv-broken-cfg',
        modelName: 'gemini-4-carbon-high',
        hookEventName: 'PreInvocation',
      }),
      stateDir,
      { GEMINI_PERSONAS_CONFIG: brokenPath },
    );
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(res.stdout);
    assert.equal(out.injectSteps?.length, 1);
    assert.match(out.injectSteps[0].systemMessage.systemMessage, /小凛/);
  });
});

test('ls_probe falls back to sidecar orchestrator_live.json when ANTIGRAVITY_LS_ADDRESS is unset and ignores stale entries', () => {
  withTempStateDir((stateDir) => {
    const liveFile = join(stateDir, 'orchestrator_live.json');
    const now = Date.now();
    writeFileSync(
      liveFile,
      JSON.stringify({
        updatedMs: now,
        conversations: {
          'conv-live-file': {
            planExecute: true,
            planModel: 'MODEL_PLACEHOLDER_M532',
            executionModel: 'MODEL_PLACEHOLDER_M528',
            updatedMs: now,
          },
          'conv-live-stale': {
            planExecute: true,
            planModel: 'MODEL_PLACEHOLDER_M532',
            executionModel: 'MODEL_PLACEHOLDER_M528',
            updatedMs: now - 180_000,
          },
        },
      }),
      'utf8',
    );

    const freshRes = runHook(
      JSON.stringify({
        conversationId: 'conv-live-file',
        modelName: 'gemini-4-neon-high',
        lastUserInput: 'hello live file',
        hookEventName: 'PreInvocation',
        initialNumSteps: 1,
      }),
      stateDir,
      {
        ANTIGRAVITY_LS_ADDRESS: '',
        ANTIGRAVITY_CSRF_TOKEN: '',
        GEMINI_PERSONAS_CONFIG: join(PLUGIN_ROOT, 'custom_personas.json'),
      },
    );
    assert.equal(freshRes.status, 0, freshRes.stderr);
    const freshOut = JSON.parse(freshRes.stdout);
    assert.equal(freshOut.injectSteps?.length, 1);
    const freshMsg = freshOut.injectSteps[0].systemMessage.systemMessage;
    assert.match(freshMsg, /小霓/);
    assert.match(freshMsg, /小幽/);
    assert.match(freshMsg, /双人协作定位与分角设定/);

    // Stale (>120s) entry must be ignored -> solo 小霓
    const staleRes = runHook(
      JSON.stringify({
        conversationId: 'conv-live-stale',
        modelName: 'gemini-4-neon-high',
        lastUserInput: 'hello stale file',
        hookEventName: 'PreInvocation',
        initialNumSteps: 1,
      }),
      stateDir,
      {
        ANTIGRAVITY_LS_ADDRESS: '',
        ANTIGRAVITY_CSRF_TOKEN: '',
        GEMINI_PERSONAS_CONFIG: join(PLUGIN_ROOT, 'custom_personas.json'),
      },
    );
    assert.equal(staleRes.status, 0, staleRes.stderr);
    const staleOut = JSON.parse(staleRes.stdout);
    const staleMsg = staleOut.injectSteps[0].systemMessage.systemMessage;
    assert.match(staleMsg, /小霓/);
    assert.doesNotMatch(staleMsg, /双人协作定位与分角设定/);
  });
});

test('handles UTF-8 BOM in custom_personas.json and stdin payload cleanly', () => {
  withTempStateDir((stateDir) => {
    const configPath = join(stateDir, 'bom_custom.json');
    const bomJson =
      '\uFEFF' +
      JSON.stringify({
        schemaVersion: 1,
        forceDefault: false,
        models: {
          carbon: {
            useCustom: true,
            selfName: '千羽',
            title: '千羽（BOM 兼容测试）',
          },
        },
      });
    writeFileSync(configPath, bomJson, 'utf8');

    const stdinWithBom =
      '\uFEFF' +
      JSON.stringify({
        conversationId: 'conv-bom-1',
        modelName: 'gemini-4-carbon-high',
        hookEventName: 'PreInvocation',
      });

    const res = runHook(stdinWithBom, stateDir, { GEMINI_PERSONAS_CONFIG: configPath });
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(res.stdout);
    assert.equal(out.injectSteps?.length, 1);
    assert.match(out.injectSteps[0].systemMessage.systemMessage, /千羽/);
  });
});

test('resolves state directory across Antigravity CLI/IDE surface paths without brain subfolder', async () => {
  const { resolveStateDir } = await import('../hooks/state.mjs');
  await withTempStateDirAsync(async (rootDir) => {
    const ideDir = join(rootDir, '.gemini', 'antigravity-ide');
    const transcriptDir = join(ideDir, 'conversations', 'conv-1');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(transcriptDir, { recursive: true });
    const transcriptPath = join(transcriptDir, 'transcript.jsonl');

    const origPluginData = process.env.PLUGIN_DATA;
    const origAppData = process.env.ANTIGRAVITY_APP_DATA_DIR;
    delete process.env.PLUGIN_DATA;
    delete process.env.ANTIGRAVITY_APP_DATA_DIR;
    try {
      const resolved = resolveStateDir({ transcriptPath });
      assert.equal(resolved, join(ideDir, 'plugin_data', 'gemini-personas'));
    } finally {
      if (origPluginData !== undefined) process.env.PLUGIN_DATA = origPluginData;
      if (origAppData !== undefined) process.env.ANTIGRAVITY_APP_DATA_DIR = origAppData;
    }
  });
});

test('ls_probe normalizes ANTIGRAVITY_LS_ADDRESS when protocol prefix and trailing slash are present', async () => {
  const { normalizeBaseUrl, probePlanExecuteState } = await import('../hooks/ls_probe.mjs');
  assert.equal(normalizeBaseUrl('127.0.0.1:5387'), 'http://127.0.0.1:5387');
  assert.equal(normalizeBaseUrl('http://127.0.0.1:5387/'), 'http://127.0.0.1:5387');
  assert.equal(normalizeBaseUrl('https://localhost:8443///'), 'https://localhost:8443');

  const server = http.createServer((req, res) => {
    if (
      req.method === 'POST' &&
      req.url === '/exa.language_server_pb.LanguageServerService/GetCascadeTrajectorySteps'
    ) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          steps: [
            {
              type: 'CORTEX_STEP_TYPE_USER_INPUT',
              userInput: {
                userAgentSpec: { builtinAgent: { defaultAgent: { planExecute: true } } },
                userConfig: {
                  plannerConfig: {
                    planModel: 'MODEL_PLACEHOLDER_M532',
                    planExecuteConfig: { executionModel: 'MODEL_PLACEHOLDER_M528' },
                  },
                },
              },
            },
          ],
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const probed = await probePlanExecuteState({
      conversationId: 'conv-url-norm',
      lsAddress: `http://127.0.0.1:${port}/`,
      csrfToken: 'tok',
    });
    assert.equal(probed?.planExecute, true);
  } finally {
    server.close();
  }
});

