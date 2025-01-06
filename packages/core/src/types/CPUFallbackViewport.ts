import type CPUFallbackViewportDisplayedArea from './CPUFallbackViewportDisplayedArea';
import type CPUFallbackColormap from './CPUFallbackColormap';
import type CPUFallbackLUT from './CPUFallbackLUT';
import type VOILUTFunctionType from '../enums/VOILUTFunctionType';

interface CPUFallbackViewport {
  scale?: number;
  parallelScale?: number;
  focalPoint?: number[];
  translation?: {
    x: number;
    y: number;
  };
  voi?: {
    windowWidth: number;
    windowCenter: number;
    voiLUTFunction: VOILUTFunctionType;
  };
  invert?: boolean;
  pixelReplication?: boolean;
  rotation?: number;
  hflip?: boolean;
  vflip?: boolean;
  modalityLUT?: CPUFallbackLUT;
  voiLUT?: CPUFallbackLUT;
  colormap?: CPUFallbackColormap;
  displayedArea?: CPUFallbackViewportDisplayedArea;
  modality?: string;
}

export type { CPUFallbackViewport as default };
