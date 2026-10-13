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

describe('Regression: options.precise reaches EPSG:3857 paths', () => {
  const gcj = GPS.wgs84_gcj02(116.397, 39.908);
  const bd = GPS.gcj02_bd09ll(gcj[0], gcj[1]);

  it('precise:false actually changes gcj02 -> EPSG:3857', () => {
    const precise = ProjectionTransform.transform([gcj[0], gcj[1]], 'gcj02', 'EPSG:3857', { precise: true });
    const fast = ProjectionTransform.transform([gcj[0], gcj[1]], 'gcj02', 'EPSG:3857', { precise: false });
    assert.notDeepEqual(fast, precise, 'precise:false must not be silently ignored');

    // and it must agree with the approximate inverse + projection
    const approxWgs = GPS.gcj02_wgs84(gcj[0], gcj[1]);
    const expected = GPS.wgs84_epsg3857(approxWgs[0], approxWgs[1]);
    closeTo(fast[0], expected[0], 1e-6);
    closeTo(fast[1], expected[1], 1e-6);
  });

  it('precise:false actually changes bd09ll -> EPSG:3857', () => {
    const precise = ProjectionTransform.transform([bd[0], bd[1]], 'bd09ll', 'EPSG:3857', { precise: true });
    const fast = ProjectionTransform.transform([bd[0], bd[1]], 'bd09ll', 'EPSG:3857', { precise: false });
    assert.notDeepEqual(fast, precise);
  });

  it('precise:true remains the default and is bit-identical to no flag', () => {
    const withFlag = ProjectionTransform.transform([gcj[0], gcj[1]], 'gcj02', 'EPSG:3857', { precise: true });
    const without = ProjectionTransform.transform([gcj[0], gcj[1]], 'gcj02', 'EPSG:3857');
    assert.deepEqual(withFlag, without);
  });

  it('precise inverse keeps sub-millimetre accuracy on EPSG:3857', () => {
    const back = ProjectionTransform.transform(
      ProjectionTransform.transform([gcj[0], gcj[1]], 'gcj02', 'EPSG:3857'),
      'EPSG:3857', 'gcj02'
    );
    closeTo(back[0], gcj[0], 1e-10);
    closeTo(back[1], gcj[1], 1e-10);
  });
});

describe('Regression: CGCS2000 proj4 support', () => {
  const wgsResult = ProjectionTransform.transform([116.397, 39.908], 'wgs84', 'gcj02');
  const asProj4 = (proj) => ({ type: 'proj4', properties: { proj } });

  it('accepts the standard CGCS2000 proj4 definition', () => {
    const res = ProjectionTransform.transform(
      [116.397, 39.908],
      asProj4('+proj=longlat +ellps=GRS80 +no_defs'),
      'gcj02'
    );
    assert.deepEqual(res, wgsResult);
  });

  it('accepts the canonical WGS-84 proj4 definitions', () => {
    for (const proj of [
      '+proj=longlat +ellps=WGS84 +no_defs',
      '+proj=longlat +ellps=WGS84',
      '+proj=longlat +datum=WGS84',
      '+proj=longlat +a=6378137 +b=6356752.314245 +no_defs'
    ]) {
      const res = ProjectionTransform.transform([116.397, 39.908], asProj4(proj), 'gcj02');
      assert.deepEqual(res, wgsResult, `proj4 variant should resolve: ${proj}`);
    }
  });

  it('tolerates irregular whitespace and casing in proj4 strings', () => {
    const res = ProjectionTransform.transform(
      [116.397, 39.908],
      asProj4('  +PROJ=longlat   +ELLPS=GRS80  +NO_DEFS '),
      'gcj02'
    );
    assert.deepEqual(res, wgsResult);
  });

  it('folds CGCS2000 onto WGS-84 as a no-op transform', () => {
    // Both aliases resolve to the same datum, so this must be identity.
    const res = ProjectionTransform.transform(
      [116.397, 39.908],
      'EPSG:4490',
      asProj4('+proj=longlat +ellps=GRS80 +no_defs')
    );
    assert.deepEqual(res, [116.397, 39.908]);
  });

  it('still rejects genuinely unknown CRS objects', () => {
    assert.throws(
      () => ProjectionTransform.transform([116, 39], 'EPSG:4326', asProj4('+proj=nonsense')),
      /Unsupported CRS object/
    );
  });

  it('exposes a canonical proj4 entry for cgcs2000', () => {
    assert.equal(typeof ProjectionTransform.crs.cgcs2000, 'string');
  });
});

