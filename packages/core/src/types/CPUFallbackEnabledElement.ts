import Point2 from './Point2';
import Point3 from './Point3';
import Mat3 from './Mat3';
import IImage from './IImage';
import CPUFallbackViewport from './CPUFallbackViewport';
import CPUFallbackTransform from './CPUFallbackTransform';
import CPUFallbackColormap from './CPUFallbackColormap';
import CPUFallbackRenderingTools from './CPUFallbackRenderingTools';

interface CPUFallbackEnabledElement {
  scale?: number;
  pan?: Point2;
  zoom?: number;
  rotation?: number;
  image?: IImage;
  canvas?: HTMLCanvasElement;
  viewport?: CPUFallbackViewport;
  colormap?: CPUFallbackColormap;
  options?: {
    [key: string]: unknown;
    colormap?: CPUFallbackColormap;
  };
  renderingTools?: CPUFallbackRenderingTools;
  transform?: CPUFallbackTransform;
  invalid?: boolean;
  needsRedraw?: boolean;
  metadata?: {
    direction?: Mat3;
    /** Last index is always 1 for CPU */
    dimensions?: Point3;
    /** Last spacing is always EPSILON for CPU */
    spacing?: Point3;
    origin?: Point3;
    imagePlaneModule?: {
      frameOfReferenceUID: string;
      rows: number;
      columns: number;
      imageOrientationPatient: number[];
      rowCosines: Point3;
      columnCosines: Point3;
      imagePositionPatient: number[];
      sliceThickness?: number;
      sliceLocation?: number;
      pixelSpacing: Point2;
      rowPixelSpacing: number;
      columnPixelSpacing: number;
    };
    imagePixelModule?: {
      samplesPerPixel: number;
      photometricInterpretation: string;
      rows: number;
      columns: number;
      bitsAllocated: number;
      bitsStored: number;
      highBit: number;
      pixelRepresentation: number;
      planarConfiguration?: number;
      pixelAspectRatio?: number;
      smallestPixelValue?: number;
      largestPixelValue?: number;
      redPaletteColorLookupTableDescriptor?: number[];
      greenPaletteColorLookupTableDescriptor?: number[];
      bluePaletteColorLookupTableDescriptor?: number[];
      redPaletteColorLookupTableData: number[];
      greenPaletteColorLookupTableData: number[];
      bluePaletteColorLookupTableData: number[];
    };
  };
}

export default CPUFallbackEnabledElement;
