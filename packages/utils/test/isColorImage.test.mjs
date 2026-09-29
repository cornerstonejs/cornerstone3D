import { test } from 'node:test';
import assert from 'node:assert/strict';
import isColorImage from '../src/utilities/isColorImage.ts';

const COLOR = [
  'RGB',
  'PALETTE COLOR',
  'YBR_FULL',
  'YBR_FULL_422',
  'YBR_PARTIAL_422',
  'YBR_PARTIAL_420',
  'YBR_RCT',
  'YBR_ICT',
];
const GRAYSCALE = ['MONOCHROME1', 'MONOCHROME2', '', 'UNKNOWN', undefined];

for (const pmi of COLOR) {
  test(`isColorImage returns true for ${pmi}`, () => {
    assert.equal(isColorImage(pmi), true);
  });
}

for (const pmi of GRAYSCALE) {
  test(`isColorImage returns false for ${pmi}`, () => {
    assert.equal(isColorImage(pmi), false);
  });
}
