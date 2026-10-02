import { test } from 'node:test';
import assert from 'node:assert/strict';
import isColorImage, {
  COLOR_PHOTOMETRIC_INTERPRETATIONS,
  GRAYSCALE_PHOTOMETRIC_INTERPRETATIONS,
} from '../src/utilities/isColorImage.ts';

const NOT_COLOR_IMAGES = [
  ...GRAYSCALE_PHOTOMETRIC_INTERPRETATIONS,
  '',
  'UNKNOWN',
  undefined,
];

for (const pmi of COLOR_PHOTOMETRIC_INTERPRETATIONS) {
  test(`isColorImage returns true for ${pmi}`, () => {
    assert.equal(isColorImage(pmi), true);
  });
}

for (const pmi of NOT_COLOR_IMAGES) {
  test(`isColorImage returns false for ${pmi}`, () => {
    assert.equal(isColorImage(pmi), false);
  });
}
