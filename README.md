# Homey-MistralAI
Homey app to use Mistral AI models in Homey flows

> **DISCLAIMER** This app has been mainly vibe coded using Gemini 3.1 and Claude sonnet 4.6, Even though this app has been supervised by a real human it might still be unstable

## 💡 FEATURES

### Ask Mistral (Flow Action)
Send any prompt to Mistral AI and receive a text response as a Flow Token. You can use this token in any subsequent 'Then' card (e.g., to send a push notification or set a variable). It is also possible to select which devices are exposed or controllable by the AI.

### Ask Mistral Agent (Flow Action)
Send a prompt to a custom Mistral AI Agent (created in the Mistral console) using its Agent ID. Supports persistent conversations via a Conversation ID.

### Ask Mistral Agent (Vision) (Flow Action)
Send a prompt together with an image to a custom Mistral AI Agent. Drop an image token onto this card and the agent will analyse it alongside your text prompt. Supports optional conversation IDs for multi-turn sessions.

### Add to Conversation (Flow Action)
Inject a message into an existing conversation history without generating an AI response. Use this to seed context, add system notes, or pre-fill assistant turns before calling Ask Mistral.

### Control Devices with Prompt (Flow Action)
Let the AI interpret a natural-language prompt to control your Homey devices. Select which devices are exposed and optionally define custom actions the AI can trigger.

### Mistral AI Responded / Mistral Agent Responded / Mistral Agent (Vision) Responded (Flow Triggers)
Trigger a flow whenever a response is received. Each card provides both the 'Prompt' and the 'Response' as tokens, perfect for logging or chain reactions.

### A Custom Action Is Triggered (Flow Trigger)
Register named actions (e.g. "Movie mode", "Night alarm") that the AI can recognise and trigger from the "Control devices with prompt" card. The trigger fires with the action title and an AI-generated message as tokens, letting you attach any Homey flow to a voice/text command.

### Customization
Fine-tune each request directly in the Flow card:
- **Model Selection:** Choose between Mistral Large, Medium, Small, Mixtral, and more.
- **System Prompt:** Define the AI's persona and context for the request.
- **Max Tokens:** Control the length of the responses.
- **Conversation ID:** Pass the same ID across cards to maintain a persistent multi-turn conversation.

## 🛠️ SETUP

1. Get your API Key: Signup at https://console.mistral.ai/ and generate a key.
2. Configure App: In the Homey app, go to More > Settings > Mistral AI and paste your API Key.
3. Use in Flows: Find the 'Ask Mistral' card in the 'Then' column under the Mistral AI app section.

## 📝 NOTES

- Mistral provide generous free API rates using experiments
- Model performance and response times depend on the selected Mistral model.
- Requires an active internet connection on your Homey Pro.
- the ask home card may lead to unexpected results, use it at your own ris,k and manage the exposed devices

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.0.1 | 2026-03-22 | Fisrst beta version|
| 0.0.2 | 2026-04-10 | Added device control feature|
| 0.0.3 | 2026-04-11 | Added conversation feature|
| 1.1.0 | 2026-04-19 | Added scheduled tasks, devices selection and flow control card|
| 1.1.1 | 2026-04-23 | Added links to Homey community forum and to source code|
| 1.2.0 | 2026-05-24 | Added Ask Mistral Agent (Vision) card, Add to Conversation card, and Custom Action trigger|
