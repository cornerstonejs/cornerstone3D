import { WidgetProps } from '../../Widget';
import { ColorBarScalePosition } from '../enums/ColorBarScalePosition';
import { ColorBarRange } from './ColorBarRange';
import { ColorBarScaleStyle } from './ColorBarScaleStyle';
import { ColorBarVOIRange } from './ColorBarVOIRange';
import { Colormap } from './Colormap';

export interface ColorBarProps extends WidgetProps {
  colormaps: Colormap[];
  activeColormapName?: string;
  range?: ColorBarRange;
  voiRange?: ColorBarVOIRange;
  scalePosition?: ColorBarScalePosition;
  scaleStyle?: ColorBarScaleStyle;
  showFullPixelValueRange?: boolean;
}
