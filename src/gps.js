const PI = Math.PI;
const X_PI = PI * 3000.0 / 180.0;
const SEMI_MAJOR_AXIS = 6378245.0;
const ECCENTRICITY_SQUARED = 0.00669342162296594323;

const GPS = {
  PI,
  x_pi: X_PI,

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

    const threshold = 0.000000001;
    let minLat = gcjLat - 0.01;
    let minLon = gcjLon - 0.01;
    let maxLat = gcjLat + 0.01;
    let maxLon = gcjLon + 0.01;
    let wgsLat = gcjLat;
    let wgsLon = gcjLon;

    for (let i = 0; i < 10000; i++) {
      wgsLat = (minLat + maxLat) / 2;
      wgsLon = (minLon + maxLon) / 2;
      const [tmpLon, tmpLat] = this.wgs84_gcj02(wgsLon, wgsLat);
      const dLat = tmpLat - gcjLat;
      const dLon = tmpLon - gcjLon;

      if (Math.abs(dLat) < threshold && Math.abs(dLon) < threshold) break;
      if (dLat > 0) maxLat = wgsLat;
      else minLat = wgsLat;
      if (dLon > 0) maxLon = wgsLon;
      else minLon = wgsLon;
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

  wgs84_bd09ll(wgsLon, wgsLat) {
    const gcj = this.wgs84_gcj02(wgsLon, wgsLat);
    return this.gcj02_bd09ll(gcj[0], gcj[1]);
  },

  bd09ll_wgs84(bdLon, bdLat) {
    const gcj = this.bd09ll_gcj02(bdLon, bdLat);
    return this.gcj02_wgs84(gcj[0], gcj[1]);
  },

  bd09ll_wgs84_precise(bdLon, bdLat) {
    const gcj = this.bd09ll_gcj02(bdLon, bdLat);
    return this.gcj02_wgs84_precise(gcj[0], gcj[1]);
  },

  outOfChina(lat, lon) {
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
