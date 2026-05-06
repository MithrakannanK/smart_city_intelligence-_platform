function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(a, b) {
  const lat1 = Number(a?.lat);
  const lon1 = Number(a?.lng);
  const lat2 = Number(b?.lat);
  const lon2 = Number(b?.lng);
  if (![lat1, lon1, lat2, lon2].every((x) => Number.isFinite(x))) return NaN;

  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);

  const h = s1 * s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

module.exports = { haversineKm };

