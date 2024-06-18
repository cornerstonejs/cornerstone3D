import CPUFallbackViewportDisplayedArea from './CPUFallbackViewportDisplayedArea.js';
import CPUFallbackColormap from './CPUFallbackColormap.js';
import CPUFallbackLUT from './CPUFallbackLUT.js';

type CPUFallbackViewport = {
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
};

export default CPUFallbackViewport;
