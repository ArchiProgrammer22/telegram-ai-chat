class GeminiService {
    constructor(apiKey, model = 'gemini-1.5-flash-latest') { // Примітка: Оновив модель до рекомендованої 'latest'
        if (!apiKey) {
            console.warn('Warning: GEMINI_API_KEY is not set. Service will be in placeholder mode.'); // Попередження: GEMINI_API_KEY не встановлено. Сервіс буде в режимі-заглушці.
        }
        this.apiKey = apiKey;
        this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
        this.maxRetries = 3;
    }

    async generateContent(prompt, history = [], base64Image = null, mimeType = null) {
        if (!this.apiKey) {
            return `(API Key Missing) Запит: "${prompt}". Встановіть GEMINI_API_KEY для роботи.`; // (Відсутній API Key) Запит: "${prompt}". Встановіть GEMINI_API_KEY для роботи.
        }

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
                parts: [{ text: "You are a friendly, helpful, and concise Telegram chatbot. Respond conversationally to the user's questions." }] // Ти — дружній, корисний і лаконічний Telegram-чатбот. Відповідай на запитання користувача у розмовному стилі.
            },
        };

        let lastError = null;

        for (let attempts = 0; attempts < this.maxRetries; attempts++) {
            try {
                const response = await fetch(this.apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.status === 429) {
                    throw new Error('Rate limit exceeded'); // Перевищено ліміт запитів
                }

                if (!response.ok) {
                    throw new Error(`API returned status ${response.status}`); // API повернув статус ${response.status}
                }

                const result = await response.json();
                const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

                if (!text && result.candidates?.[0]?.finishReason === 'SAFETY') {
                     console.warn("Gemini response blocked for safety reasons."); // Відповідь Gemini заблоковано з міркувань безпеки.
                     return "Я не можу відповісти на це, оскільки запит порушує правила безпеки. 🤷";
                }

                if (text) {
                    return text; // Успіх!
                } else {
                    console.error("Invalid Gemini response structure:", JSON.stringify(result, null, 2)); // Невірна структура відповіді Gemini:
                    return "Я не зміг згенерувати чітку відповідь, спробуйте запитати інакше.";
                }

            } catch (error) {
                lastError = error;
                const delay = Math.pow(2, attempts + 1) * 1000;
                console.warn(`Attempt ${attempts + 1} failed: ${error.message}. Retrying in ${delay}ms...`); // Спроба ${attempts + 1} не вдалася: ${error.message}. Повтор через ${delay}мс...

                if (attempts < this.maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        console.error("Gemini API call failed after max retries.", lastError); // Виклик Gemini API не вдався після максимальної кількості спроб.
        return `🤖 (Error) AI-сервіс зараз недоступний. Спробуйте пізніше.`; // 🤖 (Помилка) AI-сервіс зараз недоступний. Спробуйте пізніше.
    }
}

module.exports = { GeminiService };