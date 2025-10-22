const { Telegraf } = require('telegraf');
const express = require('express');

const token = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ""; 

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

const bot = new Telegraf(token);
const app = express();

app.use(express.json());

const generateGeminiResponse = async (prompt) => {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
    
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
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
                throw new Error('Rate limit exceeded');
            }

            if (!response.ok) {
                throw new Error(`API returned status ${response.status}`);
            }

            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

            if (text) {
                return text;
            } else {
                return "I couldn't generate a clear response for that, please try asking differently.";
            }

        } catch (error) {
            lastError = error;
            attempts++;
            const delay = Math.pow(2, attempts) * 1000;
            
            if (attempts < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error(`Max retries reached. Last error: ${lastError.message}`);
                break;
            }
        }
    }
    
    console.error("Gemini API call failed.", lastError);
    return `🤖 (Error/Placeholder) The AI service is currently unavailable or the API key is missing. Please try again later.`;
};

bot.start((ctx) => {
    ctx.reply(
        `Hello, ${ctx.from.first_name}! I am an AI-powered Telegram bot.
Ask me anything, and I'll use the Gemini model to respond. (Running on Webhook)`
    );
});

bot.on('text', async (ctx) => {
    const userMessage = ctx.message.text;
    const chatId = ctx.chat.id;

    try {
        await ctx.sendChatAction('typing');

        let aiResponse;
        if (GEMINI_API_KEY === "") {
            aiResponse = `(API Key Missing) You asked: "${userMessage}". To use the Gemini AI, please set the GEMINI_API_KEY environment variable.`;
        } else {
            aiResponse = await generateGeminiResponse(userMessage);
        }
        
        await ctx.reply(aiResponse);

    } catch (err) {
        console.error(`Error processing text message for chat ${chatId}:`, err);
        ctx.reply('❌ Sorry, I hit a snag while processing your request. Please try again.');
    }
});

bot.on('sticker', (ctx) => {
    ctx.reply('👍 Nice sticker!');
});

bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err);
    ctx.reply('Oops! I ran into an unhandled error.');
});

app.get('/', (req, res) => {
    res.status(200).send('Telegram Bot Webhook with Gemini AI is running!');
});

const WEBHOOK_PATH = '/bot-updates';

app.use(bot.webhookCallback(WEBHOOK_PATH));

const setTelegramWebhook = async () => {
    if (WEBHOOK_URL) {
        try {
            const fullWebhookUrl = `${WEBHOOK_URL}${WEBHOOK_PATH}`;
            await bot.telegram.setWebhook(fullWebhookUrl);
            console.log(`Webhook set successfully to: ${fullWebhookUrl}`);
        } catch (error) {
            console.error('Failed to set webhook with Telegram:', error.message);
        }
    }
};

app.listen(PORT, async () => {
    console.log(`Express server running on port ${PORT}`);
    await setTelegramWebhook();
    console.log('Bot is now listening for webhook updates!');
});
