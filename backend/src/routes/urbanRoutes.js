const express = require("express");

const { cities } = require("../utils/tamilNaduCities");
const { reverseGeocode, directions, placesNearby, placesDetails } = require("../services/googleMapsService");
const { getAirPollution } = require("../services/openWeatherService");
const agentOrchestrator = require("../services/agentOrchestrator");
const { haversineKm } = require("../utils/geo");

async function enrichPlaces({ origin, places, limit = 5 }) {
  const top = (places || []).slice(0, limit);
  const results = [];
  for (const p of top) {
    try {
      const d = await placesDetails({ placeId: p.placeId });
      results.push({
        placeId: p.placeId,
        name: d.name || p.name,
        phoneNumber: d.phoneNumber || "",
        rating: d.rating || p.rating,
        distanceKm: origin ? haversineKm(origin, { lat: p.lat, lng: p.lng }) : undefined,
        lat: p.lat,
        lng: p.lng,
        formattedAddress: d.formattedAddress || "",
        website: d.website || "",
        directionsUrl:
          origin && p.lat && p.lng
            ? `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${p.lat},${p.lng}&travelmode=driving`
            : "",
      });
    } catch {
      results.push({
        placeId: p.placeId,
        name: p.name,
        phoneNumber: "",
        rating: p.rating,
        lat: p.lat,
        lng: p.lng,
      });
    }
  }
  return results;
}

async function resolveCityFromLatLng({ lat, lng }) {
  try {
    const rg = await reverseGeocode({ lat, lng });
    return rg.city;
  } catch {
    return "Tamil Nadu";
  }
}

const urbanRoutes = express.Router();

urbanRoutes.get("/resolve-city", async (req, res) => {
  const { lat, lng } = req.query;
  if (![lat, lng].every((x) => Number.isFinite(Number(x)))) return res.status(400).json({ error: "Missing/invalid lat/lng" });
  const payload = await reverseGeocode({ lat: Number(lat), lng: Number(lng) }).catch(() => ({
    city: "Tamil Nadu",
    state: "Tamil Nadu",
    country: "IN",
    source: "mock",
  }));
  res.json(payload);
});

urbanRoutes.get("/cities", (req, res) => {
  return res.json({ cities });
});

// Traffic: alternative routes with traffic-aware durations
urbanRoutes.get("/traffic", async (req, res) => {
  const { originLat, originLng, destinationLat, destinationLng, alternatives = "true" } = req.query;
  const origin = { lat: Number(originLat), lng: Number(originLng) };
  const destination = { lat: Number(destinationLat), lng: Number(destinationLng) };
  if (![origin.lat, origin.lng, destination.lat, destination.lng].every((x) => Number.isFinite(x))) {
    return res.status(400).json({ error: "Missing/invalid lat/lng" });
  }
  const result = await directions({
    origin,
    destination,
    alternatives: alternatives === "true",
    traffic: true,
  });
  res.json(result);
});

urbanRoutes.get("/pollution", async (req, res) => {
  const { lat, lng } = req.query;
  if (![lat, lng].every((x) => Number.isFinite(Number(x)))) return res.status(400).json({ error: "Missing/invalid lat/lng" });
  const result = await getAirPollution({ lat: Number(lat), lng: Number(lng) });
  res.json(result);
});

function nearbyParams(req) {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radius = Number(req.query.radius || 3500);
  const limit = Number(req.query.limit || 5);
  return { lat, lng, radius, limit };
}

urbanRoutes.get("/hospitals", async (req, res) => {
  const { lat, lng, radius, limit } = nearbyParams(req);
  if (![lat, lng].every(Number.isFinite)) return res.status(400).json({ error: "Missing/invalid lat/lng" });
  const nearby = await placesNearby({ location: { lat, lng }, type: "hospital", radius, limit: Math.min(10, limit) });
  const enriched = await enrichPlaces({ origin: { lat, lng }, places: nearby.results, limit });
  res.json({ source: nearby.source, results: enriched });
});

urbanRoutes.get("/restaurants", async (req, res) => {
  const { lat, lng, radius, limit } = nearbyParams(req);
  if (![lat, lng].every(Number.isFinite)) return res.status(400).json({ error: "Missing/invalid lat/lng" });
  const nearby = await placesNearby({ location: { lat, lng }, type: "restaurant", radius, limit: Math.min(12, limit) });
  const enriched = await enrichPlaces({ origin: { lat, lng }, places: nearby.results, limit });
  res.json({ source: nearby.source, results: enriched });
});

urbanRoutes.get("/railway", async (req, res) => {
  const { lat, lng, radius, limit } = nearbyParams(req);
  if (![lat, lng].every(Number.isFinite)) return res.status(400).json({ error: "Missing/invalid lat/lng" });
  const nearby = await placesNearby({ location: { lat, lng }, type: "train_station", radius, limit: Math.min(10, limit) });
  const enriched = await enrichPlaces({ origin: { lat, lng }, places: nearby.results, limit });
  res.json({ source: nearby.source, results: enriched });
});

