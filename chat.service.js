class ChatService {
    constructor(maxHistoryLength = 10) {
        this.historyStore = new Map();
        this.maxHistoryLength = maxHistoryLength;
        console.log("ChatService initialized.");
    }

    getHistory(chatId) {
        if (!this.historyStore.has(chatId)) {
            this.historyStore.set(chatId, []);
        }
        return this.historyStore.get(chatId);
    }

    addMessage(chatId, role, parts) {
        const history = this.getHistory(chatId); // Получаем (или создаем) историю
        
        const messageParts = Array.isArray(parts) ? parts : [parts];
        
        history.push({ role: role, parts: messageParts });

        while (history.length > this.maxHistoryLength) {
            history.shift();
        }
        
        this.historyStore.set(chatId, history);
    }

    clearHistory(chatId) {
        if (this.historyStore.has(chatId)) {
            this.historyStore.delete(chatId);
            return true;
        }
        return false; 
    }
}

module.exports = { ChatService };