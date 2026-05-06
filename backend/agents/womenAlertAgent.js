const { googleMapsService } = require("../src/services/googleMapsServiceProxy");
const { callLLM, tryParseJson } = require("../src/services/llmService");
const { haversineKm } = require("../src/utils/geo");

async function womenAlertAgent({ origin, language = "en" }) {
  const { placesNearby, placesDetails } = googleMapsService;

  const policeRes = await placesNearby({ location: origin, type: "police", radius: 2500, limit: 8 });
  const hospitalsRes = await placesNearby({ location: origin, type: "hospital", radius: 3500, limit: 6 });

  const police = policeRes.results || [];
  const hospitals = hospitalsRes.results || [];

  const nearestPolice = police
    .map((p) => ({ ...p, distanceKm: haversineKm(origin, p) }))
    .filter((x) => Number.isFinite(x.distanceKm))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];

  const nearestHospital = hospitals
    .map((p) => ({ ...p, distanceKm: haversineKm(origin, p) }))
    .filter((x) => Number.isFinite(x.distanceKm))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];

  let policeDetails = null;
  try {
    if (nearestPolice?.placeId) {
      policeDetails = await placesDetails({ placeId: nearestPolice.placeId });
    }
  } catch {
    // ignore enrichment
  }

  const systemPrompt =
    "You are an emergency response agent. Return JSON only. Keep it short and urgent.";

  const prompt =
    `Create an emergency message for women safety.\n` +
    `NearestPolice: ${nearestPolice ? nearestPolice.name : "unknown"} at ~${nearestPolice?.distanceKm?.toFixed?.(2) || "?"} km\n` +
    `NearestHospital: ${nearestHospital ? nearestHospital.name : "unknown"} at ~${nearestHospital?.distanceKm?.toFixed?.(2) || "?"} km\n\n` +
    "Return JSON like {\"message\": string, \"actions\": {\"callPolice\": true, \"callAmbulance\": true}, \"priority\": \"police\"|\"ambulance\"}.";

  const llm = await callLLM({ systemPrompt, prompt, language });
  const parsed = tryParseJson(llm.raw);

  const fallback = {
    message: language === "ta" ? "அவசர உதவி தேவை. காவல் துறையை உடனே தொடர்பு கொள்ளுங்கள்." : "Emergency assistance needed. Contact police immediately.",
    actions: { callPolice: true, callAmbulance: true },
    priority: nearestPolice ? "police" : "ambulance",
  };

  return {
    source: "womenAlertAgent",
    nearestPolice: policeDetails || { name: nearestPolice?.name || "Police", placeId: nearestPolice?.placeId || "", phoneNumber: "" },
    nearestHospital: nearestHospital
      ? { placeId: nearestHospital.placeId, name: nearestHospital.name, distanceKm: nearestHospital.distanceKm }
      : null,
    voiceMessage: parsed?.message || fallback.message,
    actions: parsed?.actions || fallback.actions,
    priority: parsed?.priority || fallback.priority,
  };
}

module.exports = { womenAlertAgent };

