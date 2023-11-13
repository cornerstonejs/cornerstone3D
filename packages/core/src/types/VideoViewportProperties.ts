import { ViewportProperties } from './ViewportProperties';
import Point2 from './Point2';

/**
 * Stack Viewport Properties
 */
type VideoViewportProperties = ViewportProperties & {
  loop?: boolean;
  muted?: boolean;
  pan?: Point2;
  playbackRate?: number;
  // The zoom factor, naming consistent with vtk cameras for now,
  // but this isn't necessarily necessary.
  parallelScale?: number;
};

export default VideoViewportProperties;
