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
const ERR_COORD_STRUCT =
  'Invalid coordinates: expected a position [lon, lat] or an (arbitrarily) nested array of positions. ' +
  'Null, empty or non-numeric entries are rejected instead of being silently skipped.';
const ERR_READONLY =
  'options.mutate requires writable coordinates; the input is frozen, sealed or otherwise read-only.';

/**
 * Segments sampled along each bbox edge when re-deriving a bounding box.
 *
 * Corners alone already bound the shifted box correctly for feature-scale
 * extents (sub-metre), because the GCJ/BD offsets vary smoothly. Measured on a
 * continental box (73E-135E / 18N-54N) the corner result was already within
 * ~19 m of the exact shifted extent, and raising the sample count gave
 * 13 m at 16/edge and 7 m at 32/edge — a poor trade against 20-130 extra
 * trig evaluations. The default therefore keeps the corner-only behaviour and
 * `options.bboxSamples` opts into tightening for large extents.
 */
const DEFAULT_BBOX_SAMPLES = 1;

/** ProjectionTransform scratch buffer, kept module-level to avoid per-point allocation. */
const _result = [0, 0];

/**
 * Strict ordinate test.
 *
 * Accepts real numbers and non-blank numeric strings (both are common in
 * GeoJSON scraped from spreadsheets or CSV). Everything else is rejected:
 * `Number(null)`, `Number('')`, `Number(true)` and `Number([])` are all
 * `0`/`1`, so a loose coercion silently turns malformed data into a valid
 * coordinate near Null Island instead of surfacing the problem.
 */
function isOrdinate(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed !== '' && Number.isFinite(Number(trimmed));
  }
  return false;
}

function toOrdinate(value) {
  return typeof value === 'number' ? value : Number(value.trim());
}

