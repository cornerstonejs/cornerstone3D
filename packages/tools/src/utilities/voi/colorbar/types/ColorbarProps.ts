import { IColorMapPreset } from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';
import { WidgetProps } from '../../../../widgets/types';
import { ColorbarCommonProps } from '.';

export type ColorbarProps = (WidgetProps & ColorbarCommonProps) & {
  colormaps: IColorMapPreset[];
  activeColormapName?: string;
};