urbanRoutes.get("/police", async (req, res) => {
  const { lat, lng, radius, limit } = nearbyParams(req);
  if (![lat, lng].every(Number.isFinite)) return res.status(400).json({ error: "Missing/invalid lat/lng" });
  const nearby = await placesNearby({ location: { lat, lng }, type: "police", radius, limit: Math.min(12, limit) });
  const enriched = await enrichPlaces({ origin: { lat, lng }, places: nearby.results, limit });
  res.json({ source: nearby.source, results: enriched });
});

urbanRoutes.get("/petrol", async (req, res) => {
  const { lat, lng, radius, limit } = nearbyParams(req);
  if (![lat, lng].every(Number.isFinite)) return res.status(400).json({ error: "Missing/invalid lat/lng" });
  const nearby = await placesNearby({ location: { lat, lng }, type: "gas_station", radius, limit: Math.min(12, limit) });
  const enriched = await enrichPlaces({ origin: { lat, lng }, places: nearby.results, limit });
  res.json({ source: nearby.source, results: enriched });
});

// Women safety: nearby police + emergency helpline numbers
urbanRoutes.get("/women-safety", async (req, res) => {
  const { lat, lng } = req.query;
  if (![lat, lng].every((x) => Number.isFinite(Number(x)))) return res.status(400).json({ error: "Missing/invalid lat/lng" });
  const origin = { lat: Number(lat), lng: Number(lng) };
  const policeRes = await placesNearby({ location: origin, type: "police", radius: 3500, limit: 6 });
  const police = await enrichPlaces({ origin, places: policeRes.results, limit: 5 });
  res.json({
    helplines: [
      { label: "Ambulance", tel: "108" },
      { label: "Police", tel: "100" },
      { label: "Emergency", tel: "112" },
    ],
    police,
    location: origin,
  });
});

// Core: women safety-first safe route (Route A=Fastest, Route B=Safest)
urbanRoutes.post("/safe-route", async (req, res) => {
  const { origin, destination, language = "en" } = req.body || {};
  const o = origin || {};
  const d = destination || {};
  if (![o.lat, o.lng, d.lat, d.lng].every((x) => Number.isFinite(Number(x)))) {
    return res.status(400).json({ error: "Missing/invalid origin/destination lat/lng" });
  }
  const decision = await agentOrchestrator.safeRouteDecision({
    origin: { lat: Number(o.lat), lng: Number(o.lng) },
    destination: { lat: Number(d.lat), lng: Number(d.lng) },
    language,
  });
  res.json(decision);
});

urbanRoutes.get("/ai-predictions", async (req, res) => {
  const { lat, lng } = req.query;
  if (![lat, lng].every((x) => Number.isFinite(Number(x)))) return res.status(400).json({ error: "Missing/invalid lat/lng" });

  const city = req.query.city || (await resolveCityFromLatLng({ lat: Number(lat), lng: Number(lng) }));

  const result = await agentOrchestrator.aiPredictions({
    lat: Number(lat),
    lng: Number(lng),
    city,
    language: req.query.language || "en",
  });

  res.json(result);
});

urbanRoutes.post("/ai-chat", async (req, res) => {
  const { message, language = "en", context } = req.body || {};
  if (!message || typeof message !== "string") return res.status(400).json({ error: "Missing message" });

  // Use the same women alert + safe route decision system for action intents.
  const lower = message.toLowerCase();
  const wantsEmergency = lower.includes("emergency") || lower.includes("help") || lower.includes("அவசரம்");
  const wantsAmbulance = lower.includes("ambulance") || lower.includes("108") || lower.includes("ஆம்புலன்ஸ்");
  const wantsPolice = lower.includes("police") || lower.includes("100") || lower.includes("காவல்");
  const wantsNavigateHome = lower.includes("navigate home") || lower.includes("home") || lower.includes("என் வீடு");

  const tel = (label) => (label === "ambulance" ? "108" : "100");

  if (wantsEmergency) {
    const origin = context?.origin || context?.location || {};
    if (origin?.lat && origin?.lng) {
      const alert = await agentOrchestrator.womenEmergencyAlert({ origin: { lat: Number(origin.lat), lng: Number(origin.lng) }, language });
      return res.json({
        type: "emergency_alert",
        voiceMessage: alert.voiceMessage,
        ui: { callPoliceTel: "100", callAmbulanceTel: "108", priority: alert.priority },
      });
    }
    return res.json({ type: "emergency_alert", voiceMessage: "Emergency! Call police/ambulance now.", ui: { callPoliceTel: "100", callAmbulanceTel: "108", priority: "police" } });
  }

  if (wantsAmbulance) {
    return res.json({ type: "call", intent: "ambulance", tel: tel("ambulance"), response: language === "ta" ? "ஆம்புலன்ஸ் அழைக்கிறேன்." : "Calling ambulance now." });
  }

  if (wantsPolice) {
    return res.json({ type: "call", intent: "police", tel: tel("police"), response: language === "ta" ? "காவலை அழைக்கிறேன்." : "Calling police now." });
  }

  if (wantsNavigateHome && context?.home) {
    const origin = context?.origin || context?.location;
    if (!origin?.lat || !origin?.lng) {
      return res.json({ type: "info", response: "Missing current location for navigation." });
    }
    const destination = context.home;
    const safe = await agentOrchestrator.safeRouteDecision({
      origin: { lat: Number(origin.lat), lng: Number(origin.lng) },
      destination: { lat: Number(destination.lat), lng: Number(destination.lng) },
      language,
    });
    return res.json({ type: "navigation", safeRoute: safe, response: language === "ta" ? "வீட்டிற்கு பாதுகாப்பான வழி கணக்கிடப்பட்டது." : "Safe route to home calculated." });
  }

  return res.json({
    type: "info",
    response:
      language === "ta"
        ? "நான் நேரடி நடவடிக்கைகளுக்கு உதவுகிறேன்: அவசரம், காவல், ஆம்புலன்ஸ், அல்லது பாதுகாப்பான வழி."
        : "I can help with direct actions: emergency, police, ambulance, or safe navigation.",
  });
});

