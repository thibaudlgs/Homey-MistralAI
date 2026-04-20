'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');
const { HomeyAPI } = require('homey-api');

const DEFAULT_MODELS = [
  { name: 'Mistral Large', description: 'mistral-large-latest', id: 'mistral-large-latest' },
  { name: 'Mistral Medium', description: 'mistral-medium-latest', id: 'mistral-medium-latest' },
  { name: 'Mistral Small', description: 'mistral-small-latest', id: 'mistral-small-latest' },
  { name: 'Mistral Tiny', description: 'mistral-tiny-latest', id: 'mistral-tiny-latest' },
  { name: 'Mixtral 8x7B', description: 'open-mixtral-8x7b', id: 'open-mixtral-8x7b' },
  { name: 'Mistral 7B', description: 'open-mistral-7b', id: 'open-mistral-7b' },
  { name: 'Codestral', description: 'codestral-latest', id: 'codestral-latest' }
];

const DEFAULT_VISION_MODELS = [
  { name: 'Pixtral Large', description: 'pixtral-large-latest', id: 'pixtral-large-latest' },
  { name: 'Pixtral 12B', description: 'pixtral-12b-2409', id: 'pixtral-12b-2409' }
];

const FETCH_TIMEOUT_MS = 30000;

// --- Capability type hint lookup ---
const CAP_TYPE_HINTS = {
  onoff: 'bool', dim: '0.0-1.0',
  light_hue: '0.0-1.0', light_saturation: '0.0-1.0',
  light_temperature: '0-1(warm→cool)', light_mode: 'string',
  target_temperature: 'num(°C)',
  measure_temperature: 'ro', measure_humidity: 'ro',
  measure_power: 'ro', measure_battery: 'ro',
  volume_set: '0.0-1.0', volume_mute: 'bool',
  speaker_playing: 'bool', speaker_next: 'cmd', speaker_prev: 'cmd',
  locked: 'bool', windowcoverings_set: '0.0-1.0',
  alarm_motion: 'ro', alarm_contact: 'ro',
};

function getCapHint(capKey) {
  return CAP_TYPE_HINTS[capKey] || '';
}

/**
 * Returns effective { expose, control } for a device.
 * Default (no saved config) is { expose: true, control: true }.
 */
function getDevicePermission(deviceId, permissionsMap) {
  if (!permissionsMap || !permissionsMap[deviceId]) {
    return { expose: true, control: true };
  }
  const p = permissionsMap[deviceId];
  const expose  = p.expose  !== false;
  const control = expose && (p.control !== false);
  return { expose, control };
}

