import { ColorBarScalePosition } from '../enums/ColorBarScalePosition';
import { ColorBarPosition } from './ColorBarPosition';
import { ColorBarRange } from './ColorBarRange';
import { ColorBarScaleStyle } from './ColorBarScaleStyle';
import { ColorBarSize } from './ColorBarSize';
import { ColorBarVOIRange } from './ColorBarVOIRange';

export interface ColorBarScaleProps {
  size?: ColorBarSize;
  position?: ColorBarPosition;
  range: ColorBarRange;
  voiRange: ColorBarVOIRange;
  scaleStyle?: ColorBarScaleStyle;
  scalePosition?: ColorBarScalePosition;
  container?: HTMLElement;
  showFullPixelValueRange?: boolean;
}
