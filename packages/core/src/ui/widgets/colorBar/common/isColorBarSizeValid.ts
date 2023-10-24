import type { ColorBarSize } from '../types/ColorBarSize';

const isColorBarSizeValid = (size: ColorBarSize) => {
  return !!size && size.width > 0 && size.height > 0;
};

export { isColorBarSizeValid as default, isColorBarSizeValid };
