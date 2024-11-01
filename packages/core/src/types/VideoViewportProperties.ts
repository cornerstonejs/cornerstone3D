import type { ViewportProperties } from './ViewportProperties';
import type Point2 from './Point2';

/**
 * Stack Viewport Properties
 */
type VideoViewportProperties = ViewportProperties & {
  loop?: boolean;
  muted?: boolean;
  pan?: Point2;
  playbackRate?: number;
  scrollSpeed?: number;
};

export type { VideoViewportProperties as default };
