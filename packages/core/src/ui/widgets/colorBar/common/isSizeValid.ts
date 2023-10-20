import { ColorBarSize } from '../types/ColorBarSize';

const isSizeValid = (size: ColorBarSize) => {
  return !!size && size.width > 0 && size.height > 0;
};

export { isSizeValid as default, isSizeValid };
