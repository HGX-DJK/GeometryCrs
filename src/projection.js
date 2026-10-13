import GPS from './gps.js';

const crs = {
  bd09ll: '+proj=longlat +datum=BD09',
  gcj02: '+proj=longlat +datum=GCJ02',
  wgs84: '+proj=longlat +datum=WGS84 +no_defs',
  cgcs2000: '+proj=longlat +ellps=GRS80 +no_defs',
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
  'cgcs 2000': 'wgs84',
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

/**
 * proj4 strings accepted as input, mapped to a `crs` key.
 *
 * Keys are matched after whitespace collapsing + lowercasing, so the many
 * spellings of the same datum in the wild all resolve. Values are normalised
 * through `CRS_ALIASES` before use (CGCS2000 folds onto WGS-84 at民用精度).
 */
const PROJ4_TO_CRS = {
  [crs.wgs84]: 'wgs84',
  [crs.cgcs2000]: 'cgcs2000',
  [crs.gcj02]: 'gcj02',
  [crs.bd09ll]: 'bd09ll',
  [crs.epsg3857]: 'epsg3857',

  // common WGS-84 spellings
  '+proj=longlat +datum=wgs84': 'wgs84',
  '+proj=longlat +ellps=wgs84': 'wgs84',
  '+proj=longlat +ellps=wgs84 +no_defs': 'wgs84',
  '+proj=longlat +a=6378137 +b=6356752.314245 +no_defs': 'wgs84',
  '+proj=longlat +a=6378137 +b=6356752.314245 +no_defs +towgs84=0,0,0': 'wgs84',

  // common CGCS2000 / GRS80 spellings
  '+proj=longlat +ellps=grs80': 'cgcs2000',
  '+proj=longlat +ellps=grs80 +no_defs': 'cgcs2000',
  '+proj=longlat +ellps=grs80 +towgs84=0,0,0,0,0,0,0 +no_defs': 'cgcs2000',
  '+proj=longlat +a=6378137 +b=6356752.314140 +no_defs': 'cgcs2000',

  // GCJ-02 / BD-09 are not standard EPSG datum codes, but these appear in configs
  '+proj=longlat +ellps=wgs84 +nadgrids=@china': 'gcj02'
};

const ERR_COORD = 'Invalid coordinate: longitude and latitude must be finite numbers.';

/** ProjectionTransform scratch buffer, kept module-level to avoid per-point allocation. */
const _result = [0, 0];

/**
 * Explicit `precise` mapping, keyed by `<from>_<to>`.
 *
 * Only pairs whose datum shift has to be *inverted* appear here; everything
 * else is a forward formula that has no precision mode. Keeping this as a
 * table (rather than scattered `if`s) is what stops a new CRS pair from
 * silently inheriting the approximate inverse.
 */
const PRECISE_CORES = {
  gcj02_wgs84: GPS._into.gcj02_wgs84_precise,
  bd09ll_wgs84: GPS._into.bd09ll_wgs84_precise,
  bd09ll_gcj02: GPS._into.bd09ll_gcj02_precise
};

/** Fast counterparts used when `precise: false`. */
const FAST_CORES = {
  gcj02_epsg3857: (lon, lat, out) => GPS._into.gcj02_epsg3857(lon, lat, out, false),
  bd09ll_epsg3857: (lon, lat, out) => GPS._into.bd09ll_epsg3857(lon, lat, out, false)
};

function resolveInto(from, to, isPrecise) {
  const key = `${from}_${to}`;
  if (isPrecise) return PRECISE_CORES[key] || GPS._into[key];
  return FAST_CORES[key] || GPS._into[key];
}

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
        : coord => (coord.length > 2
          ? [Number(coord[0]), Number(coord[1]), ...coord.slice(2)]
          : [Number(coord[0]), Number(coord[1])]);
    }

    const into = resolveInto(from, to, isPrecise);
    if (typeof into !== 'function') {
      throw new Error(`Unsupported CRS transform: ${from} -> ${to}.`);
    }

    if (isMutate) {
      return coord => {
        const x = Number(coord[0]);
        const y = Number(coord[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(ERR_COORD);
        into(x, y, _result);
        coord[0] = _result[0];
        coord[1] = _result[1];
        return coord;
      };
    }

    return coord => {
      const x = Number(coord[0]);
      const y = Number(coord[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(ERR_COORD);
      into(x, y, _result);
      return coord.length > 2
        ? [_result[0], _result[1], ...coord.slice(2)]
        : [_result[0], _result[1]];
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

  /**
   * Resolves a proj4 definition to an internal CRS id, or `null`.
   * Always returns an id already folded through `CRS_ALIASES`.
   */
  _toCRS(proj) {
    if (typeof proj !== 'string') return null;

    const key = proj.trim().replace(/\s+/g, ' ').toLowerCase();
    let crsName = PROJ4_TO_CRS[key];

    if (!crsName) {
      // honour caller-extended `crs` entries
      for (const name in this.crs) {
        if (key === String(this.crs[name]).trim().replace(/\s+/g, ' ').toLowerCase()) {
          crsName = name;
          break;
        }
      }
    }

    return crsName ? (CRS_ALIASES[crsName] || crsName) : null;
  },

  /**
   * Structural position test only.
   *
   * Deliberately does *not* coerce with `Number()`: the coordinate
   * transformer validates and coerces once, so validating here too would
   * double the conversion cost on every point of a batch.
   */
  _isCoord(coordinate) {
    return Array.isArray(coordinate) &&
      coordinate.length >= 2 &&
      !Array.isArray(coordinate[0]) &&
      !Array.isArray(coordinate[1]);
  }
};

export default ProjectionTransform;