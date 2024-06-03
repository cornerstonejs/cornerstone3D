import { ViewportProperties } from './ViewportProperties.js';

/**
 * Stack Viewport Properties
 */
type VolumeViewportProperties = ViewportProperties & {
  /** 3d preset */
  preset?: string;

  slabThickness?: number;
};

export default VolumeViewportProperties;
