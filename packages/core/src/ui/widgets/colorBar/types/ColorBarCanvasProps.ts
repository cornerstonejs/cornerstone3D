import type { ColorBarImageRange } from './ColorBarImageRange';
import type { ColorBarSize } from './ColorBarSize';
import type { ColorBarVOIRange } from './ColorBarVOIRange';
import type { Colormap } from './Colormap';

export interface ColorBarCanvasProps {
  colormap: Colormap;
  size?: ColorBarSize;
  imageRange?: ColorBarImageRange;
  voiRange?: ColorBarVOIRange;

  container?: HTMLElement;
  showFullPixelValueRange?: boolean;
}
