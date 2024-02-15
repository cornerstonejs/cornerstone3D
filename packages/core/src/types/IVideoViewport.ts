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

  /**
   * Sets the video to play.
   * The video should have at least some metadata in the metadata provider,
   * including:
   *   * study/series/sop common module for UIDs
   *   * `cineModule` for information on number of frames and playback rate
   *   * `imageUrlModule` - to get the URL for the image under the `rendered` attribute
   *
   * Without these, other tools requiring metadata wont work, although basic
   * playback does work if the setVideoURL is used instead.
   */
  setVideo: (imageIds: string, imageIdIndex?: number) => Promise<unknown>;

  /**
   * Displays a raw video, without any metadata associated with it.  Plays back,
   * but does not permit tools to apply to the viewport, which requires providing
   * additional metadata for the study.
   *
   * @param url - to display
   */
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
  getFrameNumber(): number;

  /**
   * Sets the current frame
   */
  setFrameNumber(frameNo: number);

  /**
   * Sets the current video time, in seconds
   */
  setTime(time: number);

  /**
   * Sets the range of frames for displaying.  This is the range of frames
   * that are shown/looped over when the video is playing.
   * Note that ability to playback a frame range depends on the server
   * implementing byte range requests, OR the video being easily cached in memory.
   */
  setFrameRange(range?: [number, number]);

  getFrameRange(): [number, number];

  /**
   * Centers Pan and resets the zoom for stack viewport.
   */
  resetCamera(resetPan?: boolean, resetZoom?: boolean): boolean;
}
