import { ColorBarRange } from './ColorBarRange';
import { ColorBarSize } from './ColorBarSize';
import { ColorBarVOIRange } from './ColorBarVOIRange';
import { Colormap } from './Colormap';

export interface ColorBarCanvasProps {
  colormap: Colormap;
  size?: ColorBarSize;
  range?: ColorBarRange;
  voiRange?: ColorBarVOIRange;

  container?: HTMLElement;
  showFullPixelValueRange?: boolean;
}
