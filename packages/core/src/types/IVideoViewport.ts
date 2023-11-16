import { IViewport } from './IViewport';
import VideoViewportProperties from './VideoViewportProperties';

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

  setVideo: (
    imageIds: string | string[],
    imageIdIndex?: number
  ) => Promise<unknown>;

  setVideoURL: (url: string) => void;

  play: () => void;

  pause: () => void;

  /**
   * Reset the viewport properties to the default values
   */
  resetProperties(): void;

  /**
   * Gets the current image id, including frame selction or frameless.
   */
  getCurrentImageId(): string;

  /**
   * Gets the current frame, 1 based
   */
  getFrame(): number;

  /**
   * Sets the current frame
   */
  setFrame(frameNo: number);

  /**
   * Sets the range of frames for displaying.
   */
  setRange(range?: [number, number]);

  /**
   * Centers Pan and resets the zoom for stack viewport.
   */
  resetCamera(resetPan?: boolean, resetZoom?: boolean): boolean;
}
