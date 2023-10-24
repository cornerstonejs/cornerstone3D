import type { ColorBarSize } from '../types/ColorBarSize';

const areColorBarSizesEqual = (a: ColorBarSize, b: ColorBarSize) => {
  return !!a && !!b && a.width === b.width && a.height === b.height;
};

export { areColorBarSizesEqual as default, areColorBarSizesEqual };