class MistralApp extends Homey.App {
  async onInit() {
    this.log('Mistral AI App initialized');

    this.conversations = {};
    this.scheduledTasks = {};
    this._discoveredActionTitles = [];
    this._discoveredActions = [];


    try {
      this.homeyApi = await HomeyAPI.createAppAPI({ homey: this.homey });
      this.log('Homey API instantiated successfully');
    } catch (err) {
      this.error('Failed to instantiate Homey API', err);
    }

    // --- Restore Scheduled Tasks from previous session ---
    this._restoreScheduledTasks();


    // --- Flow Action: Ask Mistral ---
    const askMistralAction = this.homey.flow.getActionCard('ask_mistral');
    
    askMistralAction.registerArgumentAutocompleteListener('model', async (query, args) => {
      if (!query) return DEFAULT_MODELS;
      
      const filtered = DEFAULT_MODELS.filter(m => 
        m.name.toLowerCase().includes(query.toLowerCase()) || 
        m.id.toLowerCase().includes(query.toLowerCase())
      );
      
      const isExactMatch = DEFAULT_MODELS.some(m => 
        m.id.toLowerCase() === query.toLowerCase() || 
        m.name.toLowerCase() === query.toLowerCase()
      );
      
      if (!isExactMatch) {
        filtered.push({
          name: `Custom: ${query}`,
          description: `Use custom model: ${query}`,
          id: query
        });
      }
      
      return filtered;
    });

    askMistralAction.registerRunListener(async (args) => {
      const { prompt, model, max_tokens, conversation_id } = args;

      if (!prompt || !prompt.trim()) {
        throw new Error('Prompt cannot be empty.');
      }

      let resolvedModel = 'mistral-small-latest';
      if (typeof model === 'object' && model !== null && model.id) {
        resolvedModel = model.id;
      } else if (typeof model === 'object' && model !== null && model.name) {
        resolvedModel = model.name;
      } else if (typeof model === 'string' && model.trim()) {
        resolvedModel = model.trim();
      }

      const system_prompt = this.homey.settings.get('system_prompt');

      const resolvedSystemPrompt = system_prompt && system_prompt.trim()
        ? system_prompt.trim()
        : 'You are a helpful assistant integrated in a smart home system (Homey Pro). Be concise.';

      const parsedTokens = parseInt(max_tokens, 10);
      const resolvedMaxTokens = Number.isFinite(parsedTokens)
        ? Math.min(Math.max(parsedTokens, 1), 4096)
        : 200;

      const convId = conversation_id && conversation_id.trim() ? conversation_id.trim() : null;
      const history = convId ? (this.conversations[convId] || []) : [];

      const body = {
        model: resolvedModel,
        messages: [
          { role: 'system', content: resolvedSystemPrompt },
          ...history,
          { role: 'user', content: prompt.trim() }
        ],
        max_tokens: resolvedMaxTokens,
        temperature: 0.7
      };

      const responseData = await this.fetchMistral(body);
      const responseText = responseData?.choices?.[0]?.message?.content?.trim();

      if (!responseText) {
        throw new Error('Mistral AI returned an empty or unexpected response.');
      }

      if (convId) {
        if (!this.conversations[convId]) this.conversations[convId] = [];
        this.conversations[convId].push({ role: 'user', content: prompt.trim() });
        this.conversations[convId].push({ role: 'assistant', content: responseText });
        if (this.conversations[convId].length > 20) {
          this.conversations[convId] = this.conversations[convId].slice(-20);
        }
      }

      this.log(`Mistral responded: ${responseText.substring(0, 80)}...`);

      // Fire the trigger for any listening flows
      const respondedTrigger = this.homey.flow.getTriggerCard('mistral_responded');
      await respondedTrigger.trigger({ response: responseText, prompt: prompt.trim() }).catch(this.error);

      // Return token back to the action card
      return { response: responseText };
    });

    // --- Flow Action: Ask Mistral (Vision) ---
    const askMistralVisionAction = this.homey.flow.getActionCard('ask_mistral_vision');
    
    askMistralVisionAction.registerArgumentAutocompleteListener('model', async (query, args) => {
      if (!query) return DEFAULT_VISION_MODELS;
      
      const filtered = DEFAULT_VISION_MODELS.filter(m => 
        m.name.toLowerCase().includes(query.toLowerCase()) || 
        m.id.toLowerCase().includes(query.toLowerCase())
      );
      
      const isExactMatch = DEFAULT_VISION_MODELS.some(m => 
        m.id.toLowerCase() === query.toLowerCase() || 
        m.name.toLowerCase() === query.toLowerCase()
      );
      
      if (!isExactMatch) {
        filtered.push({
          name: `Custom: ${query}`,
          description: `Use custom model: ${query}`,
          id: query
        });
      }
      
      return filtered;
    });

    askMistralVisionAction.registerRunListener(async (args) => {
      const { prompt, droptoken, model, max_tokens } = args;

      if (!prompt || !prompt.trim()) {
        throw new Error('Prompt cannot be empty.');
      }
      if (!droptoken) {
        throw new Error('An image must be provided.');
      }

      let resolvedModel = 'pixtral-12b-2409';
      if (typeof model === 'object' && model !== null && model.id) {
        resolvedModel = model.id;
      } else if (typeof model === 'object' && model !== null && model.name) {
        resolvedModel = model.name;
      } else if (typeof model === 'string' && model.trim()) {
        resolvedModel = model.trim();
      }

      const system_prompt = this.homey.settings.get('system_prompt');

      const resolvedSystemPrompt = system_prompt && system_prompt.trim()
        ? system_prompt.trim()
        : 'You are a helpful assistant integrated in a smart home system (Homey Pro). Be concise.';

      const parsedTokens = parseInt(max_tokens, 10);
      const resolvedMaxTokens = Number.isFinite(parsedTokens)
        ? Math.min(Math.max(parsedTokens, 1), 4096)
        : 200;

      const imageStream = await droptoken.getStream();
      const chunks = [];
      for await (const chunk of imageStream) {
        chunks.push(chunk);
      }
      const imageBuffer = Buffer.concat(chunks);
      const base64Image = imageBuffer.toString('base64');
      const dataUrl = `data:image/jpeg;base64,${base64Image}`;

      const body = {
        model: resolvedModel,
        messages: [
          { role: 'system', content: resolvedSystemPrompt },
          { 
            role: 'user', 
            content: [
              { type: 'text', text: prompt.trim() },
              { type: 'image_url', image_url: dataUrl }
            ] 
          }
        ],
        max_tokens: resolvedMaxTokens,
        temperature: 0.7
      };

      const responseData = await this.fetchMistral(body);
      const responseText = responseData?.choices?.[0]?.message?.content?.trim();

      if (!responseText) {
        throw new Error('Mistral AI returned an empty or unexpected response.');
      }

      this.log(`Mistral Vision responded: ${responseText.substring(0, 80)}...`);

      const respondedTrigger = this.homey.flow.getTriggerCard('mistral_vision_responded');
      await respondedTrigger.trigger({ response: responseText, prompt: prompt.trim() }).catch(this.error);

      return { response: responseText };
    });

    // --- Flow Action: Ask Mistral Agent ---
    const askMistralAgentAction = this.homey.flow.getActionCard('ask_mistral_agent');
    
    askMistralAgentAction.registerRunListener(async (args) => {
      const { prompt, agent_id, max_tokens, conversation_id } = args;

      if (!prompt || !prompt.trim()) {
        throw new Error('Prompt cannot be empty.');
      }
      if (!agent_id || !agent_id.trim()) {
        throw new Error('Agent ID cannot be empty.');
      }

      const parsedTokens = parseInt(max_tokens, 10);
      const resolvedMaxTokens = Number.isFinite(parsedTokens)
        ? Math.min(Math.max(parsedTokens, 1), 4096)
        : 800;

      const convId = conversation_id && conversation_id.trim() ? conversation_id.trim() : null;
      const history = convId ? (this.conversations[convId] || []) : [];

      const body = {
        agent_id: agent_id.trim(),
        messages: [
          ...history,
          { role: 'user', content: prompt.trim() }
        ],
        max_tokens: resolvedMaxTokens
      };

      const responseData = await this.fetchMistralAgent(body);
      const responseText = responseData?.choices?.[0]?.message?.content?.trim();

      if (!responseText) {
        throw new Error('Mistral AI returned an empty or unexpected response.');
      }

      if (convId) {
        if (!this.conversations[convId]) this.conversations[convId] = [];
        this.conversations[convId].push({ role: 'user', content: prompt.trim() });
        this.conversations[convId].push({ role: 'assistant', content: responseText });
        if (this.conversations[convId].length > 20) {
          this.conversations[convId] = this.conversations[convId].slice(-20);
        }
      }

      this.log(`Mistral Agent responded: ${responseText.substring(0, 80)}...`);

      const respondedTrigger = this.homey.flow.getTriggerCard('mistral_agent_responded');
      await respondedTrigger.trigger({ response: responseText, prompt: prompt.trim() }).catch(this.error);

      return { response: responseText };
    });

    // --- Flow Action: Control Devices with Prompt ---
    const controlDevicesAction = this.homey.flow.getActionCard('control_devices_prompt');

    controlDevicesAction.registerArgumentAutocompleteListener('model', async (query) => {
      if (!query) return DEFAULT_MODELS;

      const filtered = DEFAULT_MODELS.filter(m =>
        m.name.toLowerCase().includes(query.toLowerCase()) ||
        m.id.toLowerCase().includes(query.toLowerCase())
      );

      const isExactMatch = DEFAULT_MODELS.some(m =>
        m.id.toLowerCase() === query.toLowerCase() ||
        m.name.toLowerCase() === query.toLowerCase()
      );

      if (!isExactMatch) {
        filtered.push({
          name: `Custom: ${query}`,
          description: `Use custom model: ${query}`,
          id: query
        });
      }

      return filtered;
    });

    controlDevicesAction.registerRunListener(async (args) => {
      const { prompt, model, max_tokens, conversation_id } = args;

      if (!prompt || !prompt.trim()) {
        throw new Error('Prompt cannot be empty.');
      }

      let resolvedModel = 'mistral-small-latest';
      if (typeof model === 'object' && model !== null && model.id) {
        resolvedModel = model.id;
      } else if (typeof model === 'object' && model !== null && model.name) {
        resolvedModel = model.name;
      } else if (typeof model === 'string' && model.trim()) {
        resolvedModel = model.trim();
      }

      const parsedTokens = parseInt(max_tokens, 10);
      const resolvedMaxTokens = Number.isFinite(parsedTokens)
        ? Math.min(Math.max(parsedTokens, 1), 2048)
        : 400;

      // Fetch devices and zones
      let allDevices = {};
      let allZones = {};
      if (this.homeyApi && this.homeyApi.devices) {
        allDevices = await this.homeyApi.devices.getDevices();
        allZones = await this.homeyApi.zones.getZones();
      } else {
        throw new Error('Homey Web API is not initialized. Check if homey:manager:api permission is granted.');
      }

      // Load device permissions from settings
      let permissionsMap = {};
      try {
        const raw = this.homey.settings.get('device_permissions');
        if (raw) permissionsMap = JSON.parse(raw);
      } catch (e) {
        this.error('[control_devices_prompt] Failed to parse device_permissions setting, using defaults.');
      }

      // Filter to exposed devices only
      const exposedDevices = Object.values(allDevices).filter(d => {
        return getDevicePermission(d.id, permissionsMap).expose;
      });

      // Build compact device lines with IDs and capability type hints
      const deviceLines = exposedDevices.map(device => {
        const zone = allZones[device.zone];
        const zoneName = zone ? zone.name : '?';
        const capsObj = device.capabilitiesObj || {};
        const capEntries = Object.entries(capsObj).map(([key, obj]) => {
          const val = obj.value;
          const hint = getCapHint(key);
          const hintStr = hint ? `[${hint}]` : '';
          if (val === null || val === undefined) return `${key}${hintStr}`;
          return `${key}${hintStr}=${val}`;
        });
        return `- id:${device.id} | ${device.name} [${zoneName}]: ${capEntries.join(', ')}`;
      });
      const deviceContext = deviceLines.length > 0
        ? `Devices:\n${deviceLines.join('\n')}`
        : 'No devices available.';

      // Discover registered custom action titles from flows
      await this._discoverCustomActionTitles();
      const discoveredActions = this._discoveredActions || [];
      const currentTime = new Date().toISOString();

      let customActionsSection = '';
      if (discoveredActions.length > 0) {
        const actionLines = discoveredActions.map(a =>
          a.description ? `  - "${a.title}": ${a.description}` : `  - "${a.title}"`
        ).join('\n');
        customActionsSection = `\nCUSTOM ACTIONS:\n- The following custom Homey flow actions are available:\n${actionLines}\n- To trigger one, add "customActionTriggers": ["<exact title>"] to your JSON.\n- Match user requests to action names/descriptions when relevant.`;
      }

      const systemPrompt = `You are a Homey smart home controller. You receive a device list with IDs, zones, current states and capability types, then a user command.
Current time: ${currentTime}
Reply ONLY with valid JSON (no markdown, no explanation outside JSON):
{"actions":[...],"scheduledActions":[{"delayMinutes":<1-1920>,"actions":[...],"description":"<desc>"}],"customActionTriggers":["<title>"],"explanation":"<short summary in user language>"}
Rules:
- MUST RETURN VALID JSON. Replace any newlines in your explanation with \\\\n. Do NOT use actual line breaks inside string values.
- Prefer matching by deviceId (exact). Fall back to exact name, then partial name match.
- Use only listed capabilities. Do NOT set capabilities marked [ro] (read-only).
- Capability hints: bool=true/false, 0.0-1.0=float, num(°C)=number, cmd=true to trigger.
- onoff: true/false. dim: 0.0-1.0. target_temperature: number. volume_set: 0.0-1.0.
- Zones help identify devices by location (e.g. "living room light" → zone "Living Room").
- If nothing matches or no action needed, return empty actions array and explain.
- Only include scheduledActions or customActionTriggers when needed; omit otherwise.
SCHEDULING:
- You can schedule device actions for later (max 32 hours = 1920 minutes from now).
- If the user says "in X minutes/hours" or "at HH:MM", use scheduledActions.
- delayMinutes: integer 1-1920. Convert time to minutes from now.
- Scheduled and immediate actions can coexist in the same response.${customActionsSection}

${deviceContext}`;

      const convId = conversation_id && conversation_id.trim() ? conversation_id.trim() : null;

      const history = convId ? (this.conversations[convId] || []) : [];

      const body = {
        model: resolvedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: prompt.trim() }
        ],
        max_tokens: resolvedMaxTokens,
        temperature: 0.1,
        response_format: { type: "json_object" }
      };

      const responseData = await this.fetchMistral(body);
      const rawText = responseData?.choices?.[0]?.message?.content?.trim();

      if (!rawText) {
        throw new Error('Mistral AI returned an empty or unexpected response.');
      }

      // Strip markdown code fences if present
      const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

      let parsed;
      try {
        parsed = JSON.parse(jsonText);
      } catch (e) {
        this.error(`[control_devices_prompt] Failed to parse JSON: ${rawText}`);
        throw new Error(`Mistral AI did not return valid JSON. Response: ${rawText.substring(0, 120)}`);
      }

      const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
      const explanation = typeof parsed.explanation === 'string' ? parsed.explanation : '';

      if (convId) {
        if (!this.conversations[convId]) this.conversations[convId] = [];
        this.conversations[convId].push({ role: 'user', content: prompt.trim() });
        this.conversations[convId].push({ role: 'assistant', content: rawText });
        if (this.conversations[convId].length > 20) {
          this.conversations[convId] = this.conversations[convId].slice(-20);
        }
      }

      // Build lookup maps for fast matching
      const deviceById = Object.fromEntries(exposedDevices.map(d => [d.id, d]));
      const deviceByName = {};
      for (const d of exposedDevices) {
        deviceByName[d.name.toLowerCase()] = d;
      }

      let devicesControlled = 0;
      let failedActions = 0;
      const executedActions = [];

      for (const action of actions) {
        const targetId   = (action.deviceId || '').trim();
        const targetName = (action.device   || '').toLowerCase().trim();
        const capability = action.capability;
        const value      = action.value;

        // Match by deviceId first, then exact name, then partial name
        let matchedDevice = deviceById[targetId] || null;
        if (!matchedDevice && targetName) {
          matchedDevice = deviceByName[targetName] || null;
          if (!matchedDevice) {
            matchedDevice = exposedDevices.find(d => {
              const n = d.name.toLowerCase();
              return n.includes(targetName) || targetName.includes(n);
            }) || null;
          }
        }

        if (!matchedDevice) {
          this.log(`[control_devices_prompt] No device matched for id="${targetId}" name="${action.device}"`);
          failedActions++;
          continue;
        }

        // Check control permission
        if (!getDevicePermission(matchedDevice.id, permissionsMap).control) {
          this.log(`[control_devices_prompt] Device "${matchedDevice.name}" is not permitted for control.`);
          failedActions++;
          continue;
        }

        if (!matchedDevice.capabilitiesObj || !matchedDevice.capabilitiesObj[capability]) {
          this.log(`[control_devices_prompt] Device "${matchedDevice.name}" has no capability: ${capability}`);
          failedActions++;
          continue;
        }

        try {
          await this.homeyApi.devices.setCapabilityValue({ deviceId: matchedDevice.id, capabilityId: capability, value: value });
          this.log(`[control_devices_prompt] Set "${matchedDevice.name}" ${capability} = ${value}`);
          devicesControlled++;
          executedActions.push({
            deviceId:   matchedDevice.id,
            device:     matchedDevice.name,
            capability: capability,
            value:      value
          });
        } catch (err) {
          this.error(`[control_devices_prompt] Failed to set "${matchedDevice.name}" ${capability}: ${err.message}`);
          failedActions++;
        }
      }

      this.log(`[control_devices_prompt] Controlled ${devicesControlled}, failed ${failedActions}. Explanation: ${explanation}`);

      // --- Handle scheduled actions ---
      const scheduledActions = Array.isArray(parsed.scheduledActions) ? parsed.scheduledActions : [];
      for (const sched of scheduledActions) {
        const delayMin = parseInt(sched.delayMinutes, 10);
        if (!Number.isFinite(delayMin) || delayMin < 1 || delayMin > 1920) {
          this.log('[control_devices_prompt] Invalid delayMinutes, skipping:', sched.delayMinutes);
          continue;
        }
        const schedActions = Array.isArray(sched.actions) ? sched.actions : [];
        const description = sched.description || '';
        this._createScheduledTask(delayMin, schedActions, description, exposedDevices, permissionsMap);
      }

      // --- Handle custom action triggers ---
      const customActionTriggers = Array.isArray(parsed.customActionTriggers) ? parsed.customActionTriggers : [];
      for (const title of customActionTriggers) {
        this.log(`[control_devices_prompt] Triggering custom action: "${title}"`);
        this._customActionTriggerCard.trigger({ action_title: title }, { action_title: title })
          .catch(err => this.error('[control_devices_prompt] Custom action trigger failed:', err.message));
      }

      return {
        explanation,
        devices_controlled: devicesControlled,
        changes_json:       JSON.stringify(executedActions),
        failed_actions:     failedActions
      };
    });

    // --- Flow Action: Reset Conversation ---
    const resetConversationAction = this.homey.flow.getActionCard('reset_conversation');
    resetConversationAction.registerRunListener(async (args) => {
      const convId = args.conversation_id && args.conversation_id.trim() ? args.conversation_id.trim() : null;
      if (convId) {
        delete this.conversations[convId];
        this.log(`[reset_conversation] Cleared conversation: "${convId}"`);
      }
    });

    // --- Flow Trigger: Custom Action Triggered ---
    // action_title is now type:text — no autocomplete listener needed.
    this._customActionTriggerCard = this.homey.flow.getTriggerCard('custom_action_triggered');
    this._customActionTriggerCard.registerRunListener(async (args, state) => {
      return args.action_title && state.action_title &&
        args.action_title.trim().toLowerCase() === state.action_title.trim().toLowerCase();
    });

    this.log('Flow cards registered');
  }

  // ---------------------------------------------------------------------------
  // Custom Action Discovery (Option B: read from flows via getArgumentValues)
  // ---------------------------------------------------------------------------
  async _discoverCustomActionTitles() {
    try {
      if (this._customActionTriggerCard && typeof this._customActionTriggerCard.getArgumentValues === 'function') {
        const argValues = await this._customActionTriggerCard.getArgumentValues();
        // Collect {title, description} pairs; deduplicate by title
        const seen = new Set();
        const actions = [];
        for (const v of argValues) {
          const title = (v && v.action_title && v.action_title.trim()) || '';
          if (!title || seen.has(title.toLowerCase())) continue;
          seen.add(title.toLowerCase());
          const desc = (v && v.description && v.description.trim()) || '';
          actions.push({ title, description: desc });
        }
        this._discoveredActionTitles = actions.map(a => a.title);
        this._discoveredActions = actions; // full objects with description
        this.log('[custom_actions] Discovered actions:', actions);
      }
    } catch (err) {
      this.log('[custom_actions] Could not discover action titles:', err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Scheduled Tasks
  // ---------------------------------------------------------------------------
  _persistTasks() {
    const serializable = Object.values(this.scheduledTasks).map(t => ({
      id: t.id, description: t.description,
      createdAt: t.createdAt, executeAt: t.executeAt,
      actions: t.actions, status: t.status
    }));
    this.homey.settings.set('scheduled_tasks', JSON.stringify(serializable));
  }

  _restoreScheduledTasks() {
    try {
      const raw = this.homey.settings.get('scheduled_tasks');
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved)) return;
      const now = Date.now();
      for (const t of saved) {
        const delayMs = new Date(t.executeAt).getTime() - now;
        if (t.status !== 'pending' || delayMs <= 0) continue;
        this.scheduledTasks[t.id] = { ...t, timer: null };
        this.scheduledTasks[t.id].timer = this.homey.setTimeout(() => {
          this._executeScheduledTask(t.id);
        }, Math.min(delayMs, 115200000));
        this.log(`[scheduler] Restored task "${t.description}" in ${Math.round(delayMs / 60000)} min`);
      }
    } catch (err) {
      this.error('[scheduler] Failed to restore tasks:', err.message);
    }
  }

  _createScheduledTask(delayMinutes, actions, description, exposedDevices, permissionsMap) {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();
    const executeAt = new Date(now + delayMinutes * 60000).toISOString();
    const task = {
      id, description, actions, status: 'pending',
      createdAt: new Date(now).toISOString(), executeAt,
      exposedDeviceIds: exposedDevices.map(d => d.id),
      permissionsMap
    };
    task.timer = this.homey.setTimeout(() => {
      this._executeScheduledTask(id);
    }, Math.min(delayMinutes * 60000, 115200000));
    this.scheduledTasks[id] = task;
    this._persistTasks();
    this.log(`[scheduler] Created task "${description}" (${delayMinutes} min, id=${id})`);
    return id;
  }

  async _executeScheduledTask(taskId) {
    const task = this.scheduledTasks[taskId];
    if (!task || task.status !== 'pending') return;
    task.status = 'running';
    this.log(`[scheduler] Executing task "${task.description}" (id=${taskId})`);
    try {
      let allDevices = {};
      if (this.homeyApi && this.homeyApi.devices) {
        allDevices = await this.homeyApi.devices.getDevices();
      }
      const deviceById = Object.fromEntries(Object.values(allDevices).map(d => [d.id, d]));
      const deviceByName = {};
      for (const d of Object.values(allDevices)) deviceByName[d.name.toLowerCase()] = d;

      for (const action of task.actions) {
        const targetId   = (action.deviceId || '').trim();
        const targetName = (action.device   || '').toLowerCase().trim();
        const capability = action.capability;
        const value      = action.value;
        let dev = deviceById[targetId] || deviceByName[targetName] || null;
        if (!dev && targetName) {
          dev = Object.values(allDevices).find(d => {
            const n = d.name.toLowerCase();
            return n.includes(targetName) || targetName.includes(n);
          }) || null;
        }
        if (!dev) { this.log(`[scheduler] No device for "${targetId || targetName}"`); continue; }
        if (!getDevicePermission(dev.id, task.permissionsMap).control) { continue; }
        await this.homeyApi.devices.setCapabilityValue({ deviceId: dev.id, capabilityId: capability, value }).catch(err => {
          this.error(`[scheduler] Failed ${dev.name} ${capability}:`, err.message);
        });
        this.log(`[scheduler] Set "${dev.name}" ${capability} = ${value}`);
      }
      task.status = 'done';
    } catch (err) {
      task.status = 'failed';
      this.error('[scheduler] Task execution error:', err.message);
    } finally {
      this._persistTasks();
    }
  }

  getScheduledTasks() {
    return Object.values(this.scheduledTasks).map(t => ({
      id: t.id, description: t.description,
      createdAt: t.createdAt, executeAt: t.executeAt,
      status: t.status
    }));
  }

  cancelScheduledTask(taskId) {
    const task = this.scheduledTasks[taskId];
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (task.timer) this.homey.clearTimeout(task.timer);
    delete this.scheduledTasks[taskId];
    this._persistTasks();
    this.log(`[scheduler] Cancelled task ${taskId}`);
  }

  async fetchMistral(body) {
    const apiKey = this.homey.settings.get('api_key');
    if (!apiKey || !apiKey.trim()) {
      throw new Error('API Key is not set. Go to Mistral AI App Settings to enter your key.');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response;
    try {
      response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Mistral AI request timed out after 30 seconds.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Mistral AI API Error (${response.status}): ${errorData.message || response.statusText}`);
    }

    return response.json();
  }

  async fetchMistralAgent(body) {
    const apiKey = this.homey.settings.get('api_key');
    if (!apiKey || !apiKey.trim()) {
      throw new Error('API Key is not set. Go to Mistral AI App Settings to enter your key.');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response;
    try {
      response = await fetch('https://api.mistral.ai/v1/agents/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Mistral AI request timed out after 30 seconds.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Mistral AI API Error (${response.status}): ${errorData.message || response.statusText}`);
    }

    return response.json();
  }
}

module.exports = MistralApp;
