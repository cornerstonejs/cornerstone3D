import { IColorMapPreset } from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';
import type { ColorbarImageRange } from './ColorbarImageRange.js';
import type { ColorbarSize } from './ColorbarSize.js';
import type { ColorbarVOIRange } from './ColorbarVOIRange.js';

export interface ColorbarCanvasProps {
  colormap: IColorMapPreset;
  size?: ColorbarSize;
  imageRange?: ColorbarImageRange;
  voiRange?: ColorbarVOIRange;

  container?: HTMLElement;
  showFullPixelValueRange?: boolean;
}
