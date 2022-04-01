import CPUFallbackLookupTable from './CPUFallbackLookupTable';
import CPUFallbackLUT from './CPUFallbackLUT';

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
  renderCanvasContext?: {
    putImageData: (
      renderCanvasData: unknown,
      dx: number,
      dy: number
    ) => unknown;
  };
  colormapId?: string;
  colorLUT?: CPUFallbackLookupTable;
  renderCanvasData?: {
    data: Uint8ClampedArray;
  };
};

export default CPUFallbackRenderingTools;
