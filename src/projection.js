import GPS from './gps.js';

const crs = {
  bd09ll: '+proj=longlat +datum=BD09',
  gcj02: '+proj=longlat +datum=GCJ02',
  wgs84: '+proj=longlat +datum=WGS84 +no_defs',
  epsg3857: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs'
};

const CRS_ALIASES = {
  'bd-09': 'bd09ll',
  'bd09': 'bd09ll',
  'bd09ll': 'bd09ll',
  'bd-09ll': 'bd09ll',
  'epsg:4326': 'wgs84',
  'epsg4326': 'wgs84',
  '4326': 'wgs84',
  'cgcs2000': 'wgs84',
  'cgcs-2000': 'wgs84',
  'epsg:4490': 'wgs84',
  'epsg4490': 'wgs84',
  '4490': 'wgs84',
  'gcj-02': 'gcj02',
  'gcj02': 'gcj02',
  'wgs-84': 'wgs84',
  'wgs84': 'wgs84',
  'epsg:3857': 'epsg3857',
  'epsg3857': 'epsg3857',
  '3857': 'epsg3857',
  'epsg:900913': 'epsg3857',
  'epsg900913': 'epsg3857',
  '900913': 'epsg3857',
  'mercator': 'epsg3857',
  'webmercator': 'epsg3857'
};

const ProjectionTransform = {
  crs,

  transform(source, fromCRS, toCRS, options = {}) {
    if (source == null) return null;

    const from = this._normalizeCRS(fromCRS);
    const to = this._normalizeCRS(toCRS);
    const transformCoord = this._getCoordTransformer(from, to, options);

    if (this._isCoord(source)) {
      return transformCoord(source);
    }

    if (Array.isArray(source)) {
      return this._transformCoordinateTree(source, transformCoord, options);
    }

    return this._transformGeoJSON(source, transformCoord, options);
  },

  _getCoordTransformer(from, to, options = {}) {
    const isMutate = Boolean(options.mutate);
    const isPrecise = options.precise !== false;

    if (from === to) {
      return isMutate
        ? coord => coord
        : coord => [Number(coord[0]), Number(coord[1]), ...coord.slice(2)];
    }

    let method;
    if (isPrecise && (from === 'gcj02' || from === 'bd09ll') && to === 'wgs84') {
      method = `${from}_wgs84_precise`;
    } else {
      method = `${from}_${to}`;
    }

    const fn = GPS[method];
    if (typeof fn !== 'function') {
      throw new Error(`Unsupported CRS transform: ${from} -> ${to}.`);
    }

    if (isMutate) {
      return coord => {
        const x = Number(coord[0]);
        const y = Number(coord[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new Error('Invalid coordinate: longitude and latitude must be finite numbers.');
        }
        const [tx, ty] = fn.call(GPS, x, y);
        coord[0] = tx;
        coord[1] = ty;
        return coord;
      };
    }

    return coord => {
      const x = Number(coord[0]);
      const y = Number(coord[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error('Invalid coordinate: longitude and latitude must be finite numbers.');
      }
      const [tx, ty] = fn.call(GPS, x, y);
      return [tx, ty, ...coord.slice(2)];
    };
  },

  _transformGeoJSON(geoJSON, transformCoord, options = {}) {
    if (!geoJSON || typeof geoJSON !== 'object') {
      throw new Error('Invalid GeoJSON object.');
    }

    const result = options.mutate ? geoJSON : { ...geoJSON };

    if (Array.isArray(geoJSON.bbox)) {
      result.bbox = this._transformBbox(geoJSON.bbox, transformCoord);
    }

    if (geoJSON.type === 'Feature') {
      result.geometry = geoJSON.geometry
        ? this._transformGeoJSON(geoJSON.geometry, transformCoord, options)
        : null;
      return result;
    }

    if (geoJSON.type === 'FeatureCollection') {
      if (!Array.isArray(geoJSON.features)) {
        throw new Error('Invalid FeatureCollection: features must be an array.');
      }
      if (options.mutate) {
        for (let i = 0; i < geoJSON.features.length; i++) {
          geoJSON.features[i] = this._transformGeoJSON(geoJSON.features[i], transformCoord, options);
        }
        result.features = geoJSON.features;
      } else {
        result.features = geoJSON.features.map(f => this._transformGeoJSON(f, transformCoord, options));
      }
      return result;
    }

    if (geoJSON.type === 'GeometryCollection') {
      if (!Array.isArray(geoJSON.geometries)) {
        throw new Error('Invalid GeometryCollection: geometries must be an array.');
      }
      if (options.mutate) {
        for (let i = 0; i < geoJSON.geometries.length; i++) {
          geoJSON.geometries[i] = geoJSON.geometries[i]
            ? this._transformGeoJSON(geoJSON.geometries[i], transformCoord, options)
            : null;
        }
        result.geometries = geoJSON.geometries;
      } else {
        result.geometries = geoJSON.geometries.map(g => (g ? this._transformGeoJSON(g, transformCoord, options) : null));
      }
      return result;
    }

    if ('coordinates' in geoJSON) {
      result.coordinates = this._transformCoordinateTree(geoJSON.coordinates, transformCoord, options);
      return result;
    }

    throw new Error(`Unsupported GeoJSON type: ${geoJSON.type || 'unknown'}.`);
  },

  _transformCoordinateTree(coordinates, transformCoord, options = {}) {
    if (coordinates == null) return coordinates;
    if (this._isCoord(coordinates)) return transformCoord(coordinates);
    if (!Array.isArray(coordinates)) throw new Error('Invalid coordinates: expected coordinate array.');

    if (options.mutate) {
      for (let i = 0; i < coordinates.length; i++) {
        coordinates[i] = this._transformCoordinateTree(coordinates[i], transformCoord, options);
      }
      return coordinates;
    }

    return coordinates.map(item => this._transformCoordinateTree(item, transformCoord, options));
  },

  _transformBbox(bbox, transformCoord) {
    if (!Array.isArray(bbox) || (bbox.length !== 4 && bbox.length !== 6)) {
      return bbox;
    }

    if (bbox.length === 4) {
      const [minX, minY, maxX, maxY] = bbox;
      const p1 = transformCoord([minX, minY]);
      const p2 = transformCoord([maxX, maxY]);
      return [
        Math.min(p1[0], p2[0]),
        Math.min(p1[1], p2[1]),
        Math.max(p1[0], p2[0]),
        Math.max(p1[1], p2[1])
      ];
    }

    const [minX, minY, minZ, maxX, maxY, maxZ] = bbox;
    const p1 = transformCoord([minX, minY, minZ]);
    const p2 = transformCoord([maxX, maxY, maxZ]);
    return [
      Math.min(p1[0], p2[0]),
      Math.min(p1[1], p2[1]),
      minZ,
      Math.max(p1[0], p2[0]),
      Math.max(p1[1], p2[1]),
      maxZ
    ];
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
      !Array.isArray(coordinate[0]) &&
      !Array.isArray(coordinate[1]) &&
      Number.isFinite(Number(coordinate[0])) &&
      Number.isFinite(Number(coordinate[1]));
  }
};

export default ProjectionTransform;
