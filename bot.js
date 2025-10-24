const { Telegraf } = require('telegraf');

class TelegramBot {
    constructor(token, geminiService, chatService) {
        this.bot = new Telegraf(token);
        this.geminiService = geminiService;
        this.chatService = chatService;

        this._registerHandlers();
    }

    _registerHandlers() {
        this.bot.start(this.handleStart);
        this.bot.command('clear', this.handleClear);
        this.bot.on('text', this.handleText);
        this.bot.on('photo', this.handlePhoto);
        this.bot.on('sticker', this.handleSticker);
        this.bot.catch(this.handleError);
    }

    handleStart = (ctx) => {
        ctx.reply(
            `Привет, ${ctx.from.first_name}! Я бот с Gemini AI.
Я могу отвечать на вопросы, анализировать фото и помнить наш разговор.
Используй /clear, чтобы очистить историю чата.`
        );
        this.chatService.clearHistory(ctx.chat.id);
    };

    handleClear = (ctx) => {
        const chatId = ctx.chat.id;
        if (this.chatService.clearHistory(chatId)) {
            ctx.reply('🧹 История чата очищена. Начнем сначала!');
        } else {
            ctx.reply('История чата уже пуста.');
        }
    };

    handleText = async (ctx) => {
        const chatId = ctx.chat.id;
        const userMessage = ctx.message.text;

        try {
            await ctx.sendChatAction('typing');

            const history = this.chatService.getHistory(chatId);

            const aiResponse = await this.geminiService.generateContent(userMessage, history);

            this.chatService.addMessage(chatId, "user", [{ text: userMessage }]);
            this.chatService.addMessage(chatId, "model", [{ text: aiResponse }]);

            await ctx.reply(aiResponse);

        } catch (err) {
            console.error(`Error processing text message for chat ${chatId}:`, err);
            ctx.reply('❌ Ой, произошла ошибка. Попробуйте еще раз.');
        }
    };
    
    handlePhoto = async (ctx) => {
        const chatId = ctx.chat.id;
        const caption = ctx.message.caption || "Опиши это изображение";
        const photo = ctx.message.photo.pop();
        const fileId = photo.file_id;

        try {
            await ctx.sendChatAction('upload_photo');
            
            const history = this.chatService.getHistory(chatId);

            const fileLink = await ctx.telegram.getFileLink(fileId);
            const imageResponse = await fetch(fileLink.href);
            if (!imageResponse.ok) throw new Error('Не удалось скачать изображение с Telegram');
            
            const arrayBuffer = await imageResponse.arrayBuffer();
            const base64Image = Buffer.from(arrayBuffer).toString('base64');
            const mimeType = "image/jpeg";

            const aiResponse = await this.geminiService.generateContent(caption, history, base64Image, mimeType);

            const userParts = [
                { text: caption },
                { inlineData: { mimeType: mimeType, data: base64Image } }
            ];
            this.chatService.addMessage(chatId, "user", userParts);
            this.chatService.addMessage(chatId, "model", [{ text: aiResponse }]);

            await ctx.reply(aiResponse);

        } catch (err) {
            console.error(`Error processing photo message for chat ${chatId}:`, err);
            ctx.reply('❌ Ой, не удалось обработать ваше изображение.');
        }
    };

    handleSticker = (ctx) => {
        ctx.reply('👍 Классный стикер!');
    };

    handleError = (err, ctx) => {
        console.error(`Unhandled error for ${ctx.updateType}:`, err);
        ctx.reply('Ой! Я столкнулся с необработанной ошибкой.');
    };

    getWebhookCallback(path) {
        return this.bot.webhookCallback(path);
    }

    async setWebhook(url) {
        try {
            await this.bot.telegram.setWebhook(url);
            console.log(`Webhook set successfully to: ${url}`);
        } catch (error) {
            console.error('Failed to set webhook with Telegram:', error.message);
        }
    }
}

module.exports = { TelegramBot };