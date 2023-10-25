import { Types } from '@cornerstonejs/core';
import type { ColorBarImageRange } from './ColorBarImageRange';
import type { ColorBarSize } from './ColorBarSize';
import type { ColorBarVOIRange } from './ColorBarVOIRange';

export interface ColorBarCanvasProps {
  colormap: Types.ColormapRegistration;
  size?: ColorBarSize;
  imageRange?: ColorBarImageRange;
  voiRange?: ColorBarVOIRange;

  container?: HTMLElement;
  showFullPixelValueRange?: boolean;
}
