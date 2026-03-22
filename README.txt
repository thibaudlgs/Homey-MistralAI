Mistral AI for Homey Pro

Harness the power of Mistral's state-of-the-art Large Language Models (LLMs) directly in your Homey Pro. This app provides a seamless integration that allows you to use AI for smart home automation, reasoning, and personalized notifications via simple Flow cards.

--- 💡 FEATURES ---

● Ask Mistral (Flow Action)
Send any prompt to Mistral AI and receive a text response as a Flow Token. You can use this token in any subsequent 'Then' card (e.g., to send a push notification or set a variable).

● Mistral AI Responded (Flow Trigger)
Trigger a flow whenever a responses is received. This card provides both the 'Prompt' and the 'Response' as tokens, perfect for logging or chain reactions.

● Customization
Fine-tune each request directly in the Flow card:
- Model Selection: Choose between Mistral Large, Medium, Small, Mixtral, and more.
- System Prompt: Define the AI's persona and context for the request.
- Max Tokens: Control the length of the responses.

--- 🛠️ SETUP ---

1. Get your API Key: Signup at https://console.mistral.ai/ and generate a key.
2. Configure App: In the Homey app, go to More > Settings > Mistral AI and paste your API Key.
3. Use in Flows: Find the 'Ask Mistral' card in the 'Then' column under the Mistral AI app section.

--- 📝 NOTES ---

- Model performance and response times depend on the selected Mistral model.
- Requires an active internet connection on your Homey Pro.
- Make sure to keep your API key secure; it is stored locally on your Homey Pro.
