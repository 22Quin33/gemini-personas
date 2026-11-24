/**
 * Custom persona configuration loader, normalizer, atomic writer, and fingerprinting utilities.
 */

import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonSafe, writeFileAtomic } from './fs_utils.mjs';

const DEFAULT_CONFIG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'custom_personas.json',
);

const SOLO_MODEL_KEYS = ['hydrogen', 'carbon', 'neon'];
const ORCH_VARIANT_KEYS = ['carbon', 'neon', 'default'];

function emptyModelEntry() {
  return {
    useCustom: false,
    selfName: '',
    title: '',
    badgeIcon: '',
    appearance: '',
    style: '',
    emojis: '',
    prompt: '',
  };
}

function emptyActorConfig(personaId) {
  return {
    personaId,
    customOverride: {
      enabled: false,
      selfName: '',
      roleTitle: '',
      badgeIcon: '',
      appearance: '',
      style: '',
      emojis: '',
    },
  };
}

export function createDefaultCustomConfig() {
  return {
    schemaVersion: 1,
    forceDefault: false,
    models: {
      hydrogen: emptyModelEntry(),
      carbon: emptyModelEntry(),
      neon: emptyModelEntry(),
    },
    customModelRules: [],
    orchestrator: {
      useCustom: false,
      variants: {
        carbon: {
          useCustom: false,
          lead: emptyActorConfig('carbon'),
          partner: emptyActorConfig('hydrogen'),
          interactionStyle: '',
          speakingRatio: '',
          prompt: '',
        },
        neon: {
          useCustom: false,
          lead: emptyActorConfig('neon'),
          partner: emptyActorConfig('hydrogen'),
          interactionStyle: '',
          speakingRatio: '',
          prompt: '',
        },
        default: {
          useCustom: false,
          lead: emptyActorConfig('carbon'),
          partner: emptyActorConfig('hydrogen'),
          interactionStyle: '',
          speakingRatio: '',
          prompt: '',
        },
      },
    },
  };
}

function normalizeModelEntry(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    useCustom: Boolean(src.useCustom),
    selfName: String(src.selfName ?? ''),
    title: String(src.title ?? ''),
    badgeIcon: String(src.badgeIcon ?? ''),
    appearance: String(src.appearance ?? ''),
    style: String(src.style ?? ''),
    emojis: String(src.emojis ?? ''),
    prompt: String(src.prompt ?? ''),
  };
}

function normalizeActorConfig(raw, fallbackPersonaId) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const ov = src.customOverride && typeof src.customOverride === 'object' ? src.customOverride : {};
  const personaId = String(src.personaId || fallbackPersonaId).trim() || fallbackPersonaId;
  return {
    personaId,
    customOverride: {
      enabled: Boolean(ov.enabled),
      selfName: String(ov.selfName ?? ''),
      roleTitle: String(ov.roleTitle ?? ''),
      badgeIcon: String(ov.badgeIcon ?? ''),
      appearance: String(ov.appearance ?? ''),
      style: String(ov.style ?? ''),
      emojis: String(ov.emojis ?? ''),
    },
  };
}

export function normalizeCustomConfig(raw) {
  const defaults = createDefaultCustomConfig();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaults;
  }

  const out = {
    schemaVersion: 1,
    forceDefault: Boolean(raw.forceDefault),
    models: { ...defaults.models },
    customModelRules: [],
    orchestrator: {
      useCustom: Boolean(raw.orchestrator?.useCustom),
      variants: { ...defaults.orchestrator.variants },
    },
  };

  for (const key of SOLO_MODEL_KEYS) {
    out.models[key] = normalizeModelEntry(raw.models?.[key]);
  }

  if (Array.isArray(raw.customModelRules)) {
    out.customModelRules = raw.customModelRules
      .filter((item) => item && typeof item === 'object')
      .map((item, idx) => ({
        id: String(item.id || `rule_${idx + 1}`).trim(),
        keyword: String(item.keyword ?? '').trim(),
        enabled: item.enabled !== false,
        selfName: String(item.selfName ?? ''),
        title: String(item.title ?? ''),
        badgeIcon: String(item.badgeIcon ?? ''),
        appearance: String(item.appearance ?? ''),
        style: String(item.style ?? ''),
        emojis: String(item.emojis ?? ''),
        prompt: String(item.prompt ?? ''),
      }));
  }

  for (const variantKey of ORCH_VARIANT_KEYS) {
    const defVariant = defaults.orchestrator.variants[variantKey];
    const srcVariant = raw.orchestrator?.variants?.[variantKey];
    const src = srcVariant && typeof srcVariant === 'object' ? srcVariant : {};
    out.orchestrator.variants[variantKey] = {
      useCustom: Boolean(src.useCustom),
      lead: normalizeActorConfig(src.lead, defVariant.lead.personaId),
      partner: normalizeActorConfig(src.partner, defVariant.partner.personaId),
      interactionStyle: String(src.interactionStyle ?? ''),
      speakingRatio: String(src.speakingRatio ?? ''),
      prompt: String(src.prompt ?? ''),
    };
  }

  return out;
}

export function resolveCustomConfigPath() {
  const override = String(process.env.GEMINI_PERSONAS_CONFIG || '').trim();
  return override || DEFAULT_CONFIG_PATH;
}

export function loadCustomConfig(configPath = resolveCustomConfigPath()) {
  const parsed = readJsonSafe(configPath, null);
  return parsed && !Array.isArray(parsed) ? parsed : null;
}

export function saveCustomConfigAtomic(config, configPath = resolveCustomConfigPath()) {
  const normalized = normalizeCustomConfig(config);
  writeFileAtomic(configPath, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

export function computePersonaFingerprint(persona) {
  const source = [
    String(persona?.id || ''),
    String(persona?.selfName || ''),
    String(persona?.title || ''),
    String(persona?.prompt || ''),
  ].join('\0');
  return createHash('sha1').update(source).digest('hex').slice(0, 12);
}
