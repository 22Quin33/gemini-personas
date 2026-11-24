/**
 * 双子星人格工坊 Sidecar 前端控制器。
 */

(function () {
  const $ = (id) => document.getElementById(id);
  const fetcher = window.sidecar?.fetch ? window.sidecar.fetch : window.fetch.bind(window);

  const CHIBI_IMAGES = {
    hydrogen: '/assets/chibi-hydrogen.png?v=2',
    carbon: '/assets/chibi-carbon.png?v=2',
    neon: '/assets/chibi-neon.png?v=2',
  };

  const state = {
    config: null,
    builtins: null,
    activeTab: 'solo',
    activeSolo: 'hydrogen',
    activeVariant: 'carbon',
    dirty: false,
    toastTimer: null,
  };

  function syncThemeSchemeFromBg() {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
    if (!bg) return;
    const probe = document.createElement('span');
    probe.style.color = bg;
    probe.style.display = 'none';
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
    if (!m) return;
    const lum = (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255;
    document.documentElement.dataset.theme = lum < 0.48 ? 'dark' : 'light';
  }

  window.addEventListener('message', (ev) => {
    if (ev.data?.type === 'theme-change') {
      requestAnimationFrame(syncThemeSchemeFromBg);
    }
  });

  function showToast(msg, isError = false) {
    const el = $('toast');
    el.textContent = msg;
    el.className = isError ? 'toast error' : 'toast';
    el.hidden = false;
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 2600);
  }

  function setDirty(dirty) {
    state.dirty = dirty;
    $('dirty-dot').hidden = !dirty;
    $('btn-save').classList.toggle('dirty', dirty);
  }

  async function apiJson(path, options = {}) {
    const res = await fetcher(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  function hasAnyCustomActive(cfg) {
    if (!cfg || cfg.forceDefault) return false;
    const soloActive = Object.values(cfg.models || {}).some((m) => Boolean(m?.useCustom));
    const rulesActive = (cfg.customModelRules || []).some((r) => r && r.enabled !== false && r.keyword);
    const orchActive = Object.values(cfg.orchestrator?.variants || {}).some((v) => Boolean(v?.useCustom));
    return soloActive || rulesActive || orchActive;
  }

  function renderTopBarAndStage() {
    const cfg = state.config;
    const builtins = state.builtins;
    if (!cfg || !builtins) return;

    const pill = $('global-status-pill');
    const forceBtn = $('btn-force-default');
    const forceLabel = $('force-default-label');

    if (cfg.forceDefault) {
      pill.textContent = '强制默认锁定中';
      pill.className = 'status-pill locked';
      forceBtn.classList.add('active-lock');
      forceLabel.textContent = '锁定默认: 开';
    } else if (hasAnyCustomActive(cfg)) {
      pill.textContent = '已启用自定义';
      pill.className = 'status-pill custom';
      forceBtn.classList.remove('active-lock');
      forceLabel.textContent = '锁定默认: 关';
    } else {
      pill.textContent = '默认内置生效';
      pill.className = 'status-pill';
      forceBtn.classList.remove('active-lock');
      forceLabel.textContent = '锁定默认: 关';
    }

    for (const key of ['hydrogen', 'carbon', 'neon']) {
      const m = cfg.models[key];
      const b = builtins.solo[key];
      const isCustom = !cfg.forceDefault && Boolean(m?.useCustom);
      const activeName = isCustom && m.selfName.trim() ? m.selfName.trim() : b.selfName;
      const activeIcon = isCustom && m.badgeIcon.trim() ? m.badgeIcon.trim() : b.badgeIcon;

      $(`chibi-name-${key}`).textContent = `${activeIcon} ${activeName}`;
      const chip = $(`chibi-chip-${key}`);
      chip.textContent = isCustom ? '自定义中' : '内置默认';
      chip.className = isCustom ? 'chibi-chip is-custom' : 'chibi-chip';

      const card = $(`chibi-card-${key}`);
      let highlighted = false;
      if (state.activeTab === 'solo') {
        highlighted = state.activeSolo === key;
      } else if (state.activeTab === 'orchestrator') {
        const v = cfg.orchestrator.variants[state.activeVariant];
        highlighted = v?.lead?.personaId === key || v?.partner?.personaId === key;
      }
      card.classList.toggle('active', highlighted);
    }
  }

  function renderSoloPanel() {
    const cfg = state.config;
    const builtins = state.builtins;
    if (!cfg || !builtins) return;

    const key = state.activeSolo;
    const modelCfg = cfg.models[key];
    const builtin = builtins.solo[key];

    document.querySelectorAll('#solo-model-pills .seg-pill').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.solo === key);
    });

    $('solo-use-custom').checked = Boolean(modelCfg.useCustom);
    $('solo-mode-hint').textContent = cfg.forceDefault
      ? '全局“锁定默认”已开启，当前仍使用内置原设定'
      : modelCfg.useCustom
        ? `已开启自定义，将覆盖 ${builtin.selfName} 默认设定（空白字段自动继承内置）`
        : `未启用自定义时将保持内置「${builtin.selfName}」原设定`;

    $('solo-self-name').value = modelCfg.selfName;
    $('solo-self-name').placeholder = builtin.selfName;

    $('solo-badge-icon').value = modelCfg.badgeIcon;
    $('solo-badge-icon').placeholder = builtin.badgeIcon;

    $('solo-title').value = modelCfg.title;
    $('solo-title').placeholder = builtin.title;

    $('solo-appearance').value = modelCfg.appearance;
    $('solo-appearance').placeholder = builtin.appearance;

    $('solo-style').value = modelCfg.style;
    $('solo-style').placeholder = builtin.style;

    $('solo-emojis').value = modelCfg.emojis;
    $('solo-emojis').placeholder = builtin.emojis;

    $('solo-prompt').value = modelCfg.prompt;
  }

  function resolveActorDisplay(actorCfg, fallbackId) {
    const cfg = state.config;
    const builtins = state.builtins;
    const pid = actorCfg?.personaId || fallbackId;
    const soloBuiltin = builtins.solo[pid] || builtins.solo[fallbackId];
    const soloCustom = !cfg.forceDefault && cfg.models[pid]?.useCustom ? cfg.models[pid] : null;
    const baseName = soloCustom?.selfName?.trim() || soloBuiltin.selfName;
    const baseIcon = soloCustom?.badgeIcon?.trim() || soloBuiltin.badgeIcon;

    const ov = actorCfg?.customOverride?.enabled && !cfg.forceDefault ? actorCfg.customOverride : null;
    const selfName = ov?.selfName?.trim() || baseName;
    const badgeIcon = ov?.badgeIcon?.trim() || baseIcon;
    return {
      personaId: pid,
      selfName,
      badgeIcon,
      img: CHIBI_IMAGES[pid] || CHIBI_IMAGES[fallbackId],
    };
  }

  function renderDuoStage() {
    const cfg = state.config;
    const builtins = state.builtins;
    if (!cfg || !builtins) return;

    const vKey = state.activeVariant;
    const vCfg = cfg.orchestrator.variants[vKey];
    const defaultLeadId = vKey === 'neon' ? 'neon' : 'carbon';

    const leadInfo = resolveActorDisplay(vCfg.lead, defaultLeadId);
    const partnerInfo = resolveActorDisplay(vCfg.partner, 'hydrogen');

    $('duo-lead-img').src = leadInfo.img;
    $('duo-lead-name').textContent = `${leadInfo.badgeIcon} ${leadInfo.selfName}`;
    $('duo-partner-img').src = partnerInfo.img;
    $('duo-partner-name').textContent = `${partnerInfo.badgeIcon} ${partnerInfo.selfName}`;
  }

  function renderOrchestratorPanel() {
    const cfg = state.config;
    const builtins = state.builtins;
    if (!cfg || !builtins) return;

    const vKey = state.activeVariant;
    const vCfg = cfg.orchestrator.variants[vKey];
    const vBuiltin = builtins.orchestrator[vKey] || builtins.orchestrator.carbon;

    document.querySelectorAll('#orch-variant-pills .seg-pill').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.variant === vKey);
    });

    $('orch-use-custom').checked = Boolean(vCfg.useCustom);
    $('orch-mode-hint').textContent = cfg.forceDefault
      ? '全局“锁定默认”已开启，当前保持内置双人设定'
      : vCfg.useCustom
        ? '已开启自定义，将按下方主/副模型配置同台演出'
        : `未启用时沿用内置「${vBuiltin.selfName}」双人设定`;

    $('lead-persona-id').value = vCfg.lead.personaId;
    $('lead-override-enabled').checked = Boolean(vCfg.lead.customOverride.enabled);
    $('lead-override-fields').hidden = !vCfg.lead.customOverride.enabled;
    $('lead-self-name').value = vCfg.lead.customOverride.selfName;
    $('lead-role-title').value = vCfg.lead.customOverride.roleTitle;
    $('lead-badge-icon').value = vCfg.lead.customOverride.badgeIcon;
    $('lead-appearance').value = vCfg.lead.customOverride.appearance;
    $('lead-style').value = vCfg.lead.customOverride.style;
    $('lead-emojis').value = vCfg.lead.customOverride.emojis;

    $('partner-persona-id').value = vCfg.partner.personaId;
    $('partner-override-enabled').checked = Boolean(vCfg.partner.customOverride.enabled);
    $('partner-override-fields').hidden = !vCfg.partner.customOverride.enabled;
    $('partner-self-name').value = vCfg.partner.customOverride.selfName;
    $('partner-role-title').value = vCfg.partner.customOverride.roleTitle;
    $('partner-badge-icon').value = vCfg.partner.customOverride.badgeIcon;
    $('partner-appearance').value = vCfg.partner.customOverride.appearance;
    $('partner-style').value = vCfg.partner.customOverride.style;
    $('partner-emojis').value = vCfg.partner.customOverride.emojis;

    $('orch-interaction-style').value = vCfg.interactionStyle;
    $('orch-interaction-style').placeholder = vBuiltin.interactionStyle;
    $('orch-speaking-ratio').value = vCfg.speakingRatio;
    $('orch-speaking-ratio').placeholder = vBuiltin.speakingRatio;
    $('orch-prompt').value = vCfg.prompt;

    renderDuoStage();
  }

  function renderRulesList() {
    const cfg = state.config;
    const container = $('rules-list');
    container.innerHTML = '';

    if (!cfg || !Array.isArray(cfg.customModelRules) || cfg.customModelRules.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'switch-hint';
      empty.textContent = '暂无扩展规则。点击右上角“+ 添加规则”即可为 Claude 等其他模型指定人格。';
      container.appendChild(empty);
      return;
    }

    cfg.customModelRules.forEach((rule, index) => {
      const card = document.createElement('div');
      card.className = 'rule-item';

      const head = document.createElement('div');
      head.className = 'rule-head';

      const left = document.createElement('label');
      left.className = 'inline-check';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = rule.enabled !== false;
      chk.addEventListener('change', () => {
        rule.enabled = chk.checked;
        setDirty(true);
        renderTopBarAndStage();
      });
      const lblText = document.createElement('strong');
      lblText.textContent = `规则 #${index + 1}`;
      left.append(chk, lblText);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'ghost-btn';
      delBtn.textContent = '删除';
      delBtn.addEventListener('click', () => {
        cfg.customModelRules.splice(index, 1);
        setDirty(true);
        renderRulesList();
        renderTopBarAndStage();
      });

      head.append(left, delBtn);

      const grid1 = document.createElement('div');
      grid1.className = 'field-grid three-col';

      const makeInputField = (labelText, value, placeholder, onInput) => {
        const wrap = document.createElement('label');
        wrap.className = 'field';
        const span = document.createElement('span');
        span.textContent = labelText;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value || '';
        input.placeholder = placeholder;
        input.addEventListener('input', () => {
          onInput(input.value);
          setDirty(true);
        });
        wrap.append(span, input);
        return wrap;
      };

      grid1.append(
        makeInputField('模型关键词', rule.keyword, '如 claude', (v) => {
          rule.keyword = v;
        }),
        makeInputField('自称', rule.selfName, '如 克洛伊', (v) => {
          rule.selfName = v;
        }),
        makeInputField('徽标', rule.badgeIcon, '📜', (v) => {
          rule.badgeIcon = v;
        }),
      );

      const grid2 = document.createElement('div');
      grid2.className = 'field-grid two-col';
      grid2.append(
        makeInputField('形象描述', rule.appearance, '外貌与发饰设定', (v) => {
          rule.appearance = v;
        }),
        makeInputField('性格风格', rule.style, '说话语气与特点', (v) => {
          rule.style = v;
        }),
      );

      card.append(head, grid1, grid2);
      container.appendChild(card);
    });
  }

  function renderAll() {
    renderTopBarAndStage();
    renderSoloPanel();
    renderOrchestratorPanel();
    renderRulesList();
  }

  function switchTab(tabName) {
    state.activeTab = tabName;
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });
    ['solo', 'orchestrator', 'advanced'].forEach((name) => {
      $(`panel-${name}`).hidden = name !== tabName;
    });
    renderTopBarAndStage();
  }

  async function runPreview() {
    try {
      const modelName = $('preview-model-input').value.trim() || 'gemini-4-hydrogen-xhigh';
      const data = await apiJson('/api/preview', {
        method: 'POST',
        body: JSON.stringify({ modelName, config: state.config }),
      });
      const p = data.persona;
      $('preview-resolved-name').textContent = `${p.badgeIcon || ''} ${p.selfName} (${p.mode})`;
      $('preview-fingerprint').textContent = `fp: ${data.fingerprint}`;
      $('preview-output').textContent = data.systemMessage;
    } catch (err) {
      showToast(`预览失败：${err.message}`, true);
    }
  }

  async function saveConfig(msg = '配置已保存！下一轮对话热切换生效 ✨') {
    try {
      const data = await apiJson('/api/config', {
        method: 'POST',
        body: JSON.stringify({ config: state.config }),
      });
      state.config = data.config;
      setDirty(false);
      renderAll();
      showToast(msg);
    } catch (err) {
      showToast(`保存失败：${err.message}`, true);
    }
  }

  async function resetScope(scope, key = '', msg = '已还原为内置默认设定') {
    try {
      const data = await apiJson('/api/reset', {
        method: 'POST',
        body: JSON.stringify({ scope, key }),
      });
      state.config = data.config;
      setDirty(false);
      renderAll();
      showToast(msg);
      if (state.activeTab === 'advanced') {
        await runPreview();
      }
    } catch (err) {
      showToast(`还原失败：${err.message}`, true);
    }
  }

  function bindEvents() {
    document.querySelectorAll('.chibi-card').forEach((card) => {
      card.addEventListener('click', () => {
        state.activeSolo = card.dataset.chibi;
        switchTab('solo');
        renderSoloPanel();
        renderTopBarAndStage();
      });
    });

    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
        if (btn.dataset.tab === 'advanced') {
          runPreview();
        }
      });
    });

    document.querySelectorAll('#solo-model-pills .seg-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeSolo = btn.dataset.solo;
        renderSoloPanel();
        renderTopBarAndStage();
      });
    });

    document.querySelectorAll('#orch-variant-pills .seg-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeVariant = btn.dataset.variant;
        renderOrchestratorPanel();
        renderTopBarAndStage();
      });
    });

    const bindSoloField = (id, fieldName, isCheckbox = false) => {
      $(id).addEventListener(isCheckbox ? 'change' : 'input', (e) => {
        const modelCfg = state.config.models[state.activeSolo];
        modelCfg[fieldName] = isCheckbox ? e.target.checked : e.target.value;
        setDirty(true);
        if (isCheckbox || fieldName === 'selfName' || fieldName === 'badgeIcon') {
          renderTopBarAndStage();
          if (isCheckbox) renderSoloPanel();
        }
      });
    };

    bindSoloField('solo-use-custom', 'useCustom', true);
    bindSoloField('solo-self-name', 'selfName');
    bindSoloField('solo-badge-icon', 'badgeIcon');
    bindSoloField('solo-title', 'title');
    bindSoloField('solo-appearance', 'appearance');
    bindSoloField('solo-style', 'style');
    bindSoloField('solo-emojis', 'emojis');
    bindSoloField('solo-prompt', 'prompt');

    $('orch-use-custom').addEventListener('change', (e) => {
      state.config.orchestrator.variants[state.activeVariant].useCustom = e.target.checked;
      setDirty(true);
      renderOrchestratorPanel();
      renderTopBarAndStage();
    });

    const bindActor = (prefix, actorKey) => {
      $(`${prefix}-persona-id`).addEventListener('change', (e) => {
        state.config.orchestrator.variants[state.activeVariant][actorKey].personaId = e.target.value;
        setDirty(true);
        renderDuoStage();
        renderTopBarAndStage();
      });

      $(`${prefix}-override-enabled`).addEventListener('change', (e) => {
        state.config.orchestrator.variants[state.activeVariant][actorKey].customOverride.enabled =
          e.target.checked;
        $(`${prefix}-override-fields`).hidden = !e.target.checked;
        setDirty(true);
        renderDuoStage();
      });

      const ovFields = [
        ['self-name', 'selfName'],
        ['role-title', 'roleTitle'],
        ['badge-icon', 'badgeIcon'],
        ['appearance', 'appearance'],
        ['style', 'style'],
        ['emojis', 'emojis'],
      ];
      for (const [suffix, prop] of ovFields) {
        $(`${prefix}-${suffix}`).addEventListener('input', (e) => {
          state.config.orchestrator.variants[state.activeVariant][actorKey].customOverride[prop] =
            e.target.value;
          setDirty(true);
          if (prop === 'selfName' || prop === 'badgeIcon') {
            renderDuoStage();
          }
        });
      }
    };

    bindActor('lead', 'lead');
    bindActor('partner', 'partner');

    const bindOrchProp = (id, prop) => {
      $(id).addEventListener('input', (e) => {
        state.config.orchestrator.variants[state.activeVariant][prop] = e.target.value;
        setDirty(true);
      });
    };
    bindOrchProp('orch-interaction-style', 'interactionStyle');
    bindOrchProp('orch-speaking-ratio', 'speakingRatio');
    bindOrchProp('orch-prompt', 'prompt');

    $('btn-save').addEventListener('click', () => saveConfig());

    $('btn-force-default').addEventListener('click', () => {
      state.config.forceDefault = !state.config.forceDefault;
      saveConfig(
        state.config.forceDefault
          ? '已开启全局锁定：全部模型临时恢复内置默认设定'
          : '已解除全局锁定：恢复按各模型自定义开关生效',
      );
    });

    $('btn-reset-solo').addEventListener('click', () =>
      resetScope('model', state.activeSolo, `已还原 ${state.activeSolo} 为内置默认`),
    );

    $('btn-reset-variant').addEventListener('click', () =>
      resetScope('variant', state.activeVariant, `已还原 Orchestrator (${state.activeVariant}) 默认`),
    );

    $('btn-reset-all').addEventListener('click', () =>
      resetScope('all', '', '已将全部单人及 Orchestrator 配置还原为内置默认'),
    );

    $('btn-add-rule').addEventListener('click', () => {
      state.config.customModelRules.push({
        id: `rule_${Date.now()}`,
        keyword: '',
        enabled: true,
        selfName: '',
        title: '',
        badgeIcon: '✦',
        appearance: '',
        style: '',
        emojis: '',
        prompt: '',
      });
      setDirty(true);
      renderRulesList();
    });

    $('preview-preset').addEventListener('change', (e) => {
      $('preview-model-input').value = e.target.value;
      runPreview();
    });
    $('btn-run-preview').addEventListener('click', runPreview);

    $('btn-jump-preview-solo').addEventListener('click', () => {
      const modelMap = {
        hydrogen: 'gemini-4-hydrogen-xhigh',
        carbon: 'gemini-4-carbon-high',
        neon: 'gemini-4-neon-high',
      };
      $('preview-preset').value = modelMap[state.activeSolo];
      $('preview-model-input').value = modelMap[state.activeSolo];
      switchTab('advanced');
      runPreview();
    });

    $('btn-jump-preview-orch').addEventListener('click', () => {
      const map = {
        carbon: 'orchestrator-carbon',
        neon: 'orchestrator-neon',
        default: 'orchestrator-carbon',
      };
      $('preview-preset').value = map[state.activeVariant];
      $('preview-model-input').value = map[state.activeVariant];
      switchTab('advanced');
      runPreview();
    });
  }

  async function init() {
    syncThemeSchemeFromBg();
    bindEvents();
    try {
      const data = await apiJson('/api/state', { method: 'GET' });
      state.config = data.config;
      state.builtins = data.builtins;
      setDirty(false);
      renderAll();
    } catch (err) {
      showToast(`加载配置失败：${err.message}`, true);
    }
  }

  init();
})();
