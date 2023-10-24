import type { ColorBarImageRange } from '../types/ColorBarImageRange';

const isRangeValid = (range: ColorBarImageRange) => {
  return range && range.upper > range.lower;
};

export { isRangeValid as default, isRangeValid };
