const PI = Math.PI;
const X_PI = PI * 3000.0 / 180.0;
const SEMI_MAJOR_AXIS = 6378245.0;
const ECCENTRICITY_SQUARED = 0.00669342162296594323;
const EPSG3857_RADIUS = 6378137.0;
const EPSG3857_MAX_LAT = 85.0511287798066;

const ERR_LONLAT = 'Invalid coordinate: longitude and latitude must be finite numbers.';
const ERR_PLANE = 'Invalid coordinate: x and y must be finite numbers.';

/**
 * Hot-path scratch buffers.
 *
 * Every write below is consumed within the same synchronous call frame
 * (never across an await / callback boundary), so sharing these buffers is
 * safe and removes the per-point allocations that dominated batch runs.
 */
const _delta = [0, 0];
const _forward = [0, 0];
const _back = [0, 0];

function assertLonLat(lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error(ERR_LONLAT);
  }
}

function assertPlane(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(ERR_PLANE);
  }
}

function outOfChina(lat, lon) {
  if (Array.isArray(lat)) {
    return outOfChina(lat[1], lat[0]);
  }
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * PI) + 320.0 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLon(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
  return ret;
}

/**
 * Writes the GCJ-02 offset for (lat, lon) into `out` as [dLat, dLon].
 * Allocation-free core of the public `delta()`.
 */
function deltaInto(lat, lon, out) {
  const x = lon - 105.0;
  const y = lat - 35.0;
  let dLat = transformLat(x, y);
  let dLon = transformLon(x, y);
  const radLat = lat / 180.0 * PI;
  const sinLat = Math.sin(radLat);
  const magic = 1 - ECCENTRICITY_SQUARED * sinLat * sinLat;
  const sqrtMagic = Math.sqrt(magic);

  out[0] = (dLat * 180.0) / ((SEMI_MAJOR_AXIS * (1 - ECCENTRICITY_SQUARED)) / (magic * sqrtMagic) * PI);
  out[1] = (dLon * 180.0) / (SEMI_MAJOR_AXIS / sqrtMagic * Math.cos(radLat) * PI);
}

function delta(lat, lon) {
  deltaInto(lat, lon, _delta);
  return { lat: _delta[0], lon: _delta[1] };
}

/* ------------------------------------------------------------------ *
 * Allocation-free transform cores: (lon, lat, out) => out
 * ------------------------------------------------------------------ */

function wgs84_gcj02Into(wgsLon, wgsLat, out) {
  if (outOfChina(wgsLat, wgsLon)) {
    out[0] = wgsLon;
    out[1] = wgsLat;
    return out;
  }
  deltaInto(wgsLat, wgsLon, _delta);
  out[0] = wgsLon + _delta[1];
  out[1] = wgsLat + _delta[0];
  return out;
}

function gcj02_wgs84Into(gcjLon, gcjLat, out) {
  if (outOfChina(gcjLat, gcjLon)) {
    out[0] = gcjLon;
    out[1] = gcjLat;
    return out;
  }
  deltaInto(gcjLat, gcjLon, _delta);
  out[0] = gcjLon - _delta[1];
  out[1] = gcjLat - _delta[0];
  return out;
}

function gcj02_wgs84_preciseInto(gcjLon, gcjLat, out) {
  if (outOfChina(gcjLat, gcjLon)) {
    out[0] = gcjLon;
    out[1] = gcjLat;
    return out;
  }

  let wgsLon = gcjLon;
  let wgsLat = gcjLat;

  for (let i = 0; i < 5; i++) {
    wgs84_gcj02Into(wgsLon, wgsLat, _forward);
    const dLon = _forward[0] - gcjLon;
    const dLat = _forward[1] - gcjLat;
    wgsLon -= dLon;
    wgsLat -= dLat;
    if (Math.abs(dLon) < 1e-11 && Math.abs(dLat) < 1e-11) break;
  }

  out[0] = wgsLon;
  out[1] = wgsLat;
  return out;
}

