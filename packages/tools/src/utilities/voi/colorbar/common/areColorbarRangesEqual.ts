import type { ColorbarImageRange } from '../types/ColorbarImageRange.js';

const areColorbarRangesEqual = (
  a: ColorbarImageRange,
  b: ColorbarImageRange
) => {
  return !!a && !!b && a.lower === b.lower && a.upper === b.upper;
};

export { areColorbarRangesEqual as default, areColorbarRangesEqual };
