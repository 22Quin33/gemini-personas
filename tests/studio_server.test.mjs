import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(__dirname);
const SIDECAR_ENTRY = join(PLUGIN_ROOT, 'sidecars', 'persona-studio', 'main.mjs');
const TEST_TOKEN = 'studio-test-token';

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Sidecar exited prematurely with code ${child.exitCode}`);
    }
    try {
      const res = await fetch(`${baseUrl}/api/state`);
      if (res.ok) return;
    } catch {
      // Retry until ready
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error('Timed out waiting for persona-studio sidecar server');
}

async function withStudioServer(fn) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'persona-studio-test-'));
  const configPath = join(tmpDir, 'custom_personas.json');
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const child = spawn(process.execPath, [SIDECAR_ENTRY], {
    cwd: join(PLUGIN_ROOT, 'sidecars', 'persona-studio'),
    env: {
      ...process.env,
      ANTIGRAVITY_SIDECAR_WEB_PORT: String(port),
      ANTIGRAVITY_SIDECAR_UI_TOKEN: TEST_TOKEN,
      ANTIGRAVITY_LS_ADDRESS: '127.0.0.1:1',
      ANTIGRAVITY_CSRF_TOKEN: 'standalone',
      PERSONA_STUDIO_DISABLE_LS_POLL: '1',
      GEMINI_PERSONAS_CONFIG: configPath,
      PLUGIN_DATA: tmpDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  try {
    await waitForServer(baseUrl, child);
    return await fn({ baseUrl, configPath, tmpDir });
  } catch (err) {
    if (stderr) err.message += `\nSidecar stderr:\n${stderr}`;
    throw err;
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 1000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('persona-studio serves Web UI HTML, CSS, JS, and all 3 valid PNG chibi illustrations', async () => {
  await withStudioServer(async ({ baseUrl }) => {
    const htmlRes = await fetch(`${baseUrl}/`);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.match(html, /双子星人格工坊/);
    assert.match(html, /\/assets\/chibi-hydrogen\.png/);
    assert.match(html, /\/assets\/chibi-carbon\.png/);
    assert.match(html, /\/assets\/chibi-neon\.png/);

    for (const staticPath of ['/styles.css', '/app.js']) {
      const res = await fetch(`${baseUrl}${staticPath}`);
      assert.equal(res.status, 200, `failed to fetch ${staticPath}`);
      assert.ok((await res.text()).length > 100);
    }

    for (const imgPath of [
      '/assets/chibi-hydrogen.png',
      '/assets/chibi-carbon.png',
      '/assets/chibi-neon.png',
    ]) {
      const res = await fetch(`${baseUrl}${imgPath}`);
      assert.equal(res.status, 200, `failed to fetch ${imgPath}`);
      assert.match(res.headers.get('content-type') || '', /image\/png/);
      const buf = Buffer.from(await res.arrayBuffer());
      assert.ok(buf.length > 1000, `${imgPath} unexpectedly small`);
      // Verify PNG magic signature: 89 50 4E 47
      assert.deepEqual(Array.from(buf.subarray(0, 4)), [0x89, 0x50, 0x4e, 0x47]);
    }
  });
});

test('persona-studio GET /api/state, POST /api/config, POST /api/preview, and POST /api/reset work end-to-end', async () => {
  await withStudioServer(async ({ baseUrl }) => {
    const headers = {
      'Content-Type': 'application/json',
      'x-sidecar-token': TEST_TOKEN,
    };

    // Unauthorized POST must fail with 401
    const unauth = await fetch(`${baseUrl}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(unauth.status, 401);

    // 1. Initial GET /api/state returns default config
    const initRes = await fetch(`${baseUrl}/api/state`);
    assert.equal(initRes.status, 200);
    const initData = await initRes.json();
    assert.equal(initData.ok, true);
    assert.equal(initData.config.forceDefault, false);
    assert.equal(initData.config.models.carbon.useCustom, false);
    assert.equal(initData.builtins.solo.hydrogen.selfName, '小幽');
    assert.equal(initData.builtins.solo.carbon.selfName, '小凛');
    assert.equal(initData.builtins.solo.neon.selfName, '小霓');

    // 2. Save custom solo Carbon + custom Orchestrator Carbon lead/partner
    const nextConfig = structuredClone(initData.config);
    nextConfig.models.carbon.useCustom = true;
    nextConfig.models.carbon.selfName = '霜钻';
    nextConfig.models.carbon.title = '霜钻（Carbon · 定制测试）';
    nextConfig.orchestrator.variants.carbon.useCustom = true;
    nextConfig.orchestrator.variants.carbon.lead.customOverride.enabled = true;
    nextConfig.orchestrator.variants.carbon.lead.customOverride.selfName = '玄枢';
    nextConfig.orchestrator.variants.carbon.partner.personaId = 'neon';

    const saveRes = await fetch(`${baseUrl}/api/config`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ config: nextConfig }),
    });
    assert.equal(saveRes.status, 200);
    const saveData = await saveRes.json();
    assert.equal(saveData.ok, true);
    assert.equal(saveData.config.models.carbon.selfName, '霜钻');

    // 3. Preview solo Carbon and Orchestrator Carbon reflect saved customizations
    const prevSolo = await (
      await fetch(`${baseUrl}/api/preview`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ modelName: 'gemini-4-carbon-high' }),
      })
    ).json();
    assert.equal(prevSolo.persona.selfName, '霜钻');
    assert.match(prevSolo.systemMessage, /霜钻/);
    assert.equal(prevSolo.fingerprint.length, 12);

    const prevOrch = await (
      await fetch(`${baseUrl}/api/preview`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ modelName: 'orchestrator-carbon' }),
      })
    ).json();
    assert.equal(prevOrch.persona.leadName, '玄枢');
    assert.equal(prevOrch.persona.partnerName, '小霓');
    assert.match(prevOrch.systemMessage, /玄枢/);
    assert.match(prevOrch.systemMessage, /小霓/);

    // 4. Reset all restores built-in defaults cleanly
    const resetRes = await fetch(`${baseUrl}/api/reset`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ scope: 'all' }),
    });
    assert.equal(resetRes.status, 200);
    const resetData = await resetRes.json();
    assert.equal(resetData.config.models.carbon.useCustom, false);
    assert.equal(resetData.config.orchestrator.variants.carbon.useCustom, false);

    const prevRestored = await (
      await fetch(`${baseUrl}/api/preview`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ modelName: 'gemini-4-carbon-high' }),
      })
    ).json();
    assert.equal(prevRestored.persona.selfName, '小凛');
  });
});