describe('Regression: API convention consistency', () => {
  it('gcj_encrypt matches wgs84_gcj02 and returns [lon, lat]', () => {
    const viaEncrypt = GPS.gcj_encrypt(116.397, 39.908);
    const viaForward = GPS.wgs84_gcj02(116.397, 39.908);
    assert.ok(Array.isArray(viaEncrypt), 'should return an array like every other method');
    assert.deepEqual(viaEncrypt, viaForward);
  });

  it('treats blank WKT input as "no geometry" rather than throwing', () => {
    assert.equal(giserConvertCrs.transform('   ', 'wgs84', 'gcj02'), null);
    assert.equal(giserConvertCrs.transform('', 'wgs84', 'gcj02'), null);
    assert.equal(giserConvertCrs.transform('\n\t ', 'wgs84', 'gcj02'), null);
  });
});

describe('In-place transformation of nested structures', () => {
  it('mutates a FeatureCollection without cloning geometries', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: null, geometry: { type: 'Point', coordinates: [116.397, 39.908] } },
        { type: 'Feature', properties: null, geometry: { type: 'LineString', coordinates: [[116, 39], [117, 40]] } }
      ]
    };
    const geometryBefore = fc.features[0].geometry;
    const coordBefore = fc.features[0].geometry.coordinates;

    const res = ProjectionTransform.transform(fc, 'wgs84', 'gcj02', { mutate: true });

    assert.equal(res, fc, 'root object should be reused');
    assert.equal(res.features[0].geometry, geometryBefore, 'geometry object should be reused');
    assert.equal(res.features[0].geometry.coordinates, coordBefore, 'coordinate array should be reused');
    assert.notEqual(coordBefore[0], 116.397, 'coordinate should have been rewritten in place');
  });

  it('non-mutate leaves the source untouched', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: null, geometry: { type: 'Point', coordinates: [116.397, 39.908] } }
      ]
    };
    const res = ProjectionTransform.transform(fc, 'wgs84', 'gcj02');
    assert.deepEqual(fc.features[0].geometry.coordinates, [116.397, 39.908]);
    assert.notEqual(res.features[0].geometry.coordinates[0], 116.397);
  });
});

describe('Round-trip property tests', () => {
  const pairs = [
    ['wgs84', 'gcj02'],
    ['gcj02', 'wgs84'],
    ['gcj02', 'bd09ll'],
    ['bd09ll', 'gcj02'],
    ['wgs84', 'EPSG:3857'],
    ['EPSG:3857', 'wgs84']
  ];

  it('every supported pair round-trips across China within 1e-9 deg', () => {
    for (const [from, to] of pairs) {
      let worst = 0;
      for (let i = 0; i < 400; i++) {
        const lon = 73 + (i % 40) * 1.5;
        const lat = 18 + (i % 30) * 1.1;
        const a = ProjectionTransform.transform([lon, lat], 'wgs84', from);
        const b = ProjectionTransform.transform(a, from, to);
        const back = ProjectionTransform.transform(b, to, 'wgs84');
        worst = Math.max(worst, Math.abs(back[0] - lon), Math.abs(back[1] - lat));
      }
      assert.ok(worst <= 1e-9, `${from} -> ${to} round-trip drifted by ${worst}`);
    }
  });

  it('out-of-China coordinates pass through untouched', () => {
    for (const p of [[-74.006, 40.7128], [139.6917, 35.6895], [2.3522, 48.8566], [151.2093, -33.8688]]) {
      const out = ProjectionTransform.transform(p, 'wgs84', 'gcj02');
      assert.deepEqual(out, p, 'offsets must not be applied outside the China bounding box');
    }
  });

  it('preserves elevation on 3D coordinates through every datum pair', () => {
    for (const [from, to] of [['wgs84', 'gcj02'], ['gcj02', 'wgs84'], ['gcj02', 'bd09ll'], ['bd09ll', 'gcj02']]) {
      const out = ProjectionTransform.transform([116.397, 39.908, 88.5], from, to);
      assert.equal(out[2], 88.5);
      assert.ok(out.length >= 3, 'dimension should be retained');
    }
  });

  it('identity transform returns an equivalent but separate structure', () => {
    const src = [[116.397, 39.908], [117.2, 40.1]];
    const out = ProjectionTransform.transform(src, 'wgs84', 'EPSG:4326');
    assert.deepEqual(out, src);
    assert.notEqual(out, src);
    assert.notEqual(out[0], src[0]);
  });
});
