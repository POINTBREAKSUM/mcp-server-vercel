const express = require('express');
const fetch = require('node-fetch');
const NodeCache = require('node-cache');
const serverless = require('serverless-http');

const translationCache = new NodeCache({ stdTTL: 3600 });
const app = express();
app.use(express.json());

const API_KEY = "your-secret-key-123";

// Middleware for logging and API key check
app.use((req, res, next) => {
    console.log(`Incoming ${req.method} to ${req.path}`);
    res.setHeader('Content-Type', 'application/json');
    if (req.headers['x-api-key'] !== API_KEY) {
        return res.status(401).json({
            error: "Unauthorized",
            received: req.headers['x-api-key'],
            expected: API_KEY
        });
    }
    next();
});

// MCP tools
const tools = {
    "get-chuck-joke": {
        description: "Get a random Chuck Norris joke",
        handler: async () => {
            const response = await fetch("https://api.chucknorris.io/jokes/random");
            const data = await response.json();
            return {
                joke: data.value,
                iconUrl: data.icon_url
            };
        }
    },
    "get-chuck-joke-by-category": {
        description: "Get a random Chuck Norris joke by category",
        handler: async (params) => {
            if (!params?.category) {
                throw new Error("Category parameter is required");
            }
            const response = await fetch(
                `https://api.chucknorris.io/jokes/random?category=${params.category}`
            );
            const data = await response.json();
            return {
                joke: data.value,
                iconUrl: data.icon_url
            };
        }
    },
    "get-chuck-categories": {
        description: "Get all available categories for Chuck Norris jokes",
        handler: async () => {
            const response = await fetch("https://api.chucknorris.io/jokes/categories");
            const data = await response.json();
            return {
                categories: data
            };
        }
    },
    "get-dad-joke": {
        description: "Get a random dad joke",
        handler: async () => {
            const response = await fetch("https://icanhazdadjoke.com/", {
                headers: { Accept: "application/json" }
            });
            const data = await response.json();
            return { joke: data.joke };
        }
    },
    "lingva-translate": {
        description: "Translate text using Lingva API",
        handler: async (params) => {
            const { text, sourceLang = 'en', targetLang = 'es' } = params;
            if (!text) throw new Error("Text parameter is required");
            const encodedText = encodeURIComponent(text);
            const url = `https://lingva.ml/api/v1/${sourceLang}/${targetLang}/${encodedText}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Lingva API error: ${response.statusText}`);
            const data = await response.json();
            return {
                originalText: text,
                translatedText: data.translation,
                sourceLanguage: sourceLang,
                targetLanguage: targetLang,
                api: "Lingva"
            };
        }
    },
    "mymemory-translate": {
        description: "Translate text using MyMemory API with caching",
        handler: async (params) => {
            const { text, sourceLang = 'en', targetLang = 'es' } = params;
            if (!text) throw new Error("Text parameter is required");
            const cacheKey = `${sourceLang}-${targetLang}-${text}`;
            const cached = translationCache.get(cacheKey);
            if (cached) return cached;
            const encodedText = encodeURIComponent(text);
            const url = `https://api.mymemory.translated.net/get?q=${encodedText}&langpair=${sourceLang}|${targetLang}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`MyMemory API error: ${response.statusText}`);
            const data = await response.json();
            if (!data.responseData?.translatedText) throw new Error("Invalid translation response");
            const result = {
                originalText: text,
                translatedText: data.responseData.translatedText,
                sourceLanguage: sourceLang,
                targetLanguage: targetLang,
                match: data.responseData.match || 0,
                api: "MyMemory"
            };
            translationCache.set(cacheKey, result);
            return result;
        }
    }
};

// Endpoints
app.post('/actions/echo', async (req, res) => {
    try {
        const jokeResponse = await fetch("https://api.chucknorris.io/jokes/random");
        const jokeData = await jokeResponse.json();
        res.json({
            originalMessage: req.body.message || "No message provided",
            chuckJoke: jokeData.value,
            iconUrl: jokeData.icon_url,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to process request", details: error.message });
    }
});

app.post('/actions/execute', async (req, res) => {
    try {
        const { tool, params, message } = req.body;
        if (!tools[tool]) {
            return res.status(400).json({
                error: "Tool not found",
                availableTools: Object.keys(tools)
            });
        }
        const result = await tools[tool].handler(params || {});
        res.json({
            tool,
            description: tools[tool].description,
            originalMessage: message || "No message provided",
            result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        const statusCode = error.message.includes("required") ? 400 : 500;
        res.status(statusCode).json({ error: "Failed to process request", details: error.message });
    }
});

app.get('/actions/tools', (req, res) => {
    const toolsList = Object.entries(tools).map(([name, tool]) => ({
        name,
        description: tool.description
    }));
    res.json({ tools: toolsList });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Export for Vercel
module.exports = serverless(app);


if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Local server running at http://localhost:${PORT}`);
  });
}

