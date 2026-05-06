const axios = require("axios");

function openWeatherKey() {
  return process.env.OPENWEATHER_API_KEY || "";
}

function aqiLabel(aqi) {
  // OpenWeather: 1 Good, 2 Fair, 3 Moderate, 4 Poor, 5 Very Poor
  const map = {
    1: "Good",
    2: "Fair",
    3: "Moderate",
    4: "Poor",
    5: "Very Poor",
  };
  return map[aqi] || "Unknown";
}

function aqiToRiskScore(aqi) {
  // Convert to 0..100 risk (higher = worse air quality)
  const clamped = Math.max(1, Math.min(5, Number(aqi) || 1));
  return ((clamped - 1) / 4) * 100;
}

async function getAirPollution({ lat, lng }) {
  const key = openWeatherKey();
  if (!key) {
    // Sensible fallback for UI so it still "works" without keys.
    return {
      source: "mock",
      aqi: 2,
      aqiLabel: aqiLabel(2),
      riskScore: aqiToRiskScore(2),
      components: { pm2_5: 12, pm10: 20, o3: 30, no2: 15 },
    };
  }

  const url = `https://api.openweathermap.org/data/2.5/air_pollution`;
  const { data } = await axios.get(url, { params: { lat, lon: lng, appid: key } });
  const meas = data?.list?.[0];
  const main = meas?.main || {};
  const comps = meas?.components || {};
  const aqi = main.aqi;
  return {
    source: "openweather",
    aqi,
    aqiLabel: aqiLabel(aqi),
    riskScore: aqiToRiskScore(aqi),
    components: {
      pm2_5: comps.pm2_5,
      pm10: comps.pm10,
      o3: comps.o3,
      no2: comps.no2,
    },
    timestamp: meas?.dt,
  };
}

module.exports = { getAirPollution };

