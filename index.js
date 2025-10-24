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

const chatHistory = {};

const bot = new Telegraf(token);
const app = express();

app.use(express.json());

const generateGeminiResponse = async (prompt, history = [], base64Image = null, mimeType = null) => {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
    const userParts = [{ text: prompt }];
    if (base64Image && mimeType) {
        userParts.push({
            inlineData: {
                mimeType: mimeType,
                data: base64Image
            }
        });
    }

    const payload = {
        contents: [...history, { role: "user", parts: userParts }],
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
            
            if (!text && result.candidates?.[0]?.finishReason === 'SAFETY') {
                 console.warn("Gemini response blocked for safety reasons.");
                 return "Я не могу ответить на это, так как запрос нарушает правила безопасности. 🤷";
            }
            
            if (text) {
                return text;
            } else {
                console.error("Invalid Gemini response structure:", JSON.stringify(result, null, 2));
                return "Я не смог сгенерировать четкий ответ, попробуйте спросить иначе.";
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
    return `🤖 (Error/Placeholder) AI-сервис сейчас недоступен или API-ключ отсутствует. Попробуйте позже.`;
};

bot.start((ctx) => {
    ctx.reply(
        `Привет, ${ctx.from.first_name}! Я бот с Gemini AI.
        
Я могу отвечать на твои вопросы, анализировать фото и помнить наш разговор.

Отправь мне текст или фото.
Используй /clear, чтобы очистить историю чата.`
    );
    delete chatHistory[ctx.chat.id];
});

bot.command('clear', (ctx) => {
    const chatId = ctx.chat.id;
    if (chatHistory[chatId] && chatHistory[chatId].length > 0) {
        delete chatHistory[chatId];
        ctx.reply('🧹 История чата очищена. Начнем сначала!');
    } else {
        ctx.reply('История чата уже пуста.');
    }
});

bot.on('text', async (ctx) => {
    const userMessage = ctx.message.text;
    const chatId = ctx.chat.id;

    if (!chatHistory[chatId]) {
        chatHistory[chatId] = [];
    }
    const history = chatHistory[chatId];

    try {
        await ctx.sendChatAction('typing');

        let aiResponse;
        if (GEMINI_API_KEY === "") {
            aiResponse = `(API Key Missing) Вы спросили: "${userMessage}". Чтобы использовать Gemini AI, установите GEMINI_API_KEY.`;
        } else {
            aiResponse = await generateGeminiResponse(userMessage, history, null, null);
        }

        history.push({ role: "user", parts: [{ text: userMessage }] });
        history.push({ role: "model", parts: [{ text: aiResponse }] });
        
        if (history.length > 10) {
            chatHistory[chatId] = history.slice(-10);
        }

        await ctx.reply(aiResponse);

    } catch (err) {
        console.error(`Error processing text message for chat ${chatId}:`, err);
        ctx.reply('❌ Ой, произошла ошибка при обработке вашего запроса. Попробуйте еще раз.');
    }
});

bot.on('photo', async (ctx) => {
    const chatId = ctx.chat.id;
    const caption = ctx.message.caption || "Опиши это изображение";
    
    const photo = ctx.message.photo.pop();
    const fileId = photo.file_id;

    if (!chatHistory[chatId]) {
        chatHistory[chatId] = [];
    }
    const history = chatHistory[chatId];

    try {
        await ctx.sendChatAction('upload_photo'); // 'typing' тоже подойдет

        let aiResponse;
        if (GEMINI_API_KEY === "") {
            aiResponse = `(API Key Missing) Я вижу ваше фото, но не могу его обработать без API ключа.`;
        } else {
            const fileLink = await ctx.telegram.getFileLink(fileId);
            
            const imageResponse = await fetch(fileLink.href);
            if (!imageResponse.ok) throw new Error('Не удалось скачать изображение с Telegram');

            const arrayBuffer = await imageResponse.arrayBuffer();
            const base64Image = Buffer.from(arrayBuffer).toString('base64');
            const mimeType = "image/jpeg";

            aiResponse = await generateGeminiResponse(caption, history, base64Image, mimeType);

            history.push({ 
                role: "user", 
                parts: [
                    { text: caption },
                    { inlineData: { mimeType: mimeType, data: base64Image } }
                ] 
            });
            history.push({ role: "model", parts: [{ text: aiResponse }] });

            if (history.length > 10) {
                chatHistory[chatId] = history.slice(-10);
            }
        }
        
        await ctx.reply(aiResponse);

    } catch (err) {
        console.error(`Error processing photo message for chat ${chatId}:`, err);
        ctx.reply('❌ Ой, не удалось обработать ваше изображение. Попробуйте еще раз.');
    }
});


bot.on('sticker', (ctx) => {
    ctx.reply('👍 Классный стикер!');
});

bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err);
    ctx.reply('Ой! Я столкнулся с необработанной ошибкой.');
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