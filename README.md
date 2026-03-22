# Homey-MistralAI
Homey app to use Mistral AI models in Homey flows

> **DISCLAIMER** This app has been mainly vibe coded using Gemini 3.1 and Claude sonnet 4.6, Even though this app has been supervised by a real human it might still be unstable

## 💡 FEATURES

### Ask Mistral (Flow Action)
Send any prompt to Mistral AI and receive a text response as a Flow Token. You can use this token in any subsequent 'Then' card (e.g., to send a push notification or set a variable).

### Mistral AI Responded (Flow Trigger)
Trigger a flow whenever a responses is received. This card provides both the 'Prompt' and the 'Response' as tokens, perfect for logging or chain reactions.

### Customization
Fine-tune each request directly in the Flow card:
- Model Selection: Choose between Mistral Large, Medium, Small, Mixtral, and more.
- System Prompt: Define the AI's persona and context for the request.
- Max Tokens: Control the length of the responses.

## 🛠️ SETUP

1. Get your API Key: Signup at https://console.mistral.ai/ and generate a key.
2. Configure App: In the Homey app, go to More > Settings > Mistral AI and paste your API Key.
3. Use in Flows: Find the 'Ask Mistral' card in the 'Then' column under the Mistral AI app section.

## 📝 NOTES

- Mistral provide generous free API rates using experiments
- Model performance and response times depend on the selected Mistral model.
- Requires an active internet connection on your Homey Pro.
- Make sure to keep your API key secure; it is stored locally on your Homey Pro.
