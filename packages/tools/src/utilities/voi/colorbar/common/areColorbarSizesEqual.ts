import type { ColorbarSize } from '../types/ColorbarSize.js';

const areColorbarSizesEqual = (a: ColorbarSize, b: ColorbarSize) => {
  return !!a && !!b && a.width === b.width && a.height === b.height;
};

export { areColorbarSizesEqual as default, areColorbarSizesEqual };
