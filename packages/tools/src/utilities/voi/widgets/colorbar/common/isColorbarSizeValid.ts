import type { ColorbarSize } from '../types/ColorbarSize';

const isColorbarSizeValid = (size: ColorbarSize) => {
  return !!size && size.width > 0 && size.height > 0;
};

export { isColorbarSizeValid as default, isColorbarSizeValid };
