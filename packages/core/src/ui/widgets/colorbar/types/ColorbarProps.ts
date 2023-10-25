import { Types } from '@cornerstonejs/core';
import type { WidgetProps } from '../../types';
import { ColorbarCommonProps } from '.';

export type ColorbarProps = (WidgetProps & ColorbarCommonProps) & {
  colormaps: Types.ColormapRegistration[];
  activeColormapName?: string;
};
