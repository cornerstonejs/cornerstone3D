import type Point2 from './Point2';
import type Point3 from './Point3';
import type Mat3 from './Mat3';
import type IImage from './IImage';
import type CPUFallbackViewport from './CPUFallbackViewport';
import type CPUFallbackTransform from './CPUFallbackTransform';
import type CPUFallbackColormap from './CPUFallbackColormap';
import type CPUFallbackRenderingTools from './CPUFallbackRenderingTools';
import type { ImagePlaneModule } from './ImagePlaneModule';
import type { ImagePixelModule } from './ImagePixelModule';
import type RGB from './RGB';
import type { VoxelManager } from '../utilities';

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
  voxelManager?: VoxelManager<number> | VoxelManager<RGB>;
}

export default CPUFallbackEnabledElement;
