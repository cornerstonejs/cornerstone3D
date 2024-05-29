import type { IColorMapPreset } from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps.js';
import type { WidgetProps } from '../../../../widgets/types/index.js';
import type { ColorbarCommonProps } from './index.js';

export type ColorbarProps = (WidgetProps & ColorbarCommonProps) & {
  colormaps: IColorMapPreset[];
  activeColormapName?: string;
};
