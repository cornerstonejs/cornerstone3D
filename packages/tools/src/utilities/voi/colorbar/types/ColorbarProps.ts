import type { IColorMapPreset } from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';
import type { WidgetProps } from '../../../../widgets/types';
import type { ColorbarCommonProps } from '.';

export type ColorbarProps = (WidgetProps & ColorbarCommonProps) & {
  colormaps: IColorMapPreset[];
  activeColormapName?: string;
};
