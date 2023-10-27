import { IColorMapPreset } from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';
import type { ColorbarImageRange } from './ColorbarImageRange';
import type { ColorbarSize } from './ColorbarSize';
import type { ColorbarVOIRange } from './ColorbarVOIRange';

export interface ColorbarCanvasProps {
  colormap: IColorMapPreset;
  size?: ColorbarSize;
  imageRange?: ColorbarImageRange;
  voiRange?: ColorbarVOIRange;

  container?: HTMLElement;
  showFullPixelValueRange?: boolean;
}
