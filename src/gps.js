const PI = Math.PI;
const X_PI = PI * 3000.0 / 180.0;
const SEMI_MAJOR_AXIS = 6378245.0;
const ECCENTRICITY_SQUARED = 0.00669342162296594323;
const EPSG3857_RADIUS = 6378137.0;
const EPSG3857_MAX_LAT = 85.0511287798066;

const GPS = {
  PI,
  x_pi: X_PI,
  EARTH_RADIUS: EPSG3857_RADIUS,

  delta(lat, lon) {
    let dLat = this.transformLat(lon - 105.0, lat - 35.0);
    let dLon = this.transformLon(lon - 105.0, lat - 35.0);
    const radLat = lat / 180.0 * PI;
    const sinLat = Math.sin(radLat);
    const magic = 1 - ECCENTRICITY_SQUARED * sinLat * sinLat;
    const sqrtMagic = Math.sqrt(magic);

    dLat = (dLat * 180.0) / ((SEMI_MAJOR_AXIS * (1 - ECCENTRICITY_SQUARED)) / (magic * sqrtMagic) * PI);
    dLon = (dLon * 180.0) / (SEMI_MAJOR_AXIS / sqrtMagic * Math.cos(radLat) * PI);

    return { lat: dLat, lon: dLon };
  },

  wgs84_gcj02(wgsLon, wgsLat) {
    this._assertLonLat(wgsLon, wgsLat);
    if (this.outOfChina(wgsLat, wgsLon)) return [wgsLon, wgsLat];

    const d = this.delta(wgsLat, wgsLon);
    return [wgsLon + d.lon, wgsLat + d.lat];
  },

  gcj02_wgs84(gcjLon, gcjLat) {
    this._assertLonLat(gcjLon, gcjLat);
    if (this.outOfChina(gcjLat, gcjLon)) return [gcjLon, gcjLat];

    const d = this.delta(gcjLat, gcjLon);
    return [gcjLon - d.lon, gcjLat - d.lat];
  },

  gcj02_wgs84_precise(gcjLon, gcjLat) {
    this._assertLonLat(gcjLon, gcjLat);
    if (this.outOfChina(gcjLat, gcjLon)) return [gcjLon, gcjLat];

    let wgsLon = gcjLon;
    let wgsLat = gcjLat;

    for (let i = 0; i < 5; i++) {
      const [currLon, currLat] = this.wgs84_gcj02(wgsLon, wgsLat);
      const dLon = currLon - gcjLon;
      const dLat = currLat - gcjLat;
      wgsLon -= dLon;
      wgsLat -= dLat;
      if (Math.abs(dLon) < 1e-11 && Math.abs(dLat) < 1e-11) break;
    }

    return [wgsLon, wgsLat];
  },

  gcj02_bd09ll(gcjLon, gcjLat) {
    this._assertLonLat(gcjLon, gcjLat);
    const z = Math.sqrt(gcjLon * gcjLon + gcjLat * gcjLat) + 0.00002 * Math.sin(gcjLat * X_PI);
    const theta = Math.atan2(gcjLat, gcjLon) + 0.000003 * Math.cos(gcjLon * X_PI);
    return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006];
  },

  bd09ll_gcj02(bdLon, bdLat) {
    this._assertLonLat(bdLon, bdLat);
    const x = bdLon - 0.0065;
    const y = bdLat - 0.006;
    const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
    const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
    return [z * Math.cos(theta), z * Math.sin(theta)];
  },

  bd09ll_gcj02_precise(bdLon, bdLat) {
    let [gLon, gLat] = this.bd09ll_gcj02(bdLon, bdLat);
    for (let i = 0; i < 2; i++) {
      const [tBdLon, tBdLat] = this.gcj02_bd09ll(gLon, gLat);
      gLon -= (tBdLon - bdLon);
      gLat -= (tBdLat - bdLat);
    }
    return [gLon, gLat];
  },

  wgs84_bd09ll(wgsLon, wgsLat) {
    const gcj = this.wgs84_gcj02(wgsLon, wgsLat);
    return this.gcj02_bd09ll(gcj[0], gcj[1]);
  },

  bd09ll_wgs84(bdLon, bdLat) {
    const gcj = this.bd09ll_gcj02(bdLon, bdLat);
    return this.gcj02_wgs84(gcj[0], gcj[1]);
  },

  bd09ll_wgs84_precise(bdLon, bdLat) {
    const gcj = this.bd09ll_gcj02_precise(bdLon, bdLat);
    return this.gcj02_wgs84_precise(gcj[0], gcj[1]);
  },

  wgs84_epsg3857(lon, lat) {
    this._assertLonLat(lon, lat);
    const clampedLat = Math.max(-EPSG3857_MAX_LAT, Math.min(EPSG3857_MAX_LAT, lat));
    const x = lon * EPSG3857_RADIUS * PI / 180.0;
    const radLat = clampedLat * PI / 180.0;
    const y = EPSG3857_RADIUS * Math.log(Math.tan(PI / 4.0 + radLat / 2.0));
    return [x, y];
  },

  epsg3857_wgs84(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error('Invalid coordinate: x and y must be finite numbers.');
    }
    const lon = (x / (EPSG3857_RADIUS * PI)) * 180.0;
    const lat = (2.0 * Math.atan(Math.exp(y / EPSG3857_RADIUS)) - PI / 2.0) * 180.0 / PI;
    return [lon, lat];
  },

  gcj02_epsg3857(lon, lat) {
    const wgs = this.gcj02_wgs84_precise(lon, lat);
    return this.wgs84_epsg3857(wgs[0], wgs[1]);
  },

  epsg3857_gcj02(x, y) {
    const wgs = this.epsg3857_wgs84(x, y);
    return this.wgs84_gcj02(wgs[0], wgs[1]);
  },

  bd09ll_epsg3857(lon, lat) {
    const wgs = this.bd09ll_wgs84_precise(lon, lat);
    return this.wgs84_epsg3857(wgs[0], wgs[1]);
  },

  epsg3857_bd09ll(x, y) {
    const wgs = this.epsg3857_wgs84(x, y);
    return this.wgs84_bd09ll(wgs[0], wgs[1]);
  },

  outOfChina(lat, lon) {
    if (Array.isArray(lat)) {
      return this.outOfChina(lat[1], lat[0]);
    }
    return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
  },

  transformLat(x, y) {
    let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * PI) + 320.0 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
    return ret;
  },

  transformLon(x, y) {
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
    return ret;
  },

  gcj_encrypt(wgsLat, wgsLon) {
    const [lon, lat] = this.wgs84_gcj02(wgsLon, wgsLat);
    return { lat, lon };
  },

  _assertLonLat(lon, lat) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      throw new Error('Invalid coordinate: longitude and latitude must be finite numbers.');
    }
  }
};

export default GPS;
