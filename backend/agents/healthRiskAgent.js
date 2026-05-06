const { callLLM, tryParseJson } = require("../src/services/llmService");
const { computeCompositeSafetyScore } = require("../src/utils/scoring");

async function healthRiskAgent({ pollution, hospitalsCount = 0, language = "en" }) {
  // Compute a simple "health readiness" score
  const safety = computeCompositeSafetyScore({
    trafficMinutes: 15,
    pollutionRiskScore: pollution?.riskScore ?? 50,
    hospitalsNearbyCount: hospitalsCount,
    minPoliceDistanceKm: 6,
  });

  const systemPrompt =
    "You are a health-risk analysis agent for a smart city emergency dashboard. " +
    "Return JSON ONLY.";

  const prompt = {
    pollution: {
      aqi: pollution?.aqi,
      aqiLabel: pollution?.aqiLabel,
      riskScore: pollution?.riskScore,
      components: pollution?.components,
    },
    hospitalsCount,
    computedHealthScore: safety.safetyScore,
    context: "Focus on vulnerable groups: women, children, elderly. Explain risks briefly and recommend actions.",
  };

  const llm = await callLLM({
    systemPrompt,
    prompt: `Analyze the following and return risk alerts JSON.\n\n${JSON.stringify(prompt, null, 2)}`,
    language,
  });

  const parsed = tryParseJson(llm.raw);

  // Fallback alerts if LLM not available/parse fails
  const fallback = {
    healthRiskScore: safety.safetyScore,
    healthStatus: pollution?.aqiLabel ? String(pollution.aqiLabel) : "Unknown",
    alerts: [
      pollution?.riskScore > 65
        ? "Air quality is poor. Limit outdoor activity for vulnerable people; keep emergency contacts ready."
        : "Air quality is manageable. For sensitive groups, consider masks during peak hours.",
      hospitalsCount < 3 ? "Limited hospital availability nearby. Consider staying close to care centers." : "",
    ].filter(Boolean),
    recommendations: [
      "Carry a small mask for vulnerable people during high-AQI periods.",
      "Plan emergency route to the nearest hospital before travel.",
    ],
  };

  return parsed || fallback;
}

module.exports = { healthRiskAgent };

