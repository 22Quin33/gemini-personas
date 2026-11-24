/**
 * Shared state and stdin utilities for gemini-personas lifecycle hooks.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { readJsonSafe, stripUtf8Bom, writeFileAtomic } from './fs_utils.mjs';

export function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      raw += chunk;
    });
    process.stdin.on('end', () => resolve(stripUtf8Bom(raw)));
    process.stdin.on('error', () => resolve(stripUtf8Bom(raw)));
  });
}

function walkUpToParent(startPath, markerDirName) {
  if (!startPath || typeof startPath !== 'string') return '';
  let cur = startPath;
  for (let i = 0; i < 12; i++) {
    const parent = dirname(cur);
    if (basename(cur) === markerDirName && existsSync(parent)) {
      return parent;
    }
    if (parent === cur) break;
    cur = parent;
  }
  return '';
}

function walkUpToGeminiSurfaceRoot(startPath) {
  if (!startPath || typeof startPath !== 'string') return '';
  let cur = startPath;
  for (let i = 0; i < 12; i++) {
    const parent = dirname(cur);
    if (basename(parent) === '.gemini' && cur !== parent && existsSync(cur)) {
      return cur;
    }
    if (parent === cur) break;
    cur = parent;
  }
  return '';
}

function resolveAppDataFromPath(candidatePath) {
  return (
    walkUpToParent(candidatePath, 'brain') ||
    walkUpToGeminiSurfaceRoot(candidatePath)
  );
}

export function resolveStateDir(payload) {
  const envPluginData = String(process.env.PLUGIN_DATA || '').trim();
  if (envPluginData) return envPluginData;

  const envAppData = String(process.env.ANTIGRAVITY_APP_DATA_DIR || '').trim();
  if (envAppData) {
    return join(envAppData, 'plugin_data', 'gemini-personas');
  }

  const fromArtifact = resolveAppDataFromPath(payload?.artifactDirectoryPath);
  if (fromArtifact) return join(fromArtifact, 'plugin_data', 'gemini-personas');

  const fromTranscript = resolveAppDataFromPath(payload?.transcriptPath);
  if (fromTranscript) return join(fromTranscript, 'plugin_data', 'gemini-personas');

  const geminiHome = String(process.env.GEMINI_HOME || '').trim();
  if (geminiHome) {
    return join(geminiHome, 'antigravity', 'plugin_data', 'gemini-personas');
  }

  return join(homedir(), '.gemini', 'antigravity', 'plugin_data', 'gemini-personas');
}

export function sessionStateFilePath(stateDir, conversationId) {
  const safePrefix = conversationId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  const digest = createHash('sha1').update(conversationId).digest('hex').slice(0, 12);
  return join(stateDir, 'sessions', `${safePrefix}-${digest}.json`);
}

export function readSessionState(filePath) {
  const data = readJsonSafe(filePath, null);
  return data && !Array.isArray(data) ? data : null;
}

export function writeSessionStateAtomic(filePath, stateObj) {
  writeFileAtomic(filePath, JSON.stringify(stateObj));
}
