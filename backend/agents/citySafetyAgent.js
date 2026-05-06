const { callLLM, tryParseJson } = require("../src/services/llmService");
const { googleMapsService } = require("../src/services/googleMapsServiceProxy");
const { openWeatherService } = require("../src/services/openWeatherServiceProxy");
const { healthRiskAgent } = require("./healthRiskAgent");
const { computeCompositeSafetyScore } = require("../src/utils/scoring");

function aroundPoints({ lat, lng, stepDeg = 0.03 }) {
  // Rough grid around a point; step ~3km-4km depending on latitude.
  return [
    { lat: lat + stepDeg, lng: lng - stepDeg },
    { lat: lat + stepDeg, lng: lng },
    { lat: lat + stepDeg, lng: lng + stepDeg },
  ];
}

function gridPoints({ lat, lng }) {
  const step = 0.035; // ~3-4km
  return [
    { lat: lat - step, lng: lng - step },
    { lat: lat - step, lng: lng },
    { lat: lat - step, lng: lng + step },
    { lat: lat, lng: lng - step },
    { lat: lat, lng: lng },
    { lat: lat, lng: lng + step },
    { lat: lat + step, lng: lng - step },
    { lat: lat + step, lng: lng },
    { lat: lat + step, lng: lng + step },
  ];
}

function uniquePoints(points) {
  const seen = new Set();
  const out = [];
  for (const p of points) {
    const key = `${p.lat.toFixed(5)}:${p.lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

async function citySafetyAgent({ lat, lng, city, language = "en" }) {
  const { directions, placesNearby, placesDetails } = googleMapsService;
  const { getAirPollution } = openWeatherService;

  const hospitalsRes = await placesNearby({ location: { lat, lng }, type: "hospital", radius: 3500, limit: 8 });
  const policeRes = await placesNearby({ location: { lat, lng }, type: "police", radius: 3500, limit: 8 });

  const hospitalsCount = (hospitalsRes.results || []).length;
  const policeCount = (policeRes.results || []).length;

  const pollutionOrigin = await getAirPollution({ lat, lng });

  // Traffic/response time proxy: estimate time to the nearest hospital (if we have one).
  let trafficMinutes = 18;
  const nearestHospital = (hospitalsRes.results || []).sort((a, b) => (a.userRatingsTotal || 0) - (b.userRatingsTotal || 0))[0];
  try {
    if (nearestHospital?.lat && nearestHospital?.lng) {
      const dir = await directions({
        origin: { lat, lng },
        destination: { lat: nearestHospital.lat, lng: nearestHospital.lng },
        alternatives: false,
        traffic: true,
      });
      const first = dir?.routes?.[0];
      trafficMinutes = (first?.duration?.valueSeconds || 0) / 60 || trafficMinutes;
    }
  } catch {
    // Keep fallback
  }

  // Health risk alerts
  const health = await healthRiskAgent({
    pollution: pollutionOrigin,
    hospitalsCount,
    language,
  });

  // Heatmap points from pollution samples
  const pts = uniquePoints(gridPoints({ lat, lng }));
  const pollutionSamples = await Promise.all(
    pts.map(async (p) => {
      try {
        const po = await getAirPollution({ lat: p.lat, lng: p.lng });
        return { ...p, weight: po.riskScore ?? 50, aqi: po.aqi, label: po.aqiLabel };
      } catch {
        return { ...p, weight: 50, aqi: 2, label: "Unknown" };
      }
    })
  );

  // City-level safety score: blend response time + pollution + healthcare + police density proxy.
  const computed = computeCompositeSafetyScore({
    trafficMinutes,
    pollutionRiskScore: pollutionOrigin?.riskScore ?? 50,
    hospitalsNearbyCount: hospitalsCount,
    minPoliceDistanceKm: 5 - Math.min(4, policeCount / 3), // heuristic proxy
  });

  const systemPrompt =
    "You are an urban intelligence agent for a Smart City command center. Return JSON only.";
  const prompt =
    `City: ${city}\n` +
    `Computed city safety score ${computed.safetyScore}/100\n` +
    `trafficMinutes=${trafficMinutes}\n` +
    `pollution=${pollutionOrigin?.aqi} (${pollutionOrigin?.aqiLabel})\n` +
    `hospitalsCount=${hospitalsCount}, policeCount=${policeCount}\n\n` +
    `Health risk alerts JSON:\n${JSON.stringify(health, null, 2)}\n\n` +
    "Return JSON like {\"cityAdvisorSummary\": string, \"keyRisks\": string[], \"recommendedActions\": string[]}";

  const llm = await callLLM({ prompt, systemPrompt, language });
  const parsed = tryParseJson(llm.raw);

  return {
    source: "citySafetyAgent",
    citySafetyScore: computed.safetyScore,
    trafficMinutes,
    pollution: pollutionOrigin,
    healthRisk: health,
    heatmapPoints: pollutionSamples.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      weight: p.weight,
      aqi: p.aqi,
      aqiLabel: p.label,
    })),
    advisor: parsed || {
      cityAdvisorSummary: "Safety prioritized for women and emergency readiness.",
      keyRisks: [pollutionOrigin?.aqiLabel || "Unknown air quality"],
      recommendedActions: [
        "Plan safe routes and keep emergency contacts ready.",
        "Avoid outdoor travel for vulnerable groups during poor AQI.",
      ],
    },
  };
}

module.exports = { citySafetyAgent };

