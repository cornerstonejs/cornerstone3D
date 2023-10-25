import type { ColorBarCommonProps, ColorBarSize } from '.';

export type ColorBarTicksProps = ColorBarCommonProps & {
  top?: number;
  left?: number;
  size?: ColorBarSize;
  container?: HTMLElement;
};
