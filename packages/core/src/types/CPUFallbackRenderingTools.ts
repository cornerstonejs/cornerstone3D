import type CPUFallbackLookupTable from './CPUFallbackLookupTable';
import type CPUFallbackLUT from './CPUFallbackLUT';
import type VOILUTFunctionType from '../enums/VOILUTFunctionType';

interface CPUFallbackRenderingTools {
  renderCanvas?: HTMLCanvasElement;
  lastRenderedIsColor?: boolean;
  lastRenderedImageId?: string;
  lastRenderedViewport?: {
    windowWidth: number | number[];
    windowCenter: number | number[];
    voiLUTFunction?: VOILUTFunctionType;
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
}

export type { CPUFallbackRenderingTools as default };
