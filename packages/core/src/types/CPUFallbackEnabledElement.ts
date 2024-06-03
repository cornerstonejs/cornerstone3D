import Point2 from './Point2.js';
import Point3 from './Point3.js';
import Mat3 from './Mat3.js';
import IImage from './IImage.js';
import CPUFallbackViewport from './CPUFallbackViewport.js';
import CPUFallbackTransform from './CPUFallbackTransform.js';
import CPUFallbackColormap from './CPUFallbackColormap.js';
import CPUFallbackRenderingTools from './CPUFallbackRenderingTools.js';
import { ImagePlaneModule } from './ImagePlaneModule.js';
import { ImagePixelModule } from './ImagePixelModule.js';

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
