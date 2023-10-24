import { Types } from '@cornerstonejs/core';
import type { WidgetProps } from '../../types';
import { ColorBarCommonProps } from '.';

export type ColorBarProps = (WidgetProps & ColorBarCommonProps) & {
  colormaps: Types.ColormapRegistration[];
  activeColormapName?: string;
};