function gcj02_bd09llInto(gcjLon, gcjLat, out) {
  const z = Math.sqrt(gcjLon * gcjLon + gcjLat * gcjLat) + 0.00002 * Math.sin(gcjLat * X_PI);
  const theta = Math.atan2(gcjLat, gcjLon) + 0.000003 * Math.cos(gcjLon * X_PI);
  out[0] = z * Math.cos(theta) + 0.0065;
  out[1] = z * Math.sin(theta) + 0.006;
  return out;
}

function bd09ll_gcj02Into(bdLon, bdLat, out) {
  const x = bdLon - 0.0065;
  const y = bdLat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
  out[0] = z * Math.cos(theta);
  out[1] = z * Math.sin(theta);
  return out;
}

function bd09ll_gcj02_preciseInto(bdLon, bdLat, out) {
  bd09ll_gcj02Into(bdLon, bdLat, out);
  let gLon = out[0];
  let gLat = out[1];
  for (let i = 0; i < 2; i++) {
    gcj02_bd09llInto(gLon, gLat, _back);
    gLon -= (_back[0] - bdLon);
    gLat -= (_back[1] - bdLat);
  }
  out[0] = gLon;
  out[1] = gLat;
  return out;
}

function wgs84_epsg3857Into(lon, lat, out) {
  const clampedLat = Math.max(-EPSG3857_MAX_LAT, Math.min(EPSG3857_MAX_LAT, lat));
  const x = lon * EPSG3857_RADIUS * PI / 180.0;
  const radLat = clampedLat * PI / 180.0;
  out[0] = x;
  out[1] = EPSG3857_RADIUS * Math.log(Math.tan(PI / 4.0 + radLat / 2.0));
  return out;
}

function epsg3857_wgs84Into(x, y, out) {
  out[0] = (x / (EPSG3857_RADIUS * PI)) * 180.0;
  out[1] = (2.0 * Math.atan(Math.exp(y / EPSG3857_RADIUS)) - PI / 2.0) * 180.0 / PI;
  return out;
}

/**
 * GCJ-02 -> EPSG:3857. The datum shift is inverted before projecting, so
 * `precise` selects the fixed-point inverse instead of the fast one-off
 * approximation — mirroring `gcj02_wgs84_precise`. Defaults to `true`.
 */
function gcj02_epsg3857Into(lon, lat, out, precise = true) {
  (precise ? gcj02_wgs84_preciseInto : gcj02_wgs84Into)(lon, lat, _back);
  return wgs84_epsg3857Into(_back[0], _back[1], out);
}

/** BD-09 -> EPSG:3857. `precise` behaves as in {@link gcj02_epsg3857Into}. */
function bd09ll_epsg3857Into(lon, lat, out, precise = true) {
  if (precise) {
    bd09ll_gcj02_preciseInto(lon, lat, _forward);
    gcj02_wgs84_preciseInto(_forward[0], _forward[1], _back);
    return wgs84_epsg3857Into(_back[0], _back[1], out);
  }
  bd09ll_gcj02Into(lon, lat, _forward);
  gcj02_wgs84Into(_forward[0], _forward[1], _back);
  return wgs84_epsg3857Into(_back[0], _back[1], out);
}

function wgs84_bd09llInto(wgsLon, wgsLat, out) {
  wgs84_gcj02Into(wgsLon, wgsLat, _forward);
  return gcj02_bd09llInto(_forward[0], _forward[1], out);
}

function bd09ll_wgs84Into(bdLon, bdLat, out) {
  bd09ll_gcj02Into(bdLon, bdLat, _forward);
  return gcj02_wgs84Into(_forward[0], _forward[1], out);
}

function bd09ll_wgs84_preciseInto(bdLon, bdLat, out) {
  bd09ll_gcj02_preciseInto(bdLon, bdLat, _forward);
  return gcj02_wgs84_preciseInto(_forward[0], _forward[1], out);
}

function epsg3857_gcj02Into(x, y, out) {
  epsg3857_wgs84Into(x, y, _forward);
  return wgs84_gcj02Into(_forward[0], _forward[1], out);
}

function epsg3857_bd09llInto(x, y, out) {
  epsg3857_wgs84Into(x, y, _forward);
  return wgs84_bd09llInto(_forward[0], _forward[1], out);
}

