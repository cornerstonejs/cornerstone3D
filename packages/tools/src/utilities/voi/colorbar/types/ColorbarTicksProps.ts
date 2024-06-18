import type { ColorbarCommonProps, ColorbarSize } from './index.js';

export type ColorbarTicksProps = ColorbarCommonProps & {
  top?: number;
  left?: number;
  size?: ColorbarSize;
  container?: HTMLElement;
};
