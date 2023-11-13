import { ViewportProperties } from './ViewportProperties';
import Point2 from './Point2';
import { VOIRange } from './voi';

/**
 * Stack Viewport Properties
 */
type VideoViewportProperties = ViewportProperties & {
  loop?: boolean;
  muted?: boolean;
  pan?: Point2;
  playbackRate?: number;
};

export default VideoViewportProperties;
