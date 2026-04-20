Mistral AI for Homey

Harness the power of Mistral AI Large Language Models directly in your Homey flows.

FEATURES

Ask Mistral (Flow Action)
Send any prompt to Mistral AI and receive a text response as a Flow Token. You can use this token in any subsequent 'Then' card (e.g., to send a push notification or set a variable).

Ask Mistral Agent
Communicate directly with your custom Mistral AI Agents by providing their Agent ID.

Ask Mistral (Vision)
Send an image along with a prompt to Mistral's Vision model and get a description or analysis back.

Control Devices with Prompt
Control your smart home using natural language! Send a command to Mistral AI, and it will interpret your request and control your Homey devices accordingly. The model automatically receives the list of your devices and their capabilities to perform the right actions.

Mistral AI Responded (Flow Triggers)
Trigger flows whenever a response is received from any Mistral AI model. These cards provide both the 'Prompt' and the 'Response' as tokens, perfect for logging, TTS, or chain reactions.

Customization
Fine-tune each request:
- Model Selection: Choose between multiple Mistral models directly from the flow cards.
- System Prompt: Define the AI's persona and context for the request in the app settings.
- Max Tokens: Control the length of the responses.
- Conversation IDs: Keep track of ongoing chat contexts across multiple flow actions.

SETUP

1. Get your API Key: Signup at the Mistral AI console and generate an API key.
2. Configure App: In the Homey app, go to More > Settings > Mistral AI and paste your API Key.
3. Use in Flows: Find the Mistral AI cards and use them to power up your smart home.

NOTES

- Mistral provides generous free API rates for experiments.
- Model performance and response times depend on the selected Mistral model.
- Requires an active internet connection on your Homey Pro.
- Your API key is stored securely and locally on your Homey Pro.
