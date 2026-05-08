import type { Types } from '@cornerstonejs/core';

export const seriesTags = [
  'SeriesInstanceUID',
  'SeriesNumber',
  'SeriesDescription',
  'Modality',
  'SeriesDate',
  'SeriesTime',
  '_meta',
  '_vrMap',
];

/**
 * Copies series tags from src into a new object.
 *
 * Usage:  `const newStudyInstance = copySeriesTags(exampleInstance)`
 */
export function copySeriesTags(src: Types.NormalModule): Types.NormalModule {
  const result = {};
  for (const tagKey of seriesTags) {
    const value = src[tagKey];
    if (value === undefined) {
      continue;
    }
    result[tagKey] = value;
  }
  return result;
}
