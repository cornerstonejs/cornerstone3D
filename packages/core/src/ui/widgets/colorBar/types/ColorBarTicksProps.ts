import type { ColorBarCommonProps, ColorBarSize, ColorBarTicksStyle } from '.';

export type ColorBarTicksProps = ColorBarCommonProps & {
  top?: number;
  left?: number;
  size?: ColorBarSize;
  ticksStyle?: ColorBarTicksStyle;
  container?: HTMLElement;
};
