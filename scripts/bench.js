import { performance } from 'node:perf_hooks';
import giserConvertCrs from '../src/giserConvertCrs.js';

const N = Number(process.env.BENCH_POINTS || 500000);
const ROUNDS = Number(process.env.BENCH_ROUNDS || 3);

const makePoints = (n) => {
  const arr = new Array(n);
  for (let i = 0; i < n; i++) {
    arr[i] = [72.6 + (i % 1000) * 0.064, 1.2 + (i % 800) * 0.068];
  }
  return arr;
};

const makeGeoJSON = (n) => ({
  type: 'FeatureCollection',
  features: Array.from({ length: n }, (_, i) => ({
    type: 'Feature',
    properties: { i },
    geometry: {
      type: 'Point',
      coordinates: [72.6 + (i % 1000) * 0.064, 1.2 + (i % 800) * 0.068]
    }
  }))
});

const gc = globalThis.gc;
const bytes = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

function bench(name, setup, run, count = N, { trackMemory = true } = {}) {
  // Discarded warmup round so V8 has tiered up before we start timing.
  run(setup());
  const times = [];
  let heap = 0;
  for (let r = 0; r < ROUNDS; r++) {
    const input = setup();
    if (gc) { gc(); gc(); }
    const before = gc ? process.memoryUsage().heapUsed : 0;
    const t0 = performance.now();
    run(input);
    const dt = performance.now() - t0;
    times.push(dt);
    if (gc) {
      const after = process.memoryUsage().heapUsed;
      if (r === ROUNDS - 1) heap = after - before;
    }
  }
  times.sort((a, b) => a - b);
  const best = times[0];
  const median = times[Math.floor(times.length / 2)];
  const rate = ((count / best) / 1000).toFixed(2);
  const mem = trackMemory && gc ? `  churn ${bytes(heap).padStart(8)}` : '';
  console.log(
    `  ${name.padEnd(46)} ${best.toFixed(0).padStart(6)} ms` +
    `  (median ${median.toFixed(0).padStart(6)})  ${rate.padStart(6)} M pts/s${mem}`
  );
}

console.log(`\ngiserConvertCrs benchmark  points=${N.toLocaleString()}  rounds=${ROUNDS}  gc=${gc ? 'on' : 'off'}`);
console.log(`node ${process.version}  ${process.platform}/${process.arch}\n`);

console.log('Batch coordinate transform (mutate, zero-copy)');
bench('wgs84 -> gcj02', () => makePoints(N), a => giserConvertCrs.transform(a, 'wgs84', 'gcj02', { mutate: true }));
bench('gcj02 -> wgs84  (precise, default)', () => makePoints(N), a => giserConvertCrs.transform(a, 'gcj02', 'wgs84', { mutate: true }));
bench('gcj02 -> wgs84  (precise: false)', () => makePoints(N), a => giserConvertCrs.transform(a, 'gcj02', 'wgs84', { mutate: true, precise: false }));
bench('gcj02 -> EPSG:3857 (precise)', () => makePoints(N), a => giserConvertCrs.transform(a, 'gcj02', 'EPSG:3857', { mutate: true }));
bench('gcj02 -> EPSG:3857 (precise: false)', () => makePoints(N), a => giserConvertCrs.transform(a, 'gcj02', 'EPSG:3857', { mutate: true, precise: false }));
bench('bd09ll -> wgs84 (precise)', () => makePoints(N), a => giserConvertCrs.transform(a, 'bd09ll', 'wgs84', { mutate: true }));
bench('wgs84 -> EPSG:3857 (pure projection)', () => makePoints(N), a => giserConvertCrs.transform(a, 'wgs84', 'EPSG:3857', { mutate: true }));

const geoN = Math.min(N, 200000);
console.log(`\nGeoJSON structures (non-mutate, deep copy)`);
bench(`FeatureCollection of ${geoN.toLocaleString()} points`, () => makeGeoJSON(geoN),
  g => giserConvertCrs.transform(g, 'wgs84', 'gcj02'), geoN);

console.log('\nWKT');
const wktLine = 'LINESTRING(' + Array.from({ length: 2000 }, (_, i) =>
  `${(72.6 + (i % 1000) * 0.064).toFixed(6)} ${(1.2 + (i % 800) * 0.068).toFixed(6)}`).join(', ') + ')';
bench('parse -> transform -> stringify (2000-pt line)', () => wktLine,
  w => giserConvertCrs.transform(w, 'wgs84', 'gcj02', { precision: 6 }), 1);

console.log('\nSingle point');
{
  const M = 1000000;
  let sink = 0;
  const t0 = performance.now();
  for (let i = 0; i < M; i++) {
    const r = giserConvertCrs.transform([116.397, 39.908], 'wgs84', 'gcj02');
    sink += r[0];
  }
  const dt = performance.now() - t0;
  console.log(`  ${'transform(single point) x 1M'.padEnd(46)} ${dt.toFixed(0).padStart(6)} ms` +
    `  ${((M / dt) / 1000).toFixed(2)} M calls/s  (sink ${sink.toFixed(3)})`);
}

console.log('');