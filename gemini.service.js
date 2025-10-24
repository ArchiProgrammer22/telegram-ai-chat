class GeminiService {
    constructor(apiKey, model = 'gemini-2.5-flash-preview-09-2025') {
        if (!apiKey) {
            console.warn('Warning: GEMINI_API_KEY is not set. Service will be in placeholder mode.');
        }
        this.apiKey = apiKey;
        this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
        this.maxRetries = 3;
    }

    async generateContent(prompt, history = [], base64Image = null, mimeType = null) {
        if (!this.apiKey) {
            return `(API Key Missing) Запрос: "${prompt}". Установите GEMINI_API_KEY для работы.`;
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
                parts: [{ text: "You are a friendly, helpful, and concise Telegram chatbot. Respond conversationally to the user's questions." }]
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
                    return text; // Успех!
                } else {
                    console.error("Invalid Gemini response structure:", JSON.stringify(result, null, 2));
                    return "Я не смог сгенерировать четкий ответ, попробуйте спросить иначе.";
                }

            } catch (error) {
                lastError = error;
                const delay = Math.pow(2, attempts + 1) * 1000;
                console.warn(`Attempt ${attempts + 1} failed: ${error.message}. Retrying in ${delay}ms...`);
                
                if (attempts < this.maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        console.error("Gemini API call failed after max retries.", lastError);
        return `🤖 (Error) AI-сервис сейчас недоступен. Попробуйте позже.`;
    }
}

module.exports = { GeminiService };