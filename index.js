
const express = require('express');
const { GeminiService } = require('./gemini.service');
const { ChatService } = require('./chat.service');
const { TelegramBot } = require('./bot');

const token = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const WEBHOOK_PATH = '/bot-updates';

if (!token) {
    throw new Error('Error: BOT_TOKEN is not set.');
}

const geminiService = new GeminiService(GEMINI_API_KEY);
const chatService = new ChatService(10); // Храним 10 последних сообщений (5 пар)

const telegramBot = new TelegramBot(token, geminiService, chatService);

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.status(200).send('Telegram Bot Webhook with Gemini AI is running (OOP)!');
});

app.use(telegramBot.getWebhookCallback(WEBHOOK_PATH));

app.listen(PORT, async () => {
    console.log(`Express server running on port ${PORT}`);
    
    if (WEBHOOK_URL) {
        const fullWebhookUrl = `${WEBHOOK_URL}${WEBHOOK_PATH}`;
        await telegramBot.setWebhook(fullWebhookUrl);
    } else {
        console.warn('WEBHOOK_URL not set. Running in local mode (polling) is not configured.');
        console.log('Bot is ready (assuming local development).');
    }
});