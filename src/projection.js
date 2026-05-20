import GPS from './gps.js';

const crs = {
  bd09ll: '+proj=longlat +datum=BD09',
  gcj02: '+proj=longlat +datum=GCJ02',
  wgs84: '+proj=longlat +datum=WGS84 +no_defs'
};

const CRS_ALIASES = {
  'bd-09': 'bd09ll',
  'bd09': 'bd09ll',
  'bd09ll': 'bd09ll',
  'epsg:4326': 'wgs84',
  'gcj-02': 'gcj02',
  'gcj02': 'gcj02',
  'wgs-84': 'wgs84',
  'wgs84': 'wgs84'
};

const ProjectionTransform = {
  crs,

  transform(source, fromCRS, toCRS) {
    if (source == null) return null;

    const from = this._normalizeCRS(fromCRS);
    const to = this._normalizeCRS(toCRS);

    if (this._isCoord(source)) {
      return this._transformCoordinate(source, from, to);
    }

    if (Array.isArray(source)) {
      return this._transformCoordinateTree(source, from, to);
    }

    return this._transformGeoJSON(source, from, to);
  },

  _transformGeoJSON(geoJSON, fromCRS, toCRS) {
    if (!geoJSON || typeof geoJSON !== 'object') {
      throw new Error('Invalid GeoJSON object.');
    }

    if (geoJSON.type === 'Feature') {
      return {
        ...geoJSON,
        geometry: geoJSON.geometry ? this.transform(geoJSON.geometry, fromCRS, toCRS) : null
      };
    }

    if (geoJSON.type === 'FeatureCollection') {
      if (!Array.isArray(geoJSON.features)) throw new Error('Invalid FeatureCollection: features must be an array.');
      return {
        ...geoJSON,
        features: geoJSON.features.map(feature => this.transform(feature, fromCRS, toCRS))
      };
    }

    if (geoJSON.type === 'GeometryCollection') {
      if (!Array.isArray(geoJSON.geometries)) throw new Error('Invalid GeometryCollection: geometries must be an array.');
      return {
        ...geoJSON,
        geometries: geoJSON.geometries.map(geometry => this.transform(geometry, fromCRS, toCRS))
      };
    }

    if ('coordinates' in geoJSON) {
      return {
        ...geoJSON,
        coordinates: this._transformCoordinateTree(geoJSON.coordinates, fromCRS, toCRS)
      };
    }

    throw new Error(`Unsupported GeoJSON type: ${geoJSON.type || 'unknown'}.`);
  },

  _transformCoordinateTree(coordinates, fromCRS, toCRS) {
    if (coordinates == null) return coordinates;
    if (this._isCoord(coordinates)) return this._transformCoordinate(coordinates, fromCRS, toCRS);
    if (!Array.isArray(coordinates)) throw new Error('Invalid coordinates: expected coordinate array.');
    return coordinates.map(item => this._transformCoordinateTree(item, fromCRS, toCRS));
  },

  _transformCoordinate(coordinate, fromCRS, toCRS) {
    const from = this._normalizeCRS(fromCRS);
    const to = this._normalizeCRS(toCRS);
    const lon = Number(coordinate[0]);
    const lat = Number(coordinate[1]);

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      throw new Error('Invalid coordinate: longitude and latitude must be finite numbers.');
    }

    if (from === to) return [lon, lat, ...coordinate.slice(2)];

    const method = `${from}_${to}`;
    if (typeof GPS[method] !== 'function') {
      throw new Error(`Unsupported CRS transform: ${fromCRS} -> ${toCRS}.`);
    }

    const transformed = GPS[method](lon, lat);
    return [transformed[0], transformed[1], ...coordinate.slice(2)];
  },

  _normalizeCRS(value) {
    if (!value) throw new Error('must provide a valid fromCRS and toCRS.');

    if (typeof value === 'object') {
      if (value.type === 'proj4' && value.properties && value.properties.proj) {
        const crsName = this._toCRS(value.properties.proj);
        if (crsName) return crsName;
      }
      throw new Error('Unsupported CRS object.');
    }

    const key = String(value).trim().toLowerCase();
    const normalized = CRS_ALIASES[key];
    if (!normalized) throw new Error(`Unsupported CRS: ${value}.`);
    return normalized;
  },

  _toCRS(proj) {
    for (const key in this.crs) {
      if (proj === this.crs[key]) return key;
    }
    return null;
  },

  _isCoord(coordinate) {
    return Array.isArray(coordinate) &&
      coordinate.length >= 2 &&
      Number.isFinite(Number(coordinate[0])) &&
      Number.isFinite(Number(coordinate[1])) &&
      !Array.isArray(coordinate[0]) &&
      !Array.isArray(coordinate[1]);
  }
};

export default ProjectionTransform;
