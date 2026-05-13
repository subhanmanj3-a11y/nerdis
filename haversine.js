// ─── Haversine Distance Formula ──────────────────────────────────────────────
// Calculates the great-circle distance between two points on Earth
// Returns distance in kilometers

const Haversine = {

  // ─── Earth Radius ───────────────────────────────────────────────────────────
  EARTH_RADIUS_KM: 6371,
  EARTH_RADIUS_MI: 3958.8,

  // ─── Core Formula ───────────────────────────────────────────────────────────
  /**
   * Calculate distance between two coordinates
   * @param {number} lat1 - Origin latitude
   * @param {number} lng1 - Origin longitude
   * @param {number} lat2 - Destination latitude
   * @param {number} lng2 - Destination longitude
   * @param {string} unit - 'km' | 'mi' | 'm'
   * @returns {number} Distance in specified unit
   */
  distance(lat1, lng1, lat2, lng2, unit = 'km') {
    const toRad = (deg) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const km = this.EARTH_RADIUS_KM * c;

    switch (unit) {
      case 'm':  return km * 1000;
      case 'mi': return km / 1.60934;
      default:   return km;
    }
  },

  // ─── Format Distance for Display ────────────────────────────────────────────
  /**
   * Returns a human-readable distance string
   * e.g. "250 m", "1.2 km", "5.8 km"
   */
  format(lat1, lng1, lat2, lng2) {
    const meters = this.distance(lat1, lng1, lat2, lng2, 'm');

    if (meters < 100)  return 'Nearby';
    if (meters < 1000) return `${Math.round(meters)} m`;

    const km = meters / 1000;
    return km < 10
      ? `${km.toFixed(1)} km`
      : `${Math.round(km)} km`;
  },

  // ─── Sort Array of Deals by Distance ────────────────────────────────────────
  /**
   * Attach distance + sort an array of deals by proximity
   * @param {Array}  deals      - Array of deal objects
   * @param {number} userLat    - User's latitude
   * @param {number} userLng    - User's longitude
   * @param {string} coordField - Path to coordinates in deal object
   * @returns {Array} Sorted deals with .distance property attached
   */
  sortByDistance(deals, userLat, userLng, coordField = 'location.coordinates') {
    return deals
      .map(deal => {
        const coords = this._getNestedValue(deal, coordField);
        let dist = Infinity;

        if (Array.isArray(coords) && coords.length === 2) {
          const [lng, lat] = coords; // GeoJSON: [longitude, latitude]
          dist = this.distance(userLat, userLng, lat, lng, 'km');
        }

        return { ...deal, distance: dist };
      })
      .sort((a, b) => a.distance - b.distance);
  },

  // ─── Filter Deals Within Radius ──────────────────────────────────────────────
  /**
   * Filter deals within a given radius
   * @param {Array}  deals    - Array of deals with coordinates
   * @param {number} userLat
   * @param {number} userLng
   * @param {number} radiusKm - Radius in kilometers
   * @returns {Array} Filtered + sorted deals
   */
  filterWithinRadius(deals, userLat, userLng, radiusKm = 5) {
    return this.sortByDistance(deals, userLat, userLng)
      .filter(deal => deal.distance <= radiusKm);
  },

  // ─── Get Bounding Box ────────────────────────────────────────────────────────
  /**
   * Get a lat/lng bounding box for a radius around a point
   * Useful for rough pre-filtering before exact Haversine
   * @returns {{ minLat, maxLat, minLng, maxLng }}
   */
  getBoundingBox(lat, lng, radiusKm) {
    const latDelta = radiusKm / this.EARTH_RADIUS_KM * (180 / Math.PI);
    const lngDelta = radiusKm / (this.EARTH_RADIUS_KM * Math.cos((lat * Math.PI) / 180)) * (180 / Math.PI);

    return {
      minLat: lat - latDelta,
      maxLat: lat + latDelta,
      minLng: lng - lngDelta,
      maxLng: lng + lngDelta
    };
  },

  // ─── Is Within Radius ────────────────────────────────────────────────────────
  /**
   * Check if a point is within a given radius
   * @returns {boolean}
   */
  isWithinRadius(lat1, lng1, lat2, lng2, radiusKm) {
    return this.distance(lat1, lng1, lat2, lng2) <= radiusKm;
  },

  // ─── Midpoint ────────────────────────────────────────────────────────────────
  /**
   * Calculate the geographic midpoint between two coordinates
   * @returns {{ lat, lng }}
   */
  midpoint(lat1, lng1, lat2, lng2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;

    const dLng = toRad(lng2 - lng1);
    const rLat1 = toRad(lat1);
    const rLat2 = toRad(lat2);
    const rLng1 = toRad(lng1);

    const bx = Math.cos(rLat2) * Math.cos(dLng);
    const by = Math.cos(rLat2) * Math.sin(dLng);

    const midLat = Math.atan2(
      Math.sin(rLat1) + Math.sin(rLat2),
      Math.sqrt((Math.cos(rLat1) + bx) ** 2 + by ** 2)
    );
    const midLng = rLng1 + Math.atan2(by, Math.cos(rLat1) + bx);

    return { lat: toDeg(midLat), lng: toDeg(midLng) };
  },

  // ─── Bearing ─────────────────────────────────────────────────────────────────
  /**
   * Calculate compass bearing from point A to point B (0–360°)
   * @returns {number} Bearing in degrees
   */
  bearing(lat1, lng1, lat2, lng2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;

    const dLng = toRad(lng2 - lng1);
    const rLat1 = toRad(lat1);
    const rLat2 = toRad(lat2);

    const y = Math.sin(dLng) * Math.cos(rLat2);
    const x =
      Math.cos(rLat1) * Math.sin(rLat2) -
      Math.sin(rLat1) * Math.cos(rLat2) * Math.cos(dLng);

    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  },

  // ─── Direction Label ─────────────────────────────────────────────────────────
  /**
   * Get cardinal direction label from bearing
   * @returns {string} e.g. "NE", "SW"
   */
  directionFromBearing(bearing) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(bearing / 45) % 8];
  },

  // ─── Distance + Direction String ─────────────────────────────────────────────
  /**
   * Returns a human-readable distance + direction string
   * e.g. "1.2 km NE"
   */
  distanceWithDirection(lat1, lng1, lat2, lng2) {
    const dist = this.format(lat1, lng1, lat2, lng2);
    if (dist === 'Nearby') return dist;

    const b   = this.bearing(lat1, lng1, lat2, lng2);
    const dir = this.directionFromBearing(b);
    return `${dist} ${dir}`;
  },

  // ─── Deal Distance Label ─────────────────────────────────────────────────────
  /**
   * Get formatted distance label for a deal card
   * @param {Object} deal    - Deal with location.coordinates [lng, lat]
   * @param {number} userLat
   * @param {number} userLng
   * @returns {string}
   */
  dealDistance(deal, userLat, userLng) {
    const coords = deal?.location?.coordinates;
    if (!coords || coords.length < 2 || !userLat || !userLng) return '';
    const [lng, lat] = coords;
    return this.format(userLat, userLng, lat, lng);
  },

  // ─── Private: Get Nested Value ────────────────────────────────────────────────
  _getNestedValue(obj, path) {
    return path.split('.').reduce((acc, key) => acc?.[key], obj);
  }
};

// ─── Export ───────────────────────────────────────────────────────────────────
window.Haversine = Haversine;
