import type { ColorbarCommonProps, ColorbarSize } from '.';

export type ColorbarTicksProps = ColorbarCommonProps & {
  top?: number;
  left?: number;
  size?: ColorbarSize;
  container?: HTMLElement;
};
