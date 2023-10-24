import { ColorBarRangeTextPosition } from '../enums/ColorBarRangeTextPosition';
import type {
  ColorBarImageRange,
  ColorBarTicksStyle,
  ColorBarVOIRange,
} from '.';

export type ColorBarCommonProps = {
  // Image range from minPixelValue (lower) to maxPixelValue (upper)
  imageRange?: ColorBarImageRange;
  // VOI Range that is related to Window Width and Window Center
  voiRange?: ColorBarVOIRange;
  // Position where the range text should be displayed related to the ticks bar
  rangeTextPosition?: ColorBarRangeTextPosition;
  // Ticks style
  ticksStyle?: ColorBarTicksStyle;
  // The color bar shall show a range from `imageRange.lower` to `imageRange.upper`
  // when it is set to `true` or from `voiRange.lower` to `voiRange.upper` otherwise.
  showFullPixelValueRange?: boolean;
};
