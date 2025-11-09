const { GeminiService } = require('./gemini.service');

global.fetch = jest.fn();
jest.useFakeTimers();

describe('GeminiService', () => {
    let geminiService;

    beforeEach(() => {
        geminiService = new GeminiService('FAKE_API_KEY', 'test-model');
        jest.clearAllMocks();
    });

    it('повинен успішно повернути текст', async () => {
        const mockResponse = {
            candidates: [{
                content: { parts: [{ text: 'Test response' }] }
            }]
        };
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => mockResponse,
        });

        const result = await geminiService.generateContent('Hi', []);
        
        expect(result).toBe('Test response');
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('test-model:generateContent?key=FAKE_API_KEY'),
            expect.objectContaining({ method: 'POST' })
        );
    });

    it('повинен коректно обробити блокування SAFETY', async () => {
        const mockResponse = {
            candidates: [{
                finishReason: 'SAFETY'
            }]
        };
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => mockResponse,
        });

        const result = await geminiService.generateContent('Bad prompt', []);
        
        expect(result).toContain('Я не можу відповісти на це');
    });

    it('повинен виконати повторні спроби (retry) при помилці 429', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 429,
        });

        const mockSuccessResponse = {
            candidates: [{ content: { parts: [{ text: 'Success after retry' }] } }]
        };
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockSuccessResponse,
        });

        const promise = geminiService.generateContent('Retry test', []);

        await jest.advanceTimersByTimeAsync(2100);

        const result = await promise;

        expect(result).toBe('Success after retry');
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });
});