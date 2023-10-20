import { ColorBarRange } from '../types/ColorBarRange';

const isRangeValid = (range: ColorBarRange) => {
  return range && range.upper > range.lower;
};

export { isRangeValid as default, isRangeValid };
