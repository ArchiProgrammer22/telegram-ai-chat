const { Telegraf } = require('telegraf');
const express = require('express')

const token = process.env.API_TOKEN;

const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL;

if(!token)
{
    console.error('Error: BOT TOKEN is not set in env. variables');
}

if(!WEBHOOK_URL)
{
    console.error('Error: RENDER_EXTERNAL_URL is not set.');
}

const bot = new Telegraf(token);
const app = express();

app.use(express.json());

bot.start((ctx) => {
    ctx.reply('Hello. This is my first message!');
});

bot.on('text', (ctx) => {
    const userMessage = ctx.message.text;
    ctx.reply('Echo!');
});

bot.catch((err, ctx) => {
    console.error('Error!', err);
    ctx.reply('Oops, I ran into error!');
});

app.get('/', (req, res) => {
    res.status(200).send('Telegram webhook is running!');
});

const WEBHOOK_PATH = '/bot-updates';

app.use(bot.webhookCallback(WEBHOOK_PATH));

const setTelegramWebhook = async () => {
    if(WEBHOOK_URL)
    {
        try {
            const fullWebhookUrl = `${WEBHOOK_URL}${WEBHOOK_PATH}`;
            await bot.telegram.setWebhook(fullWebhookUrl);
            console.log(`Webhook set succesfully to ${fullWebhookUrl}`);
        } catch(error) {
            console.error('Failed to set webhook', error.message);
        }
    }
};

app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await setTelegramWebhook();
    console.log('Bot is listening now!');
});