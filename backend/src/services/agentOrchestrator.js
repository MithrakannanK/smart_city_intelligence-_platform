const { womenRouteAgent } = require("../../agents/womenRouteAgent");
const { citySafetyAgent } = require("../../agents/citySafetyAgent");
const { urbanIntelligenceAgent } = require("../../agents/urbanIntelligenceAgent");
const { womenAlertAgent } = require("../../agents/womenAlertAgent");

async function safeRouteDecision({ origin, destination, language = "en" }) {
  return womenRouteAgent({ origin, destination, language });
}

async function aiPredictions({ lat, lng, city, language = "en" }) {
  const citySafety = await citySafetyAgent({ lat, lng, city, language });
  const advisor = await urbanIntelligenceAgent({ lat, lng, city, language });
  return { ...citySafety, advisor };
}

async function womenEmergencyAlert({ origin, language = "en" }) {
  return womenAlertAgent({ origin, language });
}

module.exports = { safeRouteDecision, aiPredictions, womenEmergencyAlert };

