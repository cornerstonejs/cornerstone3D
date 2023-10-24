import type { ColorBarImageRange } from '../types/ColorBarImageRange';

const areColorBarRangesEqual = (
  a: ColorBarImageRange,
  b: ColorBarImageRange
) => {
  return !!a && !!b && a.lower === b.lower && a.upper === b.upper;
};

export { areColorBarRangesEqual as default, areColorBarRangesEqual };
