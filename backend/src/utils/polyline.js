// Decodes an encoded polyline (Google Directions API) into [{lat,lng}, ...]
function decodePolyline(encoded) {
  if (!encoded || typeof encoded !== "string") return [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  const coordinates = [];
  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return coordinates;
}

function pickSamplePoints(points, count = 3) {
  if (!Array.isArray(points) || points.length === 0) return [];
  if (points.length <= count) return points;
  const sampled = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i * (points.length - 1)) / (count - 1));
    sampled.push(points[idx]);
  }
  return sampled;
}

module.exports = { decodePolyline, pickSamplePoints };

