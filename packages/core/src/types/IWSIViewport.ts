import { IViewport } from './IViewport';
import WSIViewportProperties from './WSIViewportProperties';

/**
 * Interface for Stack Viewport
 */
export default interface IWSIViewport extends IViewport {
  /**
   * Resizes the viewport - only used in CPU fallback for StackViewport. The
   * GPU resizing happens inside the RenderingEngine.
   */
  resize: () => void;
  /**
   * Sets the properties for the viewport on the default actor.
   */
  setProperties(props: WSIViewportProperties, suppressEvents?: boolean): void;
  /**
   * Retrieve the viewport properties
   */
  getProperties: () => WSIViewportProperties;

  /**
   * Sets the WSI to play.
   * The WSI should have at least some metadata in the metadata provider,
   * including:
   *   * study/series/sop common module for UIDs
   *   * `cineModule` for information on number of frames and playback rate
   *   * `imageUrlModule` - to get the URL for the image under the `rendered` attribute
   *
   * Without these, other tools requiring metadata wont work, although basic
   * playback does work if the setWSIURL is used instead.
   */
  setWSI: (imageIds: string[], client) => Promise<unknown>;

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
  getFrameNumber(): number;

  /**
   * Sets the current frame
   */
  setFrameNumber(frameNo: number);

  /**
   * Centers Pan and resets the zoom for stack viewport.
   */
  resetCamera(resetPan?: boolean, resetZoom?: boolean): boolean;
}
