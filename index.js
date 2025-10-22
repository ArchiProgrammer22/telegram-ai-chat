// This is a minimal Telegram Bot using Telegraf and Express Webhooks,
// integrated with the Google Gemini API for conversational responses.

const { Telegraf } = require('telegraf');
const express = require('express');

// Get environment variables
const token = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL;
// We assume the GEMINI_API_KEY will be set in the environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ""; 

// --- Setup Checks ---
if (!token) {
    console.error('Error: BOT_TOKEN is not set in environment variables.');
    throw new Error('Bot token missing. Cannot run without a token.');
}

if (!WEBHOOK_URL) {
    console.warn('Warning: RENDER_EXTERNAL_URL is not set. Assuming local development or non-Render environment.');
}

if (!GEMINI_API_KEY) {
    console.warn('Warning: GEMINI_API_KEY is not set. The bot will use a placeholder response for AI queries.');
}

// --- Bot Initialization ---
const bot = new Telegraf(token);
const app = express();

// --- Middleware ---
app.use(express.json());

// --- Gemini API Logic ---

/**
 * Calls the Gemini API to generate a text response.
 * Implements exponential backoff for retries.
 * @param {string} prompt The user's query.
 * @returns {Promise<string>} The generated text response.
 */
const generateGeminiResponse = async (prompt) => {
    // Note: In a real environment, you would use a dedicated SDK or a more robust
    // fetch implementation with full retry logic. This is a simplified example.
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
    
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        // Using Google Search grounding tool for up-to-date and factual responses
        tools: [{ "google_search": {} }],
        systemInstruction: {
            parts: [{ text: "You are a friendly, helpful, and concise Telegram chatbot. Respond conversationally to the user's questions." }]
        },
    };

    let attempts = 0;
    const maxRetries = 3;
    let lastError = null;

    while (attempts < maxRetries) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.status === 429) {
                // Rate limit hit, try again after waiting
                throw new Error('Rate limit exceeded');
            }

            if (!response.ok) {
                throw new Error(`API returned status ${response.status}`);
            }

            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

            if (text) {
                // Return the response text
                return text;
            } else {
                return "I couldn't generate a clear response for that, please try asking differently.";
            }

        } catch (error) {
            lastError = error;
            attempts++;
            const delay = Math.pow(2, attempts) * 1000; // Exponential backoff (2s, 4s, 8s)
            
            if (attempts < maxRetries) {
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                // If max retries reached, exit loop and throw last error
                console.error(`Max retries reached. Last error: ${lastError.message}`);
                break;
            }
        }
    }
    
    // Fallback if API key is missing or all retries fail
    console.error("Gemini API call failed.", lastError);
    return `🤖 (Error/Placeholder) The AI service is currently unavailable or the API key is missing. Please try again later.`;
};


// --- Telegraf Logic ---

// Command Handler: /start
bot.start((ctx) => {
    ctx.reply(
        `Hello, ${ctx.from.first_name}! I am an AI-powered Telegram bot.
Ask me anything, and I'll use the Gemini model to respond. (Running on Webhook)`
    );
});

// Text Handler (AI Chat Logic)
bot.on('text', async (ctx) => {
    const userMessage = ctx.message.text;
    const chatId = ctx.chat.id;

    try {
        // 1. Show 'typing...' status immediately for a better user experience
        await ctx.sendChatAction('typing');

        // 2. Call the AI model
        let aiResponse;
        if (GEMINI_API_KEY === "") {
            // Placeholder response if key is missing
            aiResponse = `(API Key Missing) You asked: "${userMessage}". To use the Gemini AI, please set the GEMINI_API_KEY environment variable.`;
        } else {
            aiResponse = await generateGeminiResponse(userMessage);
        }
        
        // 3. Reply with the AI's response
        await ctx.reply(aiResponse);

    } catch (err) {
        console.error(`Error processing text message for chat ${chatId}:`, err);
        // Inform the user that something went wrong
        ctx.reply('❌ Sorry, I hit a snag while processing your request. Please try again.');
    }
});

// Sticker Handler (Optional flair)
bot.on('sticker', (ctx) => {
    ctx.reply('👍 Nice sticker!');
});

// Error Handling
bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err);
    // Note: reply() is safe here as it will be handled by Telegram itself
    ctx.reply('Oops! I ran into an unhandled error.');
});

// --- Webhook Configuration ---

// 1. Render/Health Check route: Respond to GET requests at the root path.
app.get('/', (req, res) => {
    res.status(200).send('Telegram Bot Webhook with Gemini AI is running!');
});

// 2. Telegraf Webhook Route:
const WEBHOOK_PATH = '/bot-updates';

app.use(bot.webhookCallback(WEBHOOK_PATH));


// --- Bot Launch (Express Server) ---

// Function to set the webhook URL with Telegram.
const setTelegramWebhook = async () => {
    if (WEBHOOK_URL) {
        try {
            const fullWebhookUrl = `${WEBHOOK_URL}${WEBHOOK_PATH}`;
            // Set the webhook with Telegram's API
            await bot.telegram.setWebhook(fullWebhookUrl);
            console.log(`Webhook set successfully to: ${fullWebhookUrl}`);
        } catch (error) {
            console.error('Failed to set webhook with Telegram:', error.message);
        }
    }
};

// Start the Express server
app.listen(PORT, async () => {
    console.log(`Express server running on port ${PORT}`);
    await setTelegramWebhook();
    console.log('Bot is now listening for webhook updates!');
});