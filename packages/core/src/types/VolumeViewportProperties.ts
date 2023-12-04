import { ViewportProperties } from './ViewportProperties';
import { OrientationAxis } from '../enums';

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
