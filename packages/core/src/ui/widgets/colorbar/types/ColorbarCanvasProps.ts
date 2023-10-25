import { Types } from '@cornerstonejs/core';
import type { ColorbarImageRange } from './ColorbarImageRange';
import type { ColorbarSize } from './ColorbarSize';
import type { ColorbarVOIRange } from './ColorbarVOIRange';

export interface ColorbarCanvasProps {
  colormap: Types.ColormapRegistration;
  size?: ColorbarSize;
  imageRange?: ColorbarImageRange;
  voiRange?: ColorbarVOIRange;

  container?: HTMLElement;
  showFullPixelValueRange?: boolean;
}
