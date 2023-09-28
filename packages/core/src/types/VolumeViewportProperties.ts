import { ColormapPublic } from './Colormap';
import { ViewportProperties } from './ViewportProperties';

/**
 * Stack Viewport Properties
 */
type VolumeViewportProperties = ViewportProperties & {
  /** color maps  */
  colormap?: ColormapPublic;
  /** 3d preset */
  preset?: string;
};

export default VolumeViewportProperties;
