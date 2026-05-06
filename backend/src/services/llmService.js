const { ChatOpenAI } = require("@langchain/openai");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");

function llmDisabled() {
  return String(process.env.LLM_DISABLED || "false").toLowerCase() === "true";
}

function openAIModel() {
  return process.env.LLM_MODEL_OPENAI || "gpt-4o-mini";
}

function geminiModel() {
  return process.env.LLM_MODEL_GEMINI || "gemini-1.5-flash";
}

async function callLLM({ prompt, systemPrompt, language = "en", providerHint }) {
  if (llmDisabled()) return { ok: false, provider: "none", raw: "" };

  const openaiKey = process.env.OPENAI_API_KEY || "";
  const geminiKey = process.env.GEMINI_API_KEY || "";

  const provider =
    providerHint ||
    (openaiKey ? "openai" : geminiKey ? "gemini" : "");

  if (!provider) return { ok: false, provider: "none", raw: "" };

  const messages = [
    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
    {
      role: "user",
      content: `${language === "ta" ? "Respond in Tamil." : "Respond in English."}\n\n${prompt}`,
    },
  ];

  try {
    if (provider === "openai") {
      const model = new ChatOpenAI({
        apiKey: openaiKey,
        model: openAIModel(),
        temperature: 0.2,
      });
      const res = await model.invoke(messages);
      return { ok: true, provider: "openai", raw: res?.content || "" };
    }

    if (provider === "gemini") {
      const model = new ChatGoogleGenerativeAI({
        apiKey: geminiKey,
        model: geminiModel(),
        temperature: 0.2,
      });
      const res = await model.invoke(messages);
      return { ok: true, provider: "gemini", raw: res?.content || "" };
    }

    return { ok: false, provider: "none", raw: "" };
  } catch (err) {
    return { ok: false, provider, raw: "", error: err?.message || String(err) };
  }
}

function tryParseJson(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Try to extract first JSON object/array from the response
    const match = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }
}

module.exports = { callLLM, tryParseJson };

