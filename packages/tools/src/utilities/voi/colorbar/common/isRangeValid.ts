import type { ColorbarImageRange } from '../types/ColorbarImageRange.js';

const isRangeValid = (range: ColorbarImageRange) => {
  return range && range.upper > range.lower;
};

export { isRangeValid as default, isRangeValid };
