import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import giserConvertCrs, { GPS, ProjectionTransform, WKT } from '../src/giserConvertCrs.js';

const closeTo = (actual, expected, tolerance = 1e-7) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
};

describe('GPS Algorithms & Conversions', () => {
  const beijingWgs84 = [116.397, 39.908];

  it('WGS-84 <-> GCJ-02 high-precision reversibility', () => {
    const gcj = GPS.wgs84_gcj02(beijingWgs84[0], beijingWgs84[1]);
    const revWgs = GPS.gcj02_wgs84_precise(gcj[0], gcj[1]);
    closeTo(revWgs[0], beijingWgs84[0], 1e-10);
    closeTo(revWgs[1], beijingWgs84[1], 1e-10);
  });

  it('GCJ-02 <-> BD-09 analytical reversibility', () => {
    const gcj = GPS.wgs84_gcj02(beijingWgs84[0], beijingWgs84[1]);
    const bd09 = GPS.gcj02_bd09ll(gcj[0], gcj[1]);
    const revGcj = GPS.bd09ll_gcj02(bd09[0], bd09[1]);
    closeTo(revGcj[0], gcj[0], 1e-6);
    closeTo(revGcj[1], gcj[1], 1e-6);
  });

  it('GCJ-02 <-> BD-09 high-precision reversibility', () => {
    const gcj = GPS.wgs84_gcj02(beijingWgs84[0], beijingWgs84[1]);
    const bd09 = GPS.gcj02_bd09ll(gcj[0], gcj[1]);
    const revGcj = GPS.bd09ll_gcj02_precise(bd09[0], bd09[1]);
    closeTo(revGcj[0], gcj[0], 1e-10);
    closeTo(revGcj[1], gcj[1], 1e-10);
  });

  it('WGS-84 <-> BD-09 direct conversion', () => {
    const bd09 = GPS.wgs84_bd09ll(beijingWgs84[0], beijingWgs84[1]);
    const revWgs = GPS.bd09ll_wgs84_precise(bd09[0], bd09[1]);
    closeTo(revWgs[0], beijingWgs84[0], 1e-10);
    closeTo(revWgs[1], beijingWgs84[1], 1e-10);
  });

  it('Web Mercator (EPSG:3857) forward and inverse conversion', () => {
    const [x, y] = GPS.wgs84_epsg3857(beijingWgs84[0], beijingWgs84[1]);
    assert.ok(x > 12000000 && y > 4000000, 'Mercator coordinates should be large plane meters');
    const [revLon, revLat] = GPS.epsg3857_wgs84(x, y);
    closeTo(revLon, beijingWgs84[0], 1e-7);
    closeTo(revLat, beijingWgs84[1], 1e-7);
  });

  it('GCJ-02 <-> EPSG:3857 conversion', () => {
    const gcj = GPS.wgs84_gcj02(beijingWgs84[0], beijingWgs84[1]);
    const [x, y] = GPS.gcj02_epsg3857(gcj[0], gcj[1]);
    const revGcj = GPS.epsg3857_gcj02(x, y);
    closeTo(revGcj[0], gcj[0], 1e-7);
    closeTo(revGcj[1], gcj[1], 1e-7);
  });

  it('BD-09 <-> EPSG:3857 conversion', () => {
    const bd = GPS.wgs84_bd09ll(beijingWgs84[0], beijingWgs84[1]);
    const [x, y] = GPS.bd09ll_epsg3857(bd[0], bd[1]);
    const revBd = GPS.epsg3857_bd09ll(x, y);
    closeTo(revBd[0], bd[0], 1e-10);
    closeTo(revBd[1], bd[1], 1e-10);
  });

  it('outOfChina boundary detection with lat/lon and coord array', () => {
    assert.equal(GPS.outOfChina(39.908, 116.397), false);
    assert.equal(GPS.outOfChina([116.397, 39.908]), false);
    assert.equal(GPS.outOfChina(40.7128, -74.006), true);
    assert.equal(GPS.outOfChina([-74.006, 40.7128]), true);
  });

  it('rejects invalid non-finite coordinates', () => {
    assert.throws(() => GPS.wgs84_gcj02(NaN, 39.9), /Invalid coordinate/);
    assert.throws(() => GPS.epsg3857_wgs84(100, Infinity), /Invalid coordinate/);
  });
});

