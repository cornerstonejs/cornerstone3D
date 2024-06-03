import CPUFallbackLookupTable from './CPUFallbackLookupTable.js';
import CPUFallbackLUT from './CPUFallbackLUT.js';

type CPUFallbackRenderingTools = {
  renderCanvas?: HTMLCanvasElement;
  lastRenderedIsColor?: boolean;
  lastRenderedImageId?: string;
  lastRenderedViewport?: {
    windowWidth: number | number[];
    windowCenter: number | number[];
    invert: boolean;
    rotation: number;
    hflip: boolean;
    vflip: boolean;
    modalityLUT: CPUFallbackLUT;
    voiLUT: CPUFallbackLUT;
    colormap: unknown;
  };
  renderCanvasContext?: CanvasRenderingContext2D;
  colormapId?: string;
  colorLUT?: CPUFallbackLookupTable;
  renderCanvasData?: ImageData;
};

export default CPUFallbackRenderingTools;