urbanRoutes.post("/voice-command", async (req, res) => {
  const { transcript, language = "en", context } = req.body || {};
  if (!transcript || typeof transcript !== "string") return res.status(400).json({ error: "Missing transcript" });

  const message = transcript.trim();
  const lower = message.toLowerCase();
  const wantsEmergency = lower.includes("emergency") || lower.includes("help") || lower.includes("அவசரம்");
  const wantsAmbulance = lower.includes("ambulance") || lower.includes("108") || lower.includes("ஆம்புலன்ஸ்");
  const wantsPolice = lower.includes("police") || lower.includes("100") || lower.includes("காவல்");
  const wantsNavigateHome = lower.includes("navigate home") || lower.includes("home") || lower.includes("என் வீடு");

  const tel = (label) => (label === "ambulance" ? "108" : "100");

  if (wantsEmergency) {
    const origin = context?.origin || context?.location || {};
    if (origin?.lat && origin?.lng) {
      const alert = await agentOrchestrator.womenEmergencyAlert({ origin: { lat: Number(origin.lat), lng: Number(origin.lng) }, language });
      return res.json({
        type: "emergency_alert",
        voiceMessage: alert.voiceMessage,
        ui: { callPoliceTel: "100", callAmbulanceTel: "108", priority: alert.priority },
      });
    }
    return res.json({
      type: "emergency_alert",
      voiceMessage: language === "ta" ? "அவசரம்! காவல் அல்லது ஆம்புலன்ஸ் அழைக்கவும்." : "Emergency! Call police/ambulance now.",
      ui: { callPoliceTel: "100", callAmbulanceTel: "108", priority: "police" },
    });
  }

  if (wantsAmbulance) {
    return res.json({ type: "call", intent: "ambulance", tel: tel("ambulance"), tts: language === "ta" ? "ஆம்புலன்ஸ் அழைக்கிறேன்." : "Calling ambulance now." });
  }

  if (wantsPolice) {
    return res.json({ type: "call", intent: "police", tel: tel("police"), tts: language === "ta" ? "காவலை அழைக்கிறேன்." : "Calling police now." });
  }

  if (wantsNavigateHome && context?.home) {
    const origin = context?.origin || context?.location;
    if (!origin?.lat || !origin?.lng) return res.json({ type: "info", response: language === "ta" ? "நாவிகேஷனுக்கு தற்போதைய இடம் இல்லை." : "Missing current location for navigation." });
    const destination = context.home;
    const safe = await agentOrchestrator.safeRouteDecision({
      origin: { lat: Number(origin.lat), lng: Number(origin.lng) },
      destination: { lat: Number(destination.lat), lng: Number(destination.lng) },
      language,
    });
    return res.json({
      type: "navigation",
      safeRoute: safe,
      tts: language === "ta" ? "வீட்டிற்கு பாதுகாப்பான வழி கணக்கிடப்பட்டது." : "Safe route to home calculated.",
    });
  }

  return res.json({
    type: "info",
    tts: language === "ta" ? "எனக்கு சொல்க: அவசரம், காவல், ஆம்புலன்ஸ், அல்லது பாதுகாப்பான வழி." : "Say: emergency, police, ambulance, or safe navigation.",
  });
});

// Endpoint for women emergency alert (dashboard emergency button)
urbanRoutes.post("/women-alert", async (req, res) => {
  const { origin, language = "en" } = req.body || {};
  if (!origin || !Number.isFinite(Number(origin.lat)) || !Number.isFinite(Number(origin.lng))) {
    return res.status(400).json({ error: "Missing/invalid origin lat/lng" });
  }
  const alert = await agentOrchestrator.womenEmergencyAlert({ origin: { lat: Number(origin.lat), lng: Number(origin.lng) }, language });
  res.json({
    voiceMessage: alert.voiceMessage,
    nearestPolice: alert.nearestPolice,
    ui: { callPoliceTel: "100", callAmbulanceTel: "108", priority: alert.priority },
  });
});

module.exports = { urbanRoutes };

