import { ColorbarRangeTextPosition } from '../enums/ColorbarRangeTextPosition';
import type {
  ColorbarImageRange,
  ColorbarTicksStyle,
  ColorbarVOIRange,
} from '.';

export type ColorbarCommonProps = {
  // Image range from minPixelValue (lower) to maxPixelValue (upper)
  imageRange?: ColorbarImageRange;
  // VOI Range that is related to Window Width and Window Center
  voiRange?: ColorbarVOIRange;
  // Ticks props
  ticks?: {
    // Position where the range text (tiks) should be displayed related to the ticks bar
    position?: ColorbarRangeTextPosition;
    // Ticks style
    style?: ColorbarTicksStyle;
  };
  // The color bar shall show a range from `imageRange.lower` to `imageRange.upper`
  // when it is set to `true` or from `voiRange.lower` to `voiRange.upper` otherwise.
  showFullPixelValueRange?: boolean;
};
