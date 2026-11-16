import type {
  IViewport,
  DataSetOptions,
  ReferenceCompatibleOptions,
  ViewReference,
  ViewReferenceSpecifier,
} from './IViewport';
import type { VideoEnums as VideoViewportEnum } from '../enums';
import type { DisplaySetId } from '../RenderingEngine/GenericViewport/ViewportArchitectureTypes';
import type VideoViewportProperties from './VideoViewportProperties';
import type Point3 from './Point3';
import type Point2 from './Point2';
import type ICamera from './ICamera';
import type { VOIRange } from './voi';
import type IImage from './IImage';
import type { IStackInput } from './IStackInput';
import type CPUIImageData from './CPUIImageData';
import type IImageData from './IImageData';
import type { VideoImageMetadata } from '../utilities/VideoUtilities';

/**
 * Public interface of the legacy video viewport, `VideoViewport`.
 */
export interface IVideoViewport extends IViewport {
  modality: string;
  readonly uid: string;
  getImageDataMetadata(image: IImage | string): VideoImageMetadata;
  /**
   * This is a wrapper for setVideo to allow generic behaviour
   *
   * @param _groupId - the id for the overall set of image ids.  Unused for video viewport.
   * @param imageIds - a singleton list containing the imageId of a video.
   */
  setDataIds(imageIds: string[], options?: DataSetOptions): void;
  /** GenericViewport compat shim – delegates to setVideo. */
  setDataList(
    entries: Array<{ dataId: string; options?: Record<string, unknown> }>
  ): Promise<unknown>;
  /**
   * Mounts display sets on the viewport, mirroring the GenericViewport
   * `setDisplaySets` API. The `displaySetId` is the video imageId (callers
   * typically pass `displaySet.instances[0].imageId`); the first entry is loaded
   * as the video source. Resolution and loading run inside
   * {@link mountDisplaySets}, which records the mounted entries after `setVideo`
   * so {@link getDisplaySets} reports them.
   *
   * An optional initial frame can be passed per entry via `options`: an explicit
   * 1-based `frameNumber`, or a 0-based `viewReference.sliceIndex` (matching
   * {@link setDataIds}). When neither is provided the video opens on frame 1.
   *
   * @param entries - display set entries to mount; the first is used as the source.
   */
  setDisplaySets(
    ...entries: Array<{
      displaySetId: DisplaySetId;
      options?: {
        frameNumber?: number;
        viewReference?: { sliceIndex?: number };
      };
    }>
  ): Promise<void>;
  /**
   * Sets the video image id to show and hte frame number.
   * Requirements are to have the imageUrlModule in the metadata
   * with the rendered endpoint being the raw video in video/mp4 format.
   */
  setVideo(imageId: string, frameNumber?: number): Promise<unknown>;
  /**
   * Gets all the image ids associated with this video element.  This will
   * have # of frames elements.
   */
  getImageIds(): string[];
  togglePlayPause(): boolean;
  play(): Promise<void>;
  pause(): void;
  scroll(delta?: number): Promise<void>;
  start(): Promise<void>;
  end(): Promise<void>;
  setTime(timeInSeconds: number): Promise<void>;
  setFrameNumber(frame: number): Promise<void>;
  /**
   * Sets the playback frame range.  The video will play over the given set
   * of frames (assuming it is playing).
   *
   * @param frameRange - the minimum to maximum (inclusive) frames to play over
   * @returns
   */
  setFrameRange(frameRange: number[]): void;
  getSliceIndexForImage(reference: string | ViewReference): number;
  getFrameRange(): [number, number];
  setProperties(props: VideoViewportProperties): void;
  setPlaybackRate(rate?: number): void;
  setScrollSpeed(
    scrollSpeed?: number,
    unit?: VideoViewportEnum.SpeedUnit
  ): void;
  getProperties: () => VideoViewportProperties;
  resetProperties(): void;
  getImageData(): IImageData | CPUIImageData;
  getMiddleSliceData: () => never;
  /**
   * Checks to see if the imageURI is currently being displayed.  The imageURI
   * may contain frame numbers according to the DICOM standard format, which
   * will be stripped to compare the base image URI, and then the values used
   * to check if that frame is currently being displayed.
   *
   * The DICOM standard allows for comma separated values as well, however,
   * this is not supported here, with only a single range or single value
   * being tested.
   *
   * For a single value, the time range +/- 5 frames is permitted to allow
   * the detection to actually succeed when nearby without requiring an exact
   * time frame to be matched.
   *
   * @param imageURI - containing frame number or range.
   * @returns
   */
  hasImageURI(imageURI: string): boolean;
  setVOI(voiRange: VOIRange): void;
  setWindowLevel(windowWidth?: number, windowCenter?: number): void;
  setAverageWhite(averageWhite: [number, number, number]): void;
  setCamera(camera: ICamera): void;
  /**
   * This function returns the imageID associated with either the current
   * frame being displayed, or the range of frames being played.  This may not
   * correspond to any particular imageId that has imageId metadata, as the
   * format is one of:
   * `<DICOMweb URI>/frames/<Start Frame>(-<End Frame>)?`
   * or
   * `<Other URI>[?&]frameNumber=<Start Frame>(-<EndFrame>)?`
   * for a URL parameter.
   *
   * @returns an imageID for video
   */
  getCurrentImageId(index?: number): string;
  /**
   *  Gets a target id that can be used to specify how to show this
   */
  getViewReferenceId(specifier?: ViewReferenceSpecifier): string;
  /**
   * Figure out if a given view can be shown in the current viewport.
   */
  isReferenceViewable(
    viewRef: ViewReference,
    options?: ReferenceCompatibleOptions
  ): boolean;
  /**
   * Navigates the video to the specific view reference
   */
  setViewReference(viewRef: ViewReference): void;
  /**
   * Gets a view target that species what type of view is required to show
   * the current view, or the one specified in the forTarget modifiers.
   */
  getViewReference(viewRefSpecifier?: ViewReferenceSpecifier): ViewReference;
  /**
   * Gets the 1 based frame number (ala DICOM value), eg `1+ currentImageIdIndex`
   */
  getFrameNumber(): number;
  resetCamera: () => boolean;
  getFrameRate(): number;
  /**
   * Converts a VideoViewport canvas coordinate to a video coordinate.
   *
   * @param canvasPos - to convert to world
   * @returns World position
   */
  canvasToWorld: (canvasPos: Point2, destPos?: Point3) => Point3;
  /**
   * Converts `[x, y, 0]` world video coordinate to canvas CSS coordinates.
   *
   * @param  worldPos - world coord to convert to canvas
   * @returns Canvas position
   */
  worldToCanvas: (worldPos: Point3) => Point2;
  getPan(): Point2;
  customRenderViewportToCanvas: () => void;
  /**
   * Nothing to do for the clipping planes for video as they don't exist.
   */
  updateCameraClippingPlanesAndRange(): void;
  addImages(stackInputs: IStackInput[]): void;
}
