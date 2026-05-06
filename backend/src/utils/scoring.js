function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function normalizeInverse(value, min, max) {
  if (value <= min) return 1;
  if (value >= max) return 0;
  return 1 - (value - min) / (max - min);
}

// Converts minutes to a "better is higher" score (0..100)
function trafficToScore(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m)) return 50;
  // 0..60min mapped to 100..0
  return Math.round(normalizeInverse(m, 0, 60) * 100);
}

// Converts pollution risk score (0..100 where higher worse) to safety score
function pollutionRiskToSafety(pollutionRiskScore) {
  const risk = Number(pollutionRiskScore);
  if (!Number.isFinite(risk)) return 50;
  const safety = 100 - Math.max(0, Math.min(100, risk));
  return Math.round(safety);
}

function healthcareToScore({ hospitalsNearbyCount = 0 }) {
  // More nearby hospitals => higher score, saturating around 6
  const c = Number(hospitalsNearbyCount);
  const sat = Math.max(0, Math.min(6, c));
  return Math.round((sat / 6) * 100);
}

function policeProximityToScore({ minPoliceDistanceKm = 10 }) {
  const d = Number(minPoliceDistanceKm);
  if (!Number.isFinite(d)) return 40;
  // closer is better; 0..10km => 100..0
  return Math.round(normalizeInverse(d, 0, 10) * 100);
}

function computeCompositeSafetyScore({ trafficMinutes, pollutionRiskScore, hospitalsNearbyCount, minPoliceDistanceKm }) {
  const trafficScore = trafficToScore(trafficMinutes);
  const pollutionSafety = pollutionRiskToSafety(pollutionRiskScore);
  const healthcareScore = healthcareToScore({ hospitalsNearbyCount });
  const policeScore = policeProximityToScore({ minPoliceDistanceKm });

  // Weighted multi-criteria decision making
  // - Traffic (fastest) influences safety because emergencies require quick response
  // - Pollution influences health safety on the way
  // - Healthcare and police proximity strongly influence emergency readiness
  const safety =
    trafficScore * 0.25 + pollutionSafety * 0.20 + healthcareScore * 0.30 + policeScore * 0.25;

  return {
    safetyScore: Math.round(safety),
    components: {
      trafficScore,
      pollutionSafety,
      healthcareScore,
      policeScore,
    },
  };
}

module.exports = {
  clamp01,
  trafficToScore,
  pollutionRiskToSafety,
  healthcareToScore,
  policeProximityToScore,
  computeCompositeSafetyScore,
};

