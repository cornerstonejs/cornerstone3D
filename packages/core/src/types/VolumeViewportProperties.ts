import type { ViewportProperties } from './ViewportProperties';
import type { OrientationAxis } from '../enums';

/**
 * Stack Viewport Properties
 */
type VolumeViewportProperties = ViewportProperties & {
  /** 3d preset */
  preset?: string;

  slabThickness?: number;

  orientation?: OrientationAxis;
};

export type { VolumeViewportProperties as default };
