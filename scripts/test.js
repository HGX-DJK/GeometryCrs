import assert from 'node:assert/strict';
import giserConvertCrs, { GPS, ProjectionTransform, WKT } from '../src/giserConvertCrs.js';

const closeTo = (actual, expected, tolerance = 1e-8) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
};

const beijingWgs84 = [116.397, 39.908];
const beijingGcj02 = GPS.wgs84_gcj02(beijingWgs84[0], beijingWgs84[1]);
const preciseWgs84 = GPS.gcj02_wgs84_precise(beijingGcj02[0], beijingGcj02[1]);

closeTo(preciseWgs84[0], beijingWgs84[0], 1e-7);
closeTo(preciseWgs84[1], beijingWgs84[1], 1e-7);

assert.deepEqual(WKT.parse('LINESTRING(116 39, 117 40)').coordinates, [
  [116, 39],
  [117, 40]
]);

assert.deepEqual(WKT.parse('POLYGON((116 39, 117 39, 117 40, 116 39))').coordinates, [[
  [116, 39],
  [117, 39],
  [117, 40],
  [116, 39]
]]);

assert.deepEqual(WKT.parse('MULTIPOINT((116 39), (117 40))').coordinates, [
  [116, 39],
  [117, 40]
]);

assert.deepEqual(WKT.parse('MULTILINESTRING((116 39, 117 40), (118 41, 119 42))').coordinates, [
  [[116, 39], [117, 40]],
  [[118, 41], [119, 42]]
]);

assert.deepEqual(WKT.parse('MULTIPOLYGON(((116 39, 117 39, 117 40, 116 39)))').coordinates, [[[
  [116, 39],
  [117, 39],
  [117, 40],
  [116, 39]
]]]);

assert.equal(WKT.stringify({
  type: 'LineString',
  coordinates: [[116, 39, 10], [117, 40, 20]]
}), 'LINESTRING(116 39 10, 117 40 20)');

const transformed3D = ProjectionTransform.transform([116.397, 39.908, 12], 'wgs84', 'gcj02');
assert.equal(transformed3D[2], 12);

const featureCollection = giserConvertCrs.transformGeoJSON({
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { name: 'test' },
    geometry: {
      type: 'Point',
      coordinates: [116.397, 39.908]
    }
  }]
}, 'wgs84', 'gcj02');

assert.equal(featureCollection.features[0].properties.name, 'test');
assert.equal(featureCollection.features[0].geometry.type, 'Point');

const wkt = giserConvertCrs.transformWKT('LINESTRING(116 39, 117 40)', 'wgs84', 'gcj02');
assert.ok(wkt.startsWith('LINESTRING('));
assert.equal(typeof giserConvertCrs.GPS.wgs84_gcj02, 'function');

assert.throws(
  () => ProjectionTransform.transform([116, 39], 'wgs84', 'epsg:3857'),
  /Unsupported CRS/
);

