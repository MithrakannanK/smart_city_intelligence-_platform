const axios = require("axios");

function googleKey() {
  return process.env.GOOGLE_MAPS_API_KEY || "";
}

function geocodingKey() {
  return process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
}

function toLatLngString(loc) {
  if (!loc) return "";
  if (typeof loc === "string") return loc;
  return `${loc.lat},${loc.lng}`;
}

async function reverseGeocode({ lat, lng }) {
  const key = geocodingKey();
  if (!key) return { city: "Tamil Nadu", state: "Tamil Nadu", country: "IN", source: "mock" };

  const url = `https://maps.googleapis.com/maps/api/geocode/json`;
  const { data } = await axios.get(url, {
    params: { latlng: `${lat},${lng}`, key },
  });

  const result = data?.results?.[0];
  if (!result) return { city: "Tamil Nadu", state: "Tamil Nadu", country: "IN", source: "no_results" };

  const comps = result.address_components || [];
  const find = (type) => comps.find((c) => (c.types || []).includes(type));
  const locality = find("locality")?.long_name;
  const admin2 = find("administrative_area_level_2")?.long_name;
  const admin1 = find("administrative_area_level_1")?.long_name;
  const country = find("country")?.long_name;

  return {
    city: locality || admin2 || admin1 || "Tamil Nadu",
    state: admin1 || "Tamil Nadu",
    country: country || "IN",
    source: "google",
  };
}

async function directions({ origin, destination, alternatives = true, traffic = true }) {
  const key = googleKey();
  if (!key) {
    return {
      source: "mock",
      routes: [
        {
          summary: "Mock fastest route",
          duration: { valueSeconds: 900, text: "15 mins" },
          distance: { valueMeters: 3500, text: "3.5 km" },
          polyline: "}_p~F~ps|U_ulLnnqC_mqNvxq`@",
        },
      ],
    };
  }

  const url = `https://maps.googleapis.com/maps/api/directions/json`;
  const { data } = await axios.get(url, {
    params: {
      origin: toLatLngString(origin),
      destination: toLatLngString(destination),
      key,
      mode: "driving",
      alternatives: alternatives ? "true" : "false",
      departure_time: traffic ? "now" : undefined,
      traffic_model: traffic ? "best_guess" : undefined,
    },
  });

  const routes = (data?.routes || []).map((r) => {
    const leg = r.legs?.[0];
    const duration = leg?.duration_in_traffic || leg?.duration;
    const distance = leg?.distance;
    return {
      summary: r.summary || "",
      duration: { valueSeconds: duration?.value, text: duration?.text },
      distance: { valueMeters: distance?.value, text: distance?.text },
      polyline: r.overview_polyline?.points,
      warnings: r.warnings || [],
    };
  });

  return { source: "google", routes };
}

async function placesNearby({ location, type, radius = 2500, limit = 8 }) {
  const key = googleKey();
  if (!key) {
    return { source: "mock", results: [] };
  }

  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`;
  const { data } = await axios.get(url, {
    params: {
      location: toLatLngString(location),
      radius,
      key,
      type,
    },
  });

  const results = (data?.results || [])
    .slice(0, limit)
    .map((p) => ({
      placeId: p.place_id,
      name: p.name,
      lat: p.geometry?.location?.lat,
      lng: p.geometry?.location?.lng,
      rating: p.rating,
      userRatingsTotal: p.user_ratings_total,
      vicinity: p.vicinity,
      priceLevel: p.price_level,
      types: p.types || [],
    }));

  return { source: "google", results };
}

async function placesDetails({ placeId }) {
  const key = googleKey();
  if (!key) {
    return { source: "mock", placeId, phoneNumber: "", formattedAddress: "" };
  }

  const url = `https://maps.googleapis.com/maps/api/place/details/json`;
  const { data } = await axios.get(url, {
    params: {
      place_id: placeId,
      key,
      fields: "formatted_phone_number,formatted_address,name,rating,geometry,international_phone_number,opening_hours,website",
    },
  });

  const r = data?.result || {};
  return {
    source: "google",
    placeId,
    name: r.name,
    phoneNumber: r.formatted_phone_number || r.international_phone_number || "",
    formattedAddress: r.formatted_address || "",
    rating: r.rating,
    website: r.website || "",
  };
}

async function geocodeTextToLatLng({ text }) {
  const key = geocodingKey();
  if (!key) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json`;
  const { data } = await axios.get(url, {
    params: { address: text, key },
  });
  const first = data?.results?.[0];
  if (!first) return null;
  const loc = first?.geometry?.location;
  if (!loc) return null;
  return { lat: loc.lat, lng: loc.lng };
}

module.exports = {
  reverseGeocode,
  directions,
  placesNearby,
  placesDetails,
  geocodeTextToLatLng,
};