function describeType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

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

    // A `crs` member (removed by RFC 7946) would still advertise the *source*
    // datum after a shift, so downstream readers would place the feature in
    // the wrong location. It is dropped whenever the datum actually changes.
    const stripCrs = from !== to;

    if (this._isCoord(source)) {
      return transformCoord(source);
    }

    const objInfo = this._extractCoordObject(source);
    if (objInfo) {
      return this._transformCoordObject(source, objInfo, transformCoord, options);
    }

    if (Array.isArray(source)) {
      return this._transformCoordinateTree(source, transformCoord, options);
    }

    return this._transformGeoJSON(source, transformCoord, options, stripCrs);
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
        const x = toOrdinate(coord[0]);
        const y = toOrdinate(coord[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(ERR_COORD);
        into(x, y, _result);
        try {
          coord[0] = _result[0];
          coord[1] = _result[1];
        } catch {
          throw new Error(ERR_READONLY);
        }
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

  _transformGeoJSON(geoJSON, transformCoord, options = {}, stripCrs = false) {
    if (!geoJSON || typeof geoJSON !== 'object') {
      throw new Error(
        `Invalid input: expected a coordinate, a coordinate object or a GeoJSON object, received ${describeType(geoJSON)}.`
      );
    }

    const result = options.mutate ? geoJSON : { ...geoJSON };

    if (stripCrs && 'crs' in result) delete result.crs;

    if (Array.isArray(geoJSON.bbox)) {
      result.bbox = this._transformBbox(geoJSON.bbox, transformCoord, options.bboxSamples);
    } else if (geoJSON.bbox !== undefined) {
      throw new Error(`Invalid bbox: expected an array of 4 or 6 numbers, received ${describeType(geoJSON.bbox)}.`);
    }

    if (geoJSON.type === 'Feature') {
      result.geometry = geoJSON.geometry
        ? this._transformGeoJSON(geoJSON.geometry, transformCoord, options, stripCrs)
        : null;
      return result;
    }

    if (geoJSON.type === 'FeatureCollection') {
      if (!Array.isArray(geoJSON.features)) {
        throw new Error('Invalid FeatureCollection: features must be an array.');
      }
      if (options.mutate) {
        for (let i = 0; i < geoJSON.features.length; i++) {
          geoJSON.features[i] = this._transformGeoJSON(geoJSON.features[i], transformCoord, options, stripCrs);
        }
        result.features = geoJSON.features;
      } else {
        result.features = geoJSON.features.map(f => this._transformGeoJSON(f, transformCoord, options, stripCrs));
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
            ? this._transformGeoJSON(geoJSON.geometries[i], transformCoord, options, stripCrs)
            : null;
        }
        result.geometries = geoJSON.geometries;
      } else {
        result.geometries = geoJSON.geometries.map(g => (g ? this._transformGeoJSON(g, transformCoord, options, stripCrs) : null));
      }
      return result;
    }

    if (typeof geoJSON.type !== 'string') {
      throw new Error(
        'Invalid input: expected a GeoJSON object with a "type" field, or a coordinate object ' +
        'carrying lng/lat, lon/lat, longitude/latitude or x/y keys.'
      );
    }

    if ('coordinates' in geoJSON) {
      result.coordinates = this._transformCoordinateTree(geoJSON.coordinates, transformCoord, options);
      return result;
    }

    throw new Error(`Unsupported GeoJSON type: ${geoJSON.type}.`);
  },

  /**
   * Walks a coordinate tree of any nesting depth.
   *
   * `isRoot` marks the geometry's own `coordinates` slot: an empty array is
   * only meaningful there (`POINT EMPTY` parses to `coordinates: []`), while a
   * nested empty array is malformed input. Previously such nodes were returned
   * verbatim, so `[[], []]` and `[null, null]` "succeeded" without being
   * transformed at all — the caller got WGS-84 coordinates back while believing
   * a datum shift had been applied.
   */
  _transformCoordinateTree(coordinates, transformCoord, options = {}, isRoot = true) {
    if (this._isCoord(coordinates)) return transformCoord(coordinates);

    const objInfo = this._extractCoordObject(coordinates);
    if (objInfo) return this._transformCoordObject(coordinates, objInfo, transformCoord, options);

    if (!Array.isArray(coordinates)) throw new Error(ERR_COORD_STRUCT);

    if (coordinates.length === 0) {
      if (isRoot) return coordinates;
      throw new Error(ERR_COORD_STRUCT);
    }

    if (options.mutate) {
      for (let i = 0; i < coordinates.length; i++) {
        coordinates[i] = this._transformCoordinateTree(coordinates[i], transformCoord, options, false);
      }
      return coordinates;
    }

    return coordinates.map(item => this._transformCoordinateTree(item, transformCoord, options, false));
  },

  /**
   * Re-derives a bbox by transforming a sampled grid along its perimeter.
   *
   * Transforming only the two corner points bounds the shifted box correctly
   * at feature scale, because a datum shift is smooth over small extents. The
   * residual grows with box size: on a continental box the corner-only result
   * sat ~19 m outside the exact shifted extent, which can push a transformed
   * feature just past its own bbox. `options.bboxSamples` raises the sampling
   * density when that matters (16/edge -> ~13 m, 32/edge -> ~7 m).
   */
  _transformBbox(bbox, transformCoord, samples = DEFAULT_BBOX_SAMPLES) {
    if (!Array.isArray(bbox) || (bbox.length !== 4 && bbox.length !== 6)) {
      throw new Error(
        `Invalid bbox: expected 4 or 6 numbers, received ${Array.isArray(bbox) ? `${bbox.length} entries` : describeType(bbox)}.`
      );
    }

    const is3D = bbox.length === 6;
    const minX = bbox[0];
    const minY = bbox[1];
    const maxX = is3D ? bbox[3] : bbox[2];
    const maxY = is3D ? bbox[4] : bbox[3];

    const steps = Number.isFinite(samples) && samples >= 1 ? Math.min(64, Math.floor(samples)) : DEFAULT_BBOX_SAMPLES;

    let loX = Infinity;
    let loY = Infinity;
    let hiX = -Infinity;
    let hiY = -Infinity;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const edgeX = minX + (maxX - minX) * t;
      const edgeY = minY + (maxY - minY) * t;
      // both edges in one pass: bottom+top for x, left+right for y
      for (let axis = 0; axis < 2; axis++) {
        const p = transformCoord(axis === 0 ? [edgeX, minY] : [edgeX, maxY]);
        if (p[0] < loX) loX = p[0];
        if (p[0] > hiX) hiX = p[0];
        if (p[1] < loY) loY = p[1];
        if (p[1] > hiY) hiY = p[1];
        const q = transformCoord(axis === 0 ? [minX, edgeY] : [maxX, edgeY]);
        if (q[0] < loX) loX = q[0];
        if (q[0] > hiX) hiX = q[0];
        if (q[1] < loY) loY = q[1];
        if (q[1] > hiY) hiY = q[1];
      }
    }

    return is3D ? [loX, loY, bbox[2], hiX, hiY, bbox[5]] : [loX, loY, hiX, hiY];
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
   * Structural position test.
   *
   * Deliberately validates the ordinate *type* here rather than only shape:
   * a shape-only test routed `[null, null]` into the tree walker, which then
   * treated each `null` as a valid leaf and returned the input untransformed.
   * `isOrdinate` is a cheap `typeof` check, so the strictness costs nothing on
   * the hot path.
   */
  _isCoord(coordinate) {
    return Array.isArray(coordinate) &&
      coordinate.length >= 2 &&
      isOrdinate(coordinate[0]) &&
      isOrdinate(coordinate[1]);
  },

  _extractCoordObject(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    if (typeof obj.type === 'string') return null;

    const keys = Object.keys(obj);
    let lonKey = null;
    let latKey = null;

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const lk = k.toLowerCase();
      if (!lonKey && (lk === 'lng' || lk === 'lon' || lk === 'longitude' || lk === 'x')) {
        lonKey = k;
      } else if (!latKey && (lk === 'lat' || lk === 'latitude' || lk === 'y')) {
        latKey = k;
      }
    }

    if (!lonKey || !latKey) return null;
    if (!isOrdinate(obj[lonKey]) || !isOrdinate(obj[latKey])) return null;

    return { lonKey, latKey, lon: toOrdinate(obj[lonKey]), lat: toOrdinate(obj[latKey]) };
  },

  _isCoordObject(obj) {
    return this._extractCoordObject(obj) !== null;
  },

  _transformCoordObject(obj, info, transformCoord, options = {}) {
    const { lonKey, latKey, lon, lat } = info;
    const res = transformCoord([lon, lat]);
    if (options.mutate) {
      try {
        obj[lonKey] = res[0];
        obj[latKey] = res[1];
      } catch {
        throw new Error(ERR_READONLY);
      }
      return obj;
    }
    return {
      ...obj,
      [lonKey]: res[0],
      [latKey]: res[1]
    };
  }
};

export default ProjectionTransform;