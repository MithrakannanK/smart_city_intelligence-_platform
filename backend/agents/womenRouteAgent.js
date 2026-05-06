const { googleMapsService } = require("../src/services/googleMapsServiceProxy");
const { openWeatherService } = require("../src/services/openWeatherServiceProxy");
const { callLLM, tryParseJson } = require("../src/services/llmService");
const { decodePolyline, pickSamplePoints } = require("../src/utils/polyline");
const { haversineKm } = require("../src/utils/geo");
const { computeCompositeSafetyScore } = require("../src/utils/scoring");

/**
 * Returns Route A (Fastest) and Route B (Safest).
 * Active decision-making: the LLM is asked to choose which route is safest given computed features.
 */
async function womenRouteAgent({ origin, destination, language = "en" }) {
  const { directions, placesNearby, placesDetails } = googleMapsService;
  const { getAirPollution } = openWeatherService;

  // 1) Get alternative driving routes
  const directionsResult = await directions({
    origin,
    destination,
    alternatives: true,
    traffic: true,
  });

  const allRoutes = directionsResult?.routes || [];
  if (allRoutes.length === 0) {
    return {
      source: directionsResult?.source || "unknown",
      routes: [],
      chosenSafestRouteIndex: 0,
      chosenFastestRouteIndex: 0,
      decision: { safest: null, fastest: null },
      explanation: "No route found.",
    };
  }

  // Ensure we have at least 2 candidates
  const routesSortedByDuration = [...allRoutes].sort(
    (a, b) => (a.duration?.valueSeconds || 0) - (b.duration?.valueSeconds || 0)
  );
  const topCandidates = routesSortedByDuration.slice(0, Math.min(2, routesSortedByDuration.length));

  // 2) Fetch air pollution once (used in health safety / on-the-way risk)
  const pollution = await getAirPollution({ lat: origin.lat, lng: origin.lng });

  // 3) Compute route safety features (police proximity + healthcare availability)
  const evaluatedRoutes = [];

  for (let i = 0; i < topCandidates.length; i++) {
    const r = topCandidates[i];
    const poly = r.polyline || "";
    const decoded = decodePolyline(poly);
    const samples = pickSamplePoints(decoded, 3);

    const hospitalsAll = [];
    const policeAll = [];

    // Keep API calls bounded: only check at sampled points
    for (const p of samples) {
      const [hospitalsRes, policeRes] = await Promise.all([
        placesNearby({ location: p, type: "hospital", radius: 2500, limit: 6 }),
        placesNearby({ location: p, type: "police", radius: 2500, limit: 6 }),
      ]);

      hospitalsAll.push(...(hospitalsRes.results || []));
      policeAll.push(...(policeRes.results || []));
    }

    // Deduplicate by placeId
    const uniqueById = (arr) => {
      const map = new Map();
      for (const item of arr || []) {
        if (item?.placeId) map.set(item.placeId, item);
      }
      return [...map.values()];
    };

    const hospitals = uniqueById(hospitalsAll);
    const police = uniqueById(policeAll);

    // Compute min distance to police (approx)
    let minPoliceDistanceKm = Infinity;
    for (const policePlace of police) {
      const dist = haversineKm(origin, policePlace);
      if (Number.isFinite(dist) && dist < minPoliceDistanceKm) minPoliceDistanceKm = dist;
    }
    if (!Number.isFinite(minPoliceDistanceKm)) minPoliceDistanceKm = 12;

    const safety = computeCompositeSafetyScore({
      trafficMinutes: (r.duration?.valueSeconds || 0) / 60,
      pollutionRiskScore: pollution?.riskScore ?? 50,
      hospitalsNearbyCount: hospitals.length,
      minPoliceDistanceKm,
    });

    // Light enrichment for UI: fetch details for 2 closest police/hospitals near origin
    // (This is best-effort; failures shouldn't break routing.)
    let policeStations = [];
    let hospitalsNearby = [];
    try {
      const sortedPolice = [...police].sort(
        (a, b) => haversineKm(origin, a) - haversineKm(origin, b)
      );
      const sortedHosp = [...hospitals].sort(
        (a, b) => haversineKm(origin, a) - haversineKm(origin, b)
      );
      const topPoliceIds = sortedPolice.slice(0, 2).map((x) => x.placeId).filter(Boolean);
      const topHospIds = sortedHosp.slice(0, 2).map((x) => x.placeId).filter(Boolean);

      policeStations = await Promise.all(
        topPoliceIds.map(async (placeId) => {
          const d = await placesDetails({ placeId });
          return { placeId, ...d };
        })
      );
      hospitalsNearby = await Promise.all(
        topHospIds.map(async (placeId) => {
          const d = await placesDetails({ placeId });
          return { placeId, ...d };
        })
      );
    } catch {
      // ignore enrichment
    }

    evaluatedRoutes.push({
      route: r,
      features: {
        samplesCount: samples.length,
        hospitalsCount: hospitals.length,
        policeCount: police.length,
        minPoliceDistanceKm,
        pollution,
      },
      safety,
      policeStations,
      hospitalsNearby,
    });
  }

  // Fastest by duration among candidates
  const fastestIdx = (() => {
    const sortedByDuration = [...evaluatedRoutes].sort(
      (a, b) => (a.route.duration?.valueSeconds || 0) - (b.route.duration?.valueSeconds || 0)
    );
    return evaluatedRoutes.indexOf(sortedByDuration[0]);
  })();

  // Safest by computed safety score
  const safestIdx = (() => {
    const sortedBySafety = [...evaluatedRoutes].sort((a, b) => b.safety.safetyScore - a.safety.safetyScore);
    return evaluatedRoutes.indexOf(sortedBySafety[0]);
  })();

  // 4) Ask LLM for decision/explanation (active reasoning)
  const llmPayload = {
    fastestCandidate: fastestIdx,
    safestCandidate: safestIdx,
    candidates: evaluatedRoutes.map((er, idx) => ({
      idx,
      routeSummary: er.route.summary,
      durationMinutes: (er.route.duration?.valueSeconds || 0) / 60,
      safetyScore: er.safety.safetyScore,
      components: er.safety.components,
      hospitalsNearbyCount: er.features.hospitalsCount,
      policeCount: er.features.policeCount,
      minPoliceDistanceKm: er.features.minPoliceDistanceKm,
      pollutionAQI_RiskScore: er.features.pollution?.riskScore,
    })),
  };

  const systemPrompt =
    "You are a Smart City command-center AI focused on women safety and emergency readiness. " +
    "Choose between provided route candidates. Output must be valid JSON ONLY.";

  const prompt =
    `Decide the better route for a women-safety-first emergency trip.\n` +
    `Rules: prefer higher safetyScore, but also consider faster travel as a secondary criterion.\n` +
    `Use emergency readiness: police proximity + nearby hospitals.\n\n` +
    `Candidates JSON:\n${JSON.stringify(llmPayload, null, 2)}\n\n` +
    "Return JSON like {\"chosenFastestRouteIndex\": number, \"chosenSafestRouteIndex\": number, \"safestRouteLabel\": \"Safest\"|\"Fastest\", \"recommendation\": string, \"routeA\": string, \"routeB\": string, \"reasoning\": {\"keyFactors\": string[]}}";

  const llm = await callLLM({ prompt, systemPrompt, language, providerHint: undefined });
  const parsed = tryParseJson(llm.raw);

  const chosenFastestRouteIndex = Number(parsed?.chosenFastestRouteIndex ?? fastestIdx);
  const chosenSafestRouteIndex = Number(parsed?.chosenSafestRouteIndex ?? safestIdx);

  const routeA = evaluatedRoutes.find((_, idx) => idx === chosenFastestRouteIndex) || evaluatedRoutes[fastestIdx];
  const routeB = evaluatedRoutes.find((_, idx) => idx === chosenSafestRouteIndex) || evaluatedRoutes[safestIdx];

  const recommendation = parsed?.recommendation || "Safest route is highlighted for women safety.";

  const mappedRoutes = [routeA, routeB].map((item, idx) => ({
    label: idx === 0 ? "Route A (Fastest)" : "Route B (Safest)",
    safetyScore: item.safety.safetyScore,
    safetyComponents: item.safety.components,
    duration: item.route.duration,
    distance: item.route.distance,
    polyline: item.route.polyline,
    summary: item.route.summary,
    hospitalsNearby: item.hospitalsNearby,
    policeStations: item.policeStations,
  }));

  return {
    source: "womenRouteAgent",
    chosenFastestRouteIndex,
    chosenSafestRouteIndex,
    recommendation,
    explanation: parsed?.reasoning?.keyFactors ? parsed.reasoning.keyFactors.join(", ") : recommendation,
    pollution,
    routes: mappedRoutes,
  };
}

module.exports = { womenRouteAgent };