describe('ProjectionTransform Engine', () => {
  it('supports CGCS2000 / EPSG:4490 as WGS-84 alias', () => {
    const p1 = ProjectionTransform.transform([116.397, 39.908], 'EPSG:4490', 'gcj02');
    const p2 = ProjectionTransform.transform([116.397, 39.908], 'cgcs2000', 'gcj02');
    const p3 = ProjectionTransform.transform([116.397, 39.908], 'wgs84', 'gcj02');
    assert.deepEqual(p1, p3);
    assert.deepEqual(p2, p3);
  });

  it('supports EPSG:3857 alias and transformations', () => {
    const merc = ProjectionTransform.transform([116.397, 39.908], 'wgs84', 'EPSG:3857');
    const back = ProjectionTransform.transform(merc, '3857', 'wgs84');
    closeTo(back[0], 116.397, 1e-7);
    closeTo(back[1], 39.908, 1e-7);
  });

  it('supports 3D coordinate and preserves elevation', () => {
    const coord3D = ProjectionTransform.transform([116.397, 39.908, 150.5], 'wgs84', 'gcj02');
    assert.equal(coord3D[2], 150.5);
  });

  it('supports options.mutate for zero-copy in-place coordinate transformation', () => {
    const original = [
      [116.397, 39.908],
      [117.2, 40.1]
    ];
    const transformed = ProjectionTransform.transform(original, 'wgs84', 'gcj02', { mutate: true });
    assert.equal(transformed, original, 'transformed result should be the same array instance');
    assert.notEqual(original[0][0], 116.397, 'original coordinate should have been modified in place');
  });

  it('updates GeoJSON bbox during transformation', () => {
    const featureWithBbox = {
      type: 'Feature',
      bbox: [116.0, 39.0, 117.0, 40.0],
      properties: { test: 123 },
      geometry: {
        type: 'Point',
        coordinates: [116.5, 39.5]
      }
    };
    const res = ProjectionTransform.transform(featureWithBbox, 'wgs84', 'gcj02');
    assert.ok(Array.isArray(res.bbox), 'bbox should exist');
    assert.notEqual(res.bbox[0], 116.0, 'bbox minX should be transformed');
    assert.ok(res.bbox[0] < res.bbox[2], 'minX should be less than maxX');
  });

  it('transforms GeoJSON GeometryCollection', () => {
    const gc = {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Point', coordinates: [116.397, 39.908] },
        { type: 'LineString', coordinates: [[116, 39], [117, 40]] }
      ]
    };
    const transformed = ProjectionTransform.transform(gc, 'wgs84', 'gcj02');
    assert.equal(transformed.geometries.length, 2);
    assert.notEqual(transformed.geometries[0].coordinates[0], 116.397);
  });
});

describe('WKT Parser & Stringifier', () => {
  it('parses and stringifies basic geometries', () => {
    const wktPoint = 'POINT(116.397 39.908)';
    const parsed = WKT.parse(wktPoint);
    assert.equal(parsed.type, 'Point');
    assert.deepEqual(parsed.coordinates, [116.397, 39.908]);
    assert.equal(WKT.stringify(parsed), 'POINT(116.397 39.908)');
  });

  it('parses and stringifies GEOMETRYCOLLECTION', () => {
    const wkt = 'GEOMETRYCOLLECTION(POINT(116 39), LINESTRING(116 39, 117 40))';
    const parsed = WKT.parse(wkt);
    assert.equal(parsed.type, 'GeometryCollection');
    assert.equal(parsed.geometries.length, 2);
    assert.equal(parsed.geometries[0].type, 'Point');
    assert.equal(parsed.geometries[1].type, 'LineString');

    const str = WKT.stringify(parsed);
    assert.equal(str, 'GEOMETRYCOLLECTION(POINT(116 39), LINESTRING(116 39, 117 40))');
  });

  it('supports GEOMETRYCOLLECTION EMPTY', () => {
    const parsed = WKT.parse('GEOMETRYCOLLECTION EMPTY');
    assert.equal(parsed.type, 'GeometryCollection');
    assert.deepEqual(parsed.geometries, []);
    assert.equal(WKT.stringify(parsed), 'GEOMETRYCOLLECTION EMPTY');
  });

  it('supports precision parameter in WKT stringify', () => {
    const geom = {
      type: 'LineString',
      coordinates: [
        [116.3971234567, 39.9089876543],
        [117.123456789, 40.987654321]
      ]
    };
    const str = WKT.stringify(geom, { precision: 4 });
    assert.equal(str, 'LINESTRING(116.3971 39.909, 117.1235 40.9877)');
  });
});

describe('Unified giserConvertCrs Facade', () => {
  it('transforms string as WKT', () => {
    const res = giserConvertCrs.transform('LINESTRING(116 39, 117 40)', 'wgs84', 'gcj02');
    assert.ok(typeof res === 'string');
    assert.ok(res.startsWith('LINESTRING('));
  });

  it('transforms WKT with precision option', () => {
    const res = giserConvertCrs.transformWKT('POINT(116.397 39.908)', 'wgs84', 'gcj02', { precision: 4 });
    assert.ok(typeof res === 'string');
    assert.ok(res.startsWith('POINT('));
  });

  it('handles null and empty input gracefully', () => {
    assert.equal(giserConvertCrs.transform(null, 'wgs84', 'gcj02'), null);
    assert.equal(giserConvertCrs.transform('', 'wgs84', 'gcj02'), null);
    assert.equal(giserConvertCrs.transform(undefined, 'wgs84', 'gcj02'), null);
  });

  it('throws for unsupported CRS', () => {
    assert.throws(
      () => giserConvertCrs.transform([116, 39], 'wgs84', 'invalid-crs'),
      /Unsupported CRS/
    );
  });
});
