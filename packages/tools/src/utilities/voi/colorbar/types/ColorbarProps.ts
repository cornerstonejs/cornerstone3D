import { IColorMapPreset } from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps.js';
import { WidgetProps } from '../../../../widgets/types/index.js';
import { ColorbarCommonProps } from './index.js';

export type ColorbarProps = (WidgetProps & ColorbarCommonProps) & {
  colormaps: IColorMapPreset[];
  activeColormapName?: string;
};
