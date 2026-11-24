/**
 * Cross-platform filesystem and JSON utilities for gemini-personas.
 * Handles UTF-8 BOM stripping and atomic writes with Windows rename retry safety.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const MAX_RENAME_RETRIES = 4;

/**
 * Strip an optional leading UTF-8 BOM so JSON written by Windows tools parses cleanly.
 */
export function stripUtf8Bom(text) {
  return typeof text === 'string' ? text.replace(/^\uFEFF/, '') : '';
}

/**
 * Safely read and parse a JSON file, returning `fallback` if missing or invalid.
 */
export function readJsonSafe(filePath, fallback = null) {
  try {
    if (!filePath || !existsSync(filePath)) return fallback;
    const parsed = JSON.parse(stripUtf8Bom(readFileSync(filePath, 'utf8')));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Atomically write text to `filePath` via a unique temp file and Windows-safe rename retries.
 */
export function writeFileAtomic(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  const suffix = `${process.pid}.${randomBytes(4).toString('hex')}`;
  const tmpPath = `${filePath}.${suffix}.tmp`;
  try {
    writeFileSync(tmpPath, content, 'utf8');
    for (let attempt = 0; attempt <= MAX_RENAME_RETRIES; attempt++) {
      try {
        renameSync(tmpPath, filePath);
        return;
      } catch (err) {
        if (!RETRYABLE_RENAME_CODES.has(err?.code) || attempt === MAX_RENAME_RETRIES) {
          throw err;
        }
        // Brief synchronous spin-wait before retrying transient AV/indexer lock on Windows.
        const until = Date.now() + 12 * (attempt + 1);
        while (Date.now() < until) {
          // intentional short backoff
        }
      }
    }
  } finally {
    if (existsSync(tmpPath)) {
      try {
        rmSync(tmpPath, { force: true });
      } catch {
        // Ignore best-effort temp cleanup errors.
      }
    }
  }
}
