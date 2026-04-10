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

class MistralApp extends Homey.App {
  async onInit() {
    this.log('Mistral AI App initialized');

    try {
      this.homeyApi = await HomeyAPI.createAppAPI({ homey: this.homey });
      this.log('Homey API instantiated successfully');
    } catch (err) {
      this.error('Failed to instantiate Homey API', err);
    }

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
      const { prompt, model, max_tokens } = args;

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

      const body = {
        model: resolvedModel,
        messages: [
          { role: 'system', content: resolvedSystemPrompt },
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
      const { prompt, agent_id, max_tokens } = args;

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

      const body = {
        agent_id: agent_id.trim(),
        messages: [
          { role: 'user', content: prompt.trim() }
        ],
        max_tokens: resolvedMaxTokens
      };

      const responseData = await this.fetchMistralAgent(body);
      const responseText = responseData?.choices?.[0]?.message?.content?.trim();

      if (!responseText) {
        throw new Error('Mistral AI returned an empty or unexpected response.');
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
      const { prompt, model, max_tokens } = args;

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
        ? Math.min(Math.max(parsedTokens, 1), 1024)
        : 400;

      // Build device context with zones and current states
      let allDevices = {};
      let allZones = {};
      if (this.homeyApi && this.homeyApi.devices) {
        allDevices = await this.homeyApi.devices.getDevices();
        allZones = await this.homeyApi.zones.getZones();
      } else {
        throw new Error('Homey Web API is not initialized. Check if homey:manager:api permission is granted.');
      }

      // Build compact device lines: "- Name [Zone] caps: onoff=true, dim=0.8"
      const deviceLines = Object.values(allDevices).map(device => {
        const zone = allZones[device.zone];
        const zoneName = zone ? zone.name : '?';
        const capsObj = device.capabilitiesObj || {};
        const capEntries = Object.entries(capsObj).map(([key, obj]) => {
          const val = obj.value;
          if (val === null || val === undefined) return key;
          return `${key}=${val}`;
        });
        return `- ${device.name} [${zoneName}]: ${capEntries.join(', ')}`;
      });
      const deviceContext = deviceLines.length > 0
        ? `Devices:\n${deviceLines.join('\n')}`
        : 'No devices found.';

      const systemPrompt = `You are a Homey smart home controller. You receive a device list with zones and current states, then a user command.
Reply ONLY with valid JSON (no markdown):
{"actions":[{"device":"<exact device name>","capability":"<cap>","value":<val>}],"explanation":"<short summary in user language>"}
Rules:
- Use exact device names from the list.
- Use only listed capabilities.
- Zones help identify devices (e.g. "living room light" → device in zone "Living Room").
- onoff: true/false. dim: 0.0-1.0. target_temperature: number. volume_set: 0.0-1.0.
- If no match, return empty actions and explain.

${deviceContext}`;

      const body = {
        model: resolvedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt.trim() }
        ],
        max_tokens: resolvedMaxTokens,
        temperature: 0.1
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
        this.error(`Failed to parse Mistral response as JSON: ${rawText}`);
        throw new Error(`Mistral AI did not return valid JSON. Response: ${rawText.substring(0, 120)}`);
      }

      const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
      const explanation = typeof parsed.explanation === 'string' ? parsed.explanation : '';
      let devicesControlled = 0;
      const executedActions = [];

      for (const action of actions) {
        const targetName = (action.device || '').toLowerCase();
        const capability = action.capability;
        const value = action.value;

        const matchedDevice = Object.values(allDevices).find(d => {
          const name = d.name.toLowerCase();
          return name === targetName || name.includes(targetName) || targetName.includes(name);
        });

        if (!matchedDevice) {
          this.log(`[control_devices_prompt] No device matched for: "${action.device}"`);
          continue;
        }

        if (!matchedDevice.capabilitiesObj || !matchedDevice.capabilitiesObj[capability]) {
          this.log(`[control_devices_prompt] Device "${matchedDevice.name}" has no capability: ${capability}`);
          continue;
        }

        try {
          await this.homeyApi.devices.setCapabilityValue({ deviceId: matchedDevice.id, capabilityId: capability, value: value });
          this.log(`[control_devices_prompt] Set "${matchedDevice.name}" ${capability} = ${value}`);
          devicesControlled++;
          executedActions.push({
            device: matchedDevice.name,
            capability: capability,
            value: value
          });
        } catch (err) {
          this.error(`[control_devices_prompt] Failed to set "${matchedDevice.name}" ${capability}: ${err.message}`);
        }
      }

      this.log(`[control_devices_prompt] Controlled ${devicesControlled} device(s). Explanation: ${explanation}`);

      return { 
        explanation, 
        devices_controlled: devicesControlled, 
        changes_json: JSON.stringify(executedActions) 
      };
    });

    this.log('Flow cards registered');
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
