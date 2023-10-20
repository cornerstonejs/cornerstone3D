import { ColorBarSize } from '../types/ColorBarSize';

const sizesEqual = (a: ColorBarSize, b: ColorBarSize) => {
  return !!a && !!b && a.width === b.width && a.height === b.height;
};

export { sizesEqual as default, sizesEqual };
