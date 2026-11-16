import type {
  IViewport,
  ViewReference,
  ViewReferenceSpecifier,
} from './IViewport';
import type Point3 from './Point3';
import type Point2 from './Point2';
import type ICamera from './ICamera';
import type { ECGWaveformData } from './ECGViewportTypes';
import type ECGViewportProperties from './ECGViewportProperties';
import type { ViewportContentMode } from './IGenericViewport';
import type IImageCalibration from './IImageCalibration';

/**
 * Public interface of the legacy ECG viewport, `ECGViewport`.
 */
export interface IECGViewport extends IViewport {
  readonly uid: string;
  /**
   * Loads ECG data from a DICOM imageId by retrieving metadata via the
   * ecgModule metadata provider.
   *
   * @param imageId - A DICOM image ID whose metadata includes waveform data
   */
  setEcg(imageId: string): Promise<void>;
  /**
   * Mounts display sets on the viewport, mirroring the GenericViewport
   * `setDisplaySets` API. The `displaySetId` is resolved through the registered
   * generic-viewport dataset metadata (see `genericViewportDisplaySetMetadataProvider`)
   * to its source ECG imageId, which is loaded via `setEcg`. Resolution and
   * loading run inside {@link mountDisplaySets}, which records the mounted
   * entries after `setEcg` so {@link getDisplaySets} reports them.
   *
   * @param entries - display set entries to mount; the first is used as the ECG source.
   */
  setDisplaySets(
    ...entries: Array<{ displaySetId: string; options?: unknown }>
  ): Promise<void>;
  /**
   * Toggle visibility of a specific channel.
   */
  setChannelVisibility(index: number, visible: boolean): void;
  /**
   * Returns the current channel visibility state.
   */
  getVisibleChannels(): { name: string; visible: boolean }[];
  /**
   * Returns the parsed waveform data.
   */
  getWaveformData(): ECGWaveformData | null;
  /**
   * Returns the computed ECG content dimensions in world pixels.
   */
  getContentDimensions(): { width: number; height: number };
  setProperties(props: ECGViewportProperties): void;
  getProperties: () => ECGViewportProperties;
  resetProperties(): void;
  setCamera(camera: ICamera): void;
  resetCamera: () => boolean;
  canvasToWorld: (canvasPos: Point2, destPos?: Point3) => Point3;
  getPan(): Point2;
  getCurrentImageIdIndex: () => number;
  getCurrentImageId: () => string | undefined;
  /**
   * Records the Z of the first point in `sliceIndex`. In this class, Z is the
   * index of the visible row, so it is not the channel index when a lead is
   * hidden. The reference also has the plane of the base class, so the ECG
   * family does not show an annotation of this class.
   */
  getViewReference(specifier?: ViewReferenceSpecifier): ViewReference;
  hasImageURI(imageURI: string): boolean;
  /**
   * All annotations created on this ECG viewport are always viewable.
   * The base implementation filters by plane distance, but ECG uses the
   * z coordinate for the lead index rather than spatial position, so the
   * plane check incorrectly rejects annotations on non-zero channels.
   */
  isReferenceViewable(viewRef: { FrameOfReferenceUID?: string }): boolean;
  getSliceIndex: () => number;
  getImageIds: () => string[];
  getCurrentMode: () => ViewportContentMode;
  scroll: () => void;
  customRenderViewportToCanvas: () => void;
  /**
   * Returns image data for tool compatibility (e.g. ZoomTool, ProbeTool).
   * ECG world coordinates: x = sample index, y = amplitude (raw), z = channel number.
   * Amplitude is mapped to index [0, ECG_AMPLITUDE_INDEX_SIZE) so indexWithinDimensions works;
   * drawing across channels remains out of bounds and gets clipped.
   */
  getImageData(): {
    dimensions: number[];
    spacing: number[];
    origin: number[];
    direction: number[];
    imageData: {
      getDirection: () => number[];
      getDimensions: () => number[];
      getRange: () => Point2;
      getSpacing: () => number[];
      worldToIndex: (point: Point3) => Point3;
      indexToWorld: (point: Point3) => Point3;
    };
    hasPixelSpacing: boolean;
    calibration: IImageCalibration;
    preScale: { scaled: boolean };
    metadata: { Modality: string };
  };
  getMiddleSliceData: () => never;
}
