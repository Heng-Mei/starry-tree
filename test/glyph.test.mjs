import test from 'node:test';
import assert from 'node:assert/strict';
import { glyphDabs, placeDabs, projectLocal } from '../js/glyph.js';
import { THETA, TREE, rng, toWorld } from '../js/layout.js';

const rand = rng(1);
const placed = placeDabs(glyphDabs(rand), rand);
const meanError = (yaw) =>
  placed.reduce((s, d) => {
    const [x, y] = projectLocal(d.pos, yaw);
    return s + Math.hypot(x - d.q[0], y - d.q[1]);
  }, 0) / placed.length;

test('glyph has enough dabs to read', () => {
  assert.ok(placed.length > 80, `${placed.length}`);
});

test('dabs line up exactly at the hidden angle', () => {
  assert.ok(meanError(THETA) < 1e-9);
});

test('dabs scatter 30 degrees away', () => {
  const off = (30 * Math.PI) / 180;
  // larger than a dab's width, so strokes no longer touch their neighbours
  assert.ok(meanError(THETA + off) > 0.015, `${meanError(THETA + off)}`);
  assert.ok(meanError(THETA - off) > 0.015, `${meanError(THETA - off)}`);
});

test('dabs sit in the front half at the hidden angle, so none are faded', () => {
  for (const d of placed) assert.ok(toWorld(d.pos, THETA)[2] >= TREE.z - 1e-9);
});
