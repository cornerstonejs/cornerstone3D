import type CPUFallbackLUT from './CPUFallbackLUT';
import type CPUFallbackColormap from './CPUFallbackColormap';
import type CPUFallbackEnabledElement from './CPUFallbackEnabledElement';
import type { PixelDataTypedArray } from './PixelDataTypedArray';
import { ImageQualityStatus } from '../enums';

/**
 * Cornerstone Image interface, it is used for both CPU and GPU rendering
 */
interface IImage {
  /** Image Id */
  imageId: string;
  sharedCacheKey?: string;
  /** Whether the image is Pre-scaled during loading */
  isPreScaled?: boolean;
  /** preScale object */
  preScale?: {
    /** boolean flag to indicate whether the image has been scaled */
    scaled?: boolean;
    /** scaling parameters */
    scalingParameters?: {
      /** modality of the image */
      modality?: string;
      /** rescale slop */
      rescaleSlope?: number;
      /** rescale intercept */
      rescaleIntercept?: number;
      /** PT suvbw */
      suvbw?: number;
    };
  };
  /** minimum pixel value of the image */
  minPixelValue: number;
  /* maximum pixel value of the image */
  maxPixelValue: number;
  /** slope from metadata for scaling */
  slope: number;
  /** intercept from metadata for scaling */
  intercept: number;
  /** windowCenter from metadata */
  windowCenter: number[] | number;
  /** windowWidth from metadata */
  windowWidth: number[] | number;
  /** voiLUTFunction from metadata */
  voiLUTFunction: string;
  /** function that returns the pixelData as an array */
  getPixelData: () => PixelDataTypedArray;
  getCanvas: () => HTMLCanvasElement;
  /** image number of rows */
  rows: number;
  /** image number of columns */
  columns: number;
  /** image height */
  height: number;
  /** image width */
  width: number;
  /** is image a color image */
  color: boolean;
  /** is image rgb and alpha */
  rgba: boolean;
  /** number of components in the image */
  numComps: number;
  /** CPU: custom render method for the image */
  render?: (
    enabledElement: CPUFallbackEnabledElement,
    invalidated: boolean
  ) => unknown;
  /** column pixel spacing */
  columnPixelSpacing: number;
  /** row pixel spacing */
  rowPixelSpacing: number;
  /** slice thickness */
  sliceThickness?: number;
  /** whether image pixels are inverted in color */
  invert: boolean;
  /** image photometric interpretation */
  photometricInterpretation?: string;
  /** image size in number of bytes */
  sizeInBytes: number;
  /** CPU: custom modality LUT for image  */
  modalityLUT?: CPUFallbackLUT;
  /** CPU: custom VOI LUT for image  */
  voiLUT?: CPUFallbackLUT;
  /** CPU: custom color map for image  */
  colormap?: CPUFallbackColormap;
  /** image scaling metadata - including PT suv values */
  scaling?: {
    PT?: {
      // @TODO: Do these values exist?
      SUVlbmFactor?: number;
      SUVbsaFactor?: number;
      // accessed in ProbeTool
      suvbwToSuvlbm?: number;
      suvbwToSuvbsa?: number;
    };
  };
  loadTimeInMS?: number;
  decodeTimeInMS?: number;
  /** CPU: image statistics for rendering */
  stats?: {
    lastStoredPixelDataToCanvasImageDataTime?: number;
    lastGetPixelDataTime?: number;
    lastPutImageDataTime?: number;
    lastLutGenerateTime?: number;
    lastRenderedViewport?: unknown;
    lastRenderTime?: number;
  };
  /** CPU: image cached LUT */
  cachedLut?: {
    windowWidth?: number | number[];
    windowCenter?: number | number[];
    invert?: boolean;
    lutArray?: Uint8ClampedArray;
    modalityLUT?: unknown;
    voiLUT?: CPUFallbackLUT;
  };

  imageQualityStatus?: ImageQualityStatus;
}

export default IImage;
