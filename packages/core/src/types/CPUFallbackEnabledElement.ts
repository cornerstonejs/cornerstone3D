import Point2 from './Point2';
import Point3 from './Point3';
import Mat3 from './Mat3';
import IImage from './IImage';
import CPUFallbackViewport from './CPUFallbackViewport';
import CPUFallbackTransform from './CPUFallbackTransform';
import CPUFallbackColormap from './CPUFallbackColormap';
import CPUFallbackRenderingTools from './CPUFallbackRenderingTools';
import { ImagePlaneModule } from './ImagePlaneModule';
import { ImagePixelModule } from './ImagePixelModule';

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
    imagePlaneModule?: ImagePlaneModule;
    imagePixelModule?: ImagePixelModule;
  };
}

export default CPUFallbackEnabledElement;
