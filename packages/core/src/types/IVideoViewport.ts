import { IViewport } from './IViewport.js';
import VideoViewportProperties from './VideoViewportProperties.js';

/**
 * Interface for Stack Viewport
 */
export default interface IVideoViewport extends IViewport {
  /**
   * Resizes the viewport - only used in CPU fallback for StackViewport. The
   * GPU resizing happens inside the RenderingEngine.
   */
  resize: () => void;
  /**
   * Sets the properties for the viewport on the default actor.
   */
  setProperties(props: VideoViewportProperties, suppressEvents?: boolean): void;
  /**
   * Retrieve the viewport properties
   */
  getProperties: () => VideoViewportProperties;

  setVideoURL: (url: string) => void;

  play: () => void;

  pause: () => void;
  /**
   * Reset the viewport properties to the default values
   */
  resetProperties(): void;
  /**
   * Centers Pan and resets the zoom for stack viewport.
   */
  resetCamera(resetPan?: boolean, resetZoom?: boolean): boolean;
}
