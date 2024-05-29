import { ViewportProperties } from './ViewportProperties.js';
import { OrientationAxis } from '../enums/index.js';

/**
 * Stack Viewport Properties
 */
type VolumeViewportProperties = ViewportProperties & {
  /** 3d preset */
  preset?: string;

  slabThickness?: number;

  orientation?: OrientationAxis;
};

export default VolumeViewportProperties;