/* ------------------------------------------------------------------ *
 * Public array-returning API (validated at the boundary)
 * ------------------------------------------------------------------ */

/** Validates then delegates to an allocation-free core. */
const expose = (into, validate = assertLonLat) => (lon, lat) => {
  validate(lon, lat);
  return into(lon, lat, [0, 0]);
};

const wgs84_gcj02 = expose(wgs84_gcj02Into);
const gcj02_wgs84 = expose(gcj02_wgs84Into);
const gcj02_wgs84_precise = expose(gcj02_wgs84_preciseInto);
const gcj02_bd09ll = expose(gcj02_bd09llInto);
const bd09ll_gcj02 = expose(bd09ll_gcj02Into);
const bd09ll_gcj02_precise = expose(bd09ll_gcj02_preciseInto);
const wgs84_bd09ll = expose(wgs84_bd09llInto);
const bd09ll_wgs84 = expose(bd09ll_wgs84Into);
const bd09ll_wgs84_precise = expose(bd09ll_wgs84_preciseInto);
const wgs84_epsg3857 = expose(wgs84_epsg3857Into);
const epsg3857_wgs84 = expose(epsg3857_wgs84Into, assertPlane);
const epsg3857_gcj02 = expose(epsg3857_gcj02Into, assertPlane);
const epsg3857_bd09ll = expose(epsg3857_bd09llInto, assertPlane);

const gcj02_epsg3857 = (lon, lat, precise = true) => {
  assertLonLat(lon, lat);
  return gcj02_epsg3857Into(lon, lat, [0, 0], precise);
};

const bd09ll_epsg3857 = (lon, lat, precise = true) => {
  assertLonLat(lon, lat);
  return bd09ll_epsg3857Into(lon, lat, [0, 0], precise);
};

/**
 * WGS-84 -> GCJ-02 as `[lon, lat]`, matching every other entry point.
 * Previously took `(lat, lon)` and returned a `{ lat, lon }` object.
 */
function gcj_encrypt(wgsLon, wgsLat) {
  return wgs84_gcj02(wgsLon, wgsLat);
}

const GPS = {
  PI,
  x_pi: X_PI,
  EARTH_RADIUS: EPSG3857_RADIUS,

  delta,
  transformLat,
  transformLon,
  outOfChina,

  wgs84_gcj02,
  gcj02_wgs84,
  gcj02_wgs84_precise,
  gcj02_bd09ll,
  bd09ll_gcj02,
  bd09ll_gcj02_precise,
  wgs84_bd09ll,
  bd09ll_wgs84,
  bd09ll_wgs84_precise,
  wgs84_epsg3857,
  epsg3857_wgs84,
  gcj02_epsg3857,
  epsg3857_gcj02,
  bd09ll_epsg3857,
  epsg3857_bd09ll,

  gcj_encrypt,

  /** @deprecated internal helper, kept so existing callers keep working. */
  _assertLonLat: assertLonLat
};

/**
 * Allocation-free cores keyed by `<from>_<to>`, consumed by
 * ProjectionTransform so batch runs never allocate a result array.
 */
GPS._into = {
  wgs84_gcj02: wgs84_gcj02Into,
  gcj02_wgs84: gcj02_wgs84Into,
  gcj02_wgs84_precise: gcj02_wgs84_preciseInto,
  gcj02_bd09ll: gcj02_bd09llInto,
  bd09ll_gcj02: bd09ll_gcj02Into,
  bd09ll_gcj02_precise: bd09ll_gcj02_preciseInto,
  wgs84_bd09ll: wgs84_bd09llInto,
  bd09ll_wgs84: bd09ll_wgs84Into,
  bd09ll_wgs84_precise: bd09ll_wgs84_preciseInto,
  wgs84_epsg3857: wgs84_epsg3857Into,
  epsg3857_wgs84: epsg3857_wgs84Into,
  gcj02_epsg3857: gcj02_epsg3857Into,
  epsg3857_gcj02: epsg3857_gcj02Into,
  bd09ll_epsg3857: bd09ll_epsg3857Into,
  epsg3857_bd09ll: epsg3857_bd09llInto
};

export default GPS;