import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseObj, fixInvertedWinding } from '../src/character/subdivide.ts';
import { loadFitted, applyKnitPalette } from '../src/character/outfit.ts';

const old = parseObj(readFileSync('public/models/pu_stand.obj', 'utf8'));
const next = parseObj(readFileSync('public/models/pu_v4.obj', 'utf8'));
assert.equal(next.length, 4);
for (const mesh of next) {
  const previous = old.find(m => m.name === mesh.name);
  assert.ok(previous, mesh.name);
  fixInvertedWinding(previous); fixInvertedWinding(mesh);
  assert.deepEqual(mesh.faces, previous.faces, `${mesh.name}: rig topology`);
  assert.equal(mesh.positions.length, previous.positions.length);
  mesh.positions.forEach((p, i) => p.forEach((v, j) =>
    assert.ok(Math.abs(v - previous.positions[i][j]) < 0.0001, `${mesh.name}: rest position`)));
}
const bytes = readFileSync('public/models/pu_muffler_v4.bin');
let payload = bytes;
globalThis.fetch = async () => new Response(payload);
const scarf = await loadFitted('test');
assert.equal(scarf.getAttribute('position').count, 94888);
assert.equal(scarf.getIndex().count, 189832 * 3);
for (const name of ['position', 'normal', 'skinWeight'])
  assert.ok(scarf.getAttribute(name).array.every(Number.isFinite));
assert.ok(scarf.getIndex().array.every(i => i < 94888));
const geometry = scarf.getAttribute('position').array.slice();
applyKnitPalette(scarf, { red: '#982c43', cream: '#e2c7ba' });
assert.deepEqual(scarf.getAttribute('position').array, geometry);
assert.ok(scarf.getAttribute('color').array.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
payload = Buffer.from(bytes);
payload.writeFloatLE(Number.NaN, payload.length - 4);
await assert.rejects(loadFitted('invalid'), /Invalid scarf bone weight/);
payload = bytes.subarray(0, bytes.length - 4);
await assert.rejects(loadFitted('truncated'), /Invalid fitted scarf skin data/);
payload = readFileSync('public/models/muffler_fit.bin');
assert.ok(await loadFitted('legacy'));
console.log('PASS: v4 rest topology, scarf geometry/skin/palette, corrupt skin rejection, legacy loading');
