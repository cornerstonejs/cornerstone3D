import { ViewportProperties } from './ViewportProperties.js';
import Point2 from './Point2.js';

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

export default VideoViewportProperties;
