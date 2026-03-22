'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');

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
