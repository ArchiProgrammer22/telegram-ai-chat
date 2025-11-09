const { TelegramBot } = require('./bot');
const { Telegraf } = require('telegraf');

jest.mock('telegraf');
const mockGeminiService = {
    generateContent: jest.fn()
};
const mockChatService = {
    getHistory: jest.fn(),
    addMessage: jest.fn(),
    clearHistory: jest.fn()
};

const createMockCtx = (message) => ({
    chat: { id: 123 },
    from: { first_name: 'TestUser' },
    message: message,
    reply: jest.fn(),
    sendChatAction: jest.fn(),
});

describe('TelegramBot', () => {
    let bot;

    beforeEach(() => {
        Telegraf.mockClear();
        jest.clearAllMocks();

        bot = new TelegramBot('FAKE_TOKEN', mockGeminiService, mockChatService);
    });

    it('повинен коректно обробляти команду /start', () => {
        const mockCtx = createMockCtx({});
        
        bot.handleStart(mockCtx);

        expect(mockCtx.reply).toHaveBeenCalledWith(expect.stringContaining('Привіт, TestUser!'));
        expect(mockChatService.clearHistory).toHaveBeenCalledWith(123);
    });

    it('повинен коректно обробляти handleText', async () => {
        const mockCtx = createMockCtx({ text: 'Hello' });
        const mockHistory = [{ role: 'user', parts: [{ text: 'Old message' }] }];
        
        mockChatService.getHistory.mockReturnValue(mockHistory);
        mockGeminiService.generateContent.mockResolvedValue('AI Response');

        await bot.handleText(mockCtx);

        expect(mockCtx.sendChatAction).toHaveBeenCalledWith('typing');
        
        expect(mockChatService.getHistory).toHaveBeenCalledWith(123);
        expect(mockGeminiService.generateContent).toHaveBeenCalledWith('Hello', mockHistory);
        
        expect(mockChatService.addMessage).toHaveBeenCalledWith(123, 'user', [{ text: 'Hello' }]);
        expect(mockChatService.addMessage).toHaveBeenCalledWith(123, 'model', [{ text: 'AI Response' }]);

        expect(mockCtx.reply).toHaveBeenCalledWith('AI Response');
    });
});