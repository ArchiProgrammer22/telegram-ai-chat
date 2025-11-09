const { ChatService } = require('./chat.service');

describe('ChatService', () => {
    let chatService;

    beforeEach(() => {
        chatService = new ChatService(4);
    });

    it('повинен створювати історію, якщо вона не існує', () => {
        const history = chatService.getHistory(123);
        expect(history).toEqual([]);
        expect(chatService.historyStore.has(123)).toBe(true);
    });

    it('повинен додавати повідомлення до історії', () => {
        chatService.addMessage(123, 'user', [{ text: 'a' }]);
        const history = chatService.getHistory(123);
        expect(history).toHaveLength(1);
        expect(history[0]).toEqual({ role: 'user', parts: [{ text: 'a' }] });
    });

    it('повинен видаляти історію', () => {
        chatService.addMessage(123, 'user', [{ text: 'a' }]);
        expect(chatService.historyStore.has(123)).toBe(true);
        
        const result = chatService.clearHistory(123);
        expect(result).toBe(true);
        expect(chatService.historyStore.has(123)).toBe(false);
    });

    it('повинен дотримуватись "ковзного вікна" (maxHistoryLength)', () => {
        chatService.addMessage(123, 'user', [{ text: 'msg1' }]);
        chatService.addMessage(123, 'model', [{ text: 'msg2' }]);
        chatService.addMessage(123, 'user', [{ text: 'msg3' }]);
        chatService.addMessage(123, 'model', [{ text: 'msg4' }]);
        chatService.addMessage(123, 'user', [{ text: 'msg5' }]);

        const history = chatService.getHistory(123);
        
        expect(history).toHaveLength(4);
        
        expect(history[0].parts[0].text).toBe('msg2'); 
        expect(history[3].parts[0].text).toBe('msg5');
    });
});