const { callLLM, tryParseJson } = require("../src/services/llmService");
const { citySafetyAgent } = require("./citySafetyAgent");

async function urbanIntelligenceAgent({ lat, lng, city, language = "en" }) {
  const citySafety = await citySafetyAgent({ lat, lng, city, language });

  const systemPrompt =
    "You are an AI city advisor for a smart city command center focused on women safety and emergency readiness. Return JSON only.";

  const prompt =
    `Generate a short actionable advisor summary.\n\n` +
    `City safety score: ${citySafety.citySafetyScore}/100\n` +
    `Traffic proxy (minutes to nearest hospital): ${citySafety.trafficMinutes}\n` +
    `Air quality: ${citySafety.pollution?.aqiLabel} (AQI=${citySafety.pollution?.aqi})\n` +
    `Health risk alerts: ${JSON.stringify(citySafety.healthRisk?.alerts || [], null, 2)}\n\n` +
    "Return JSON like {\"advisorSummary\": string, \"keyRisks\": string[], \"recommendedActions\": string[]}";

  const llm = await callLLM({ prompt, systemPrompt, language });
  const parsed = tryParseJson(llm.raw);

  if (parsed) return parsed;

  return {
    advisorSummary: "Women-safety prioritized emergency readiness is active. Safest routes are recommended when moving through high-risk areas.",
    keyRisks: citySafety.healthRisk?.alerts?.slice?.(0, 3) || [],
    recommendedActions: citySafety.healthRisk?.recommendations?.slice?.(0, 3) || ["Keep emergency contacts ready."],
  };
}

module.exports = { urbanIntelligenceAgent };

