import type { mat4 } from 'gl-matrix';
import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import type CustomEventType from '../types/CustomEventType';
import type ICachedImage from './ICachedImage';
import type ICachedVolume from './ICachedVolume';
import type ICamera from './ICamera';
import type IImage from './IImage';
import type IImageVolume from './IImageVolume';
import type ViewportStatus from '../enums/ViewportStatus';
import type IImageCalibration from './IImageCalibration';
import type { PlanarDisplaySetAppearance } from '../RenderingEngine/Viewports/Planar/PlanarViewportTypes';
import type { ViewportFidelityState } from './ViewportFidelity';

/**
 * CAMERA_MODIFIED Event's data
 */
interface CameraModifiedEventDetail {
  /** Previous camera properties */
  previousCamera?: ICamera;
  /** Current camera properties */
  camera: ICamera;
  /** Viewport HTML element in the DOM */
  element?: HTMLDivElement;
  /** Viewport Unique ID in the renderingEngine */
  viewportId: string;
  /** Unique ID for the renderingEngine */
  renderingEngineId: string;
}

/**
 * CAMERA_RESET Event's data
 */

interface CameraResetEventDetail {
  /** Viewport HTML element in the DOM */
  element?: HTMLDivElement;
  /** Viewport Unique ID in the renderingEngine */
  viewportId: string;
  /** Unique ID for the renderingEngine */
  renderingEngineId: string;
  /** Camera properties */
  camera: ICamera;
}

type CameraResetEvent = CustomEventType<CameraResetEventDetail>;

/**
 * Why the appearance of a display set changed:
 *
 * - `'mount'`: the display set was mounted on the viewport and has its first
 *   appearance: the defaults of its data and family, with the overrides that
 *   were set before the mount or that the mount asked for. It fires once per
 *   mount, after the display set is bound, with every key that has a value.
 * - `'edit'`: a call of `setDisplaySetAppearance` changed an override, and
 *   with it maybe the effective value. A call that changes nothing fires
 *   nothing.
 * - `'reset'`: a call of `resetDisplaySetAppearance` removed overrides; the
 *   keys are back to their defaults.
 * - `'default'`: an effective value changed and no call made it: the default
 *   of a key that has no override changed, for example when a scroll shows
 *   an image of a stack whose own window differs from the image before. The
 *   overrides are the same as before.
 */
type DisplaySetAppearanceChangeCause = 'mount' | 'edit' | 'reset' | 'default';

/**
 * DISPLAY_SET_APPEARANCE_CHANGED Event's data. It fires once per change of
 * the appearance of one display set of a viewport, on the element of the
 * viewport. The type parameter is the appearance of the viewport family:
 * `PlanarDisplaySetAppearance` by default, `Volume3DDisplaySetAppearance`,
 * `VideoDisplaySetAppearance`, `WSIDisplaySetAppearance` or
 * `ECGDisplaySetAppearance` for the others.
 *
 * `overrides` is what `getDisplaySetAppearance(displaySetId)` gives after
 * the change: what a caller set, also a value equal to the default. Copy or
 * store these. `effective` is what
 * `getEffectiveDisplaySetAppearance(displaySetId)` gives: what is drawn,
 * the defaults included. Show or compare these.
 */
interface DisplaySetAppearanceChangedEventDetail<
  TAppearance extends object = PlanarDisplaySetAppearance,
> {
  /** Viewport Unique ID in the renderingEngine */
  viewportId: string;
  /** Unique ID for the renderingEngine */
  renderingEngineId: string;
  /** The display set whose appearance changed */
  displaySetId: string;
  /** Whether the display set is the source of the viewport or an overlay */
  role: 'source' | 'overlay';
  /** The volume that the display set draws, when it draws one */
  volumeId?: string;
  /** Why it changed. See {@link DisplaySetAppearanceChangeCause}. */
  cause: DisplaySetAppearanceChangeCause;
  /**
   * The keys whose override or effective value changed. For `'mount'`
   * every key that has an effective value.
   */
  changedKeys: Array<keyof TAppearance & string>;
  /** The explicit overrides after the change */
  overrides: Partial<TAppearance>;
  /** The effective values after the change: the overrides over the defaults */
  effective: TAppearance;
}

/**
 * ELEMENT_DISABLED Event's data
 */
interface ElementDisabledEventDetail {
  /** Viewport HTML element in the DOM */
  element: HTMLDivElement;
  /** Viewport Unique ID in the renderingEngine */
  viewportId: string;
  /** Unique ID for the renderingEngine */
  renderingEngineId: string;
}

/**
 * ELEMENT_Enabled Event's data
 */
interface ElementEnabledEventDetail {
  /** Viewport HTML element in the DOM */
  element: HTMLDivElement;
  /** Viewport Unique ID in the renderingEngine */
  viewportId: string;
  /** Unique ID for the renderingEngine */
  renderingEngineId: string;
}

/**
 * VIEWPORT_FIDELITY_CHANGED Event's data (FIDELITY-EVENT-3)
 */
interface ViewportFidelityChangedEventDetail {
  /** Viewport Unique ID in the renderingEngine */
  viewportId: string;
  /** Unique ID for the renderingEngine */
  renderingEngineId: string;
  /**
   * Absolute per-viewport fidelity record (FIDELITY-EVENT-5). Not a UI summary enum.
   */
  state: ViewportFidelityState;
}

/**
 * VIEWPORT_FIDELITY_CHANGED Event type
 */
type ViewportFidelityChangedEvent =
  CustomEventType<ViewportFidelityChangedEventDetail>;

/**
 * IMAGE_RENDERED Event's data
 */
interface ImageRenderedEventDetail {
  /** Viewport HTML element in the DOM */
  element: HTMLDivElement;
  /** Viewport Unique ID in the renderingEngine */
  viewportId: string;
  /** Unique ID for the renderingEngine */
  renderingEngineId: string;
  /** Whether to suppress the event */
  suppressEvents?: boolean;
  /** Include information on whether this is a real rendering or just background */
  viewportStatus: ViewportStatus;
}
/**
 * IMAGE_VOLUME_MODIFIED Event's data
 */
interface ImageVolumeModifiedEventDetail {
  volumeId: string;
  /** FrameOfReferenceUID where the volume belongs to */
  FrameOfReferenceUID: string;
  /** number of frames */
  numberOfFrames: number;
  /** framesProcessed */
  framesProcessed: number;
}

/**
 * IMAGE_VOLUME_LOADING_COMPLETED Event's data
 */
interface ImageVolumeLoadingCompletedEventDetail {
  /** the loaded volume */
  volumeId: string;
  /** FrameOfReferenceUID where the volume belongs to */
  FrameOfReferenceUID: string;
}

/**
 * IMAGE_LOADED Event's data
 */
interface ImageLoadedEventDetail {
  /** the loaded image */
  image: IImage;
}

export interface ImageLoadStageEventDetail {
  stageId: string;
  numberOfImages: number;
  numberOfFailures: number;
  // The duration of just this stage
  stageDurationInMS: number;
  // The overall duration
  startDurationInMS: number;
}

/**
 * IMAGE_LOADED_FAILED Event's data
 */
interface ImageLoadedFailedEventDetail {
  /** the imageId for the image */
  imageId: string;
  error: unknown;
}

/**
 * VOLUME_LOADED Event's data
 */
interface VolumeLoadedEventDetail {
  /** the loaded volume */
  volume: IImageVolume;
}

/**
 * VOLUME_LOADED_FAILED Event's data
 */
interface VolumeLoadedFailedEventDetail {
  /** the volumeId for the volume */
  volumeId: string;
  error: unknown;
}

/**
 * IMAGE_CACHE_IMAGE_REMOVED Event's data
 */
interface ImageCacheImageRemovedEventDetail {
  /** the removed image id */
  imageId: string;
}

/**
 * IMAGE_CACHE_IMAGE_ADDED Event's data
 */
interface ImageCacheImageAddedEventDetail {
  /** the added image */
  image: ICachedImage;
}

/**
 * CACHE_SIZE_EXCEEDED Event's data
 */
interface CacheSizeExceededEventDetail {
  /** the id of the image that did not fit */
  imageId: string;
  /** the size of the image in bytes */
  sizeInBytes: number;
}

/**
 * VOLUME_CACHE_VOLUME_REMOVED Event's data
 */
interface VolumeCacheVolumeRemovedEventDetail {
  /** the removed volume id */
  volumeId: string;
}

/**
 * VOLUME_CACHE_VOLUME_ADDED Event's data
 */
interface VolumeCacheVolumeAddedEventDetail {
  /** the added volume */
  volume: ICachedVolume;
}

/**
 * NEW_IMAGE Event's data. A viewport fires the event when it shows another
 * image of its source display set: a planar viewport for another image of a
 * stack and for another slice of a volume, a video viewport for another
 * frame. The detail has the same keys in every mode.
 */
interface NewImageEventDetail {
  /** unique id for the viewport */
  viewportId: string;
  /** unique id for the renderingEngine */
  renderingEngineId: string;
  /** The source display set of the viewport, the one whose image this is. */
  displaySetId: string;
  /**
   * The index of the slice on display along the view, 0-based, which is what
   * `viewport.getSliceIndex()` and `viewport.getCurrentImageIdIndex()` give
   * and what a view reference names as `sliceIndex`. In stack mode it is the
   * index of the image in the stack. In volume mode it counts the slices
   * along the view, in any orientation, which can run against the order of
   * the image ids: it is not the place of `imageId` in the image ids. On a
   * video it is the index of the frame.
   */
  sliceIndex: number;
  /**
   * How many there are along the view, which is what
   * `viewport.getNumberOfSlices()` gives. In stack mode it is the number of
   * images of the stack. In volume mode it is the number of slices of the
   * volume along the view. On a video it is the number of frames.
   */
  numberOfSlices: number;
  /**
   * The image on display, which is what `viewport.getCurrentImageId()` gives.
   * In stack mode it is the image id of the image. In volume mode it is the
   * image id of the slice, and undefined for a cut that shows no single
   * image, as an oblique cut or a reformat. On a video it is the image id of
   * the frame.
   */
  imageId?: string;
  /**
   * The image object, when the viewport shows one image that is in the cache:
   * the image of a stack. Undefined in volume mode and on a video.
   */
  image?: IImage;
}

/**
 * IMAGE_SPACING_CALIBRATED Event's data
 */
interface ImageSpacingCalibratedEventDetail {
  element: HTMLDivElement;
  viewportId: string;
  renderingEngineId: string;
  imageId: string;
  /** calibration contains the scaling information as well as other calibration info */
  calibration: IImageCalibration;
  imageData: vtkImageData;
  worldToIndex: mat4;
}

/**
 * One display set that a viewport shows, as DISPLAY_SETS_CHANGED gives it:
 * its id and its role, `source` for the display set that defines the view
 * and `overlay` for each one drawn over it.
 */
interface DisplaySetsChangedEntry {
  displaySetId: string;
  role: 'source' | 'overlay';
}

/**
 * The DISPLAY_SETS_CHANGED event's data: the display sets that the viewport
 * shows after one committed `setDisplaySets`, `addDisplaySet` or
 * `removeDisplaySet`, and what the call changed.
 */
interface DisplaySetsChangedEventDetail {
  element: HTMLDivElement;
  viewportId: string;
  renderingEngineId: string;
  /**
   * The display sets that the viewport shows now, in the order of
   * `viewport.getDisplaySets()`, each with its role.
   */
  displaySets: DisplaySetsChangedEntry[];
  /** The source display set now, undefined when the viewport shows nothing. */
  sourceDisplaySetId?: string;
  /**
   * The display sets that the call mounted: new ones, and one that it
   * mounted again, as `setDisplaySets` mounts its source again.
   */
  added: string[];
  /** The display sets that the viewport showed before the call and no longer shows. */
  removed: string[];
  /**
   * True when the source display set is another one now, or the call
   * mounted it again; false when only an overlay came or went, such as a
   * labelmap. A listener that cares only for the source returns early on
   * false.
   */
  sourceChanged: boolean;
}

/**
 * SCROLL_OUT_OF_BOUNDS Event's data: a scroll without `loop` stopped at the
 * first or the last position short of the position it asked for. A
 * position is an image of a stack, a slice of a volume along the view in
 * any orientation, a slab with `scrollSlabs`, a slice of the volume that
 * `volumeId` of the scroll names, or a frame of a video.
 */
interface ScrollOutOfBoundsEventDetail {
  /** unique id for the viewport */
  viewportId: string;
  /** unique id for the renderingEngine */
  renderingEngineId: string;
  /** The source display set of the viewport. */
  displaySetId: string;
  /**
   * In volume mode the volume whose slices the scroll counts: the
   * `volumeId` of the scroll, else the volume on display. Undefined for a
   * stack and a video.
   */
  volumeId?: string;
  /**
   * The position the scroll stopped at: 0, or `numberOfSlices - 1`,
   * counted in the positions of the scroll.
   */
  sliceIndex: number;
  /** How many positions the scroll has. */
  numberOfSlices: number;
  /** The signed number of steps that the scroll asked for. */
  delta: number;
  /** -1 when the scroll stopped at the first position, 1 at the last. */
  direction: -1 | 1;
  /**
   * The image on display, which is what `viewport.getCurrentImageId()`
   * gives: undefined for a cut that shows no single image, as an oblique
   * cut or a reformat. On a video it is the image id of the frame.
   */
  imageId?: string;
}

/**
 * CameraModified Event type
 */
type CameraModifiedEvent = CustomEventType<CameraModifiedEventDetail>;

/**
 * DISPLAY_SET_APPEARANCE_CHANGED Event type
 */
type DisplaySetAppearanceChangedEvent<
  TAppearance extends object = PlanarDisplaySetAppearance,
> = CustomEventType<DisplaySetAppearanceChangedEventDetail<TAppearance>>;

/**
 * ELEMENT_DISABLED Event type
 */
type ElementDisabledEvent = CustomEventType<ElementDisabledEventDetail>;

/**
 * ELEMENT_ENABLED Event type
 */
type ElementEnabledEvent = CustomEventType<ElementEnabledEventDetail>;

/**
 * IMAGE_RENDERED Event type
 */
type ImageRenderedEvent = CustomEventType<ElementEnabledEventDetail>;

/**
 * IMAGE_VOLUME_MODIFIED Event type
 */
type ImageVolumeModifiedEvent = CustomEventType<ImageVolumeModifiedEventDetail>;

/**
 * IMAGE_VOLUME_LOADING_COMPLETED Event type
 * This event is fired when a volume is fully loaded, means all the frames
 * are loaded and cached.
 */
type ImageVolumeLoadingCompletedEvent =
  CustomEventType<ImageVolumeLoadingCompletedEventDetail>;

/**
 * IMAGE_LOADED Event type
 */
type ImageLoadedEvent = CustomEventType<ImageLoadedEventDetail>;

/**
 * IMAGE_LOADED_FAILED Event type
 */
type ImageLoadedFailedEvent = CustomEventType<ImageLoadedFailedEventDetail>;

/**
 * VOLUME_LOADED Event type
 */
type VolumeLoadedEvent = CustomEventType<VolumeLoadedEventDetail>;

/**
 * VOLUME_LOADED_FAILED Event type
 */
type VolumeLoadedFailedEvent = CustomEventType<VolumeLoadedFailedEventDetail>;

/**
 * IMAGE_CACHE_IMAGE_ADDED Event type
 */
type ImageCacheImageAddedEvent =
  CustomEventType<ImageCacheImageAddedEventDetail>;

/**
 * CACHE_SIZE_EXCEEDED Event type
 */
type CacheSizeExceededEvent = CustomEventType<CacheSizeExceededEventDetail>;

/**
 * IMAGE_CACHE_IMAGE_REMOVED Event type
 */
type ImageCacheImageRemovedEvent =
  CustomEventType<ImageCacheImageRemovedEventDetail>;

/**
 * VOLUME_CACHE_VOLUME_ADDED Event type
 */
type VolumeCacheVolumeAddedEvent =
  CustomEventType<VolumeCacheVolumeAddedEventDetail>;

/**
 * VOLUME_CACHE_VOLUME_REMOVED Event type
 */
type VolumeCacheVolumeRemovedEvent =
  CustomEventType<VolumeCacheVolumeRemovedEventDetail>;

/**
 * NEW_IMAGE
 */
type NewImageEvent = CustomEventType<NewImageEventDetail>;

/**
 * IMAGE_SPACING_CALIBRATED
 */
type ImageSpacingCalibratedEvent =
  CustomEventType<ImageSpacingCalibratedEventDetail>;

/**
 * DISPLAY_SETS_CHANGED
 */
type DisplaySetsChangedEvent = CustomEventType<DisplaySetsChangedEventDetail>;

/**
 * SCROLL_OUT_OF_BOUNDS Event type
 */
type ScrollOutOfBoundsEvent = CustomEventType<ScrollOutOfBoundsEventDetail>;

export type {
  ViewportFidelityChangedEventDetail,
  ViewportFidelityChangedEvent,
  CameraModifiedEventDetail,
  CameraModifiedEvent,
  DisplaySetAppearanceChangeCause,
  DisplaySetAppearanceChangedEvent,
  DisplaySetAppearanceChangedEventDetail,
  ElementDisabledEvent,
  ElementDisabledEventDetail,
  ElementEnabledEvent,
  ElementEnabledEventDetail,
  ImageRenderedEventDetail,
  ImageRenderedEvent,
  ImageVolumeModifiedEvent,
  ImageVolumeModifiedEventDetail,
  ImageVolumeLoadingCompletedEvent,
  ImageVolumeLoadingCompletedEventDetail,
  ImageLoadedEvent,
  ImageLoadedEventDetail,
  ImageLoadedFailedEventDetail,
  ImageLoadedFailedEvent,
  VolumeLoadedEvent,
  VolumeLoadedEventDetail,
  VolumeLoadedFailedEvent,
  VolumeLoadedFailedEventDetail,
  ImageCacheImageAddedEvent,
  ImageCacheImageAddedEventDetail,
  CacheSizeExceededEvent,
  CacheSizeExceededEventDetail,
  ImageCacheImageRemovedEvent,
  ImageCacheImageRemovedEventDetail,
  VolumeCacheVolumeAddedEvent,
  VolumeCacheVolumeAddedEventDetail,
  VolumeCacheVolumeRemovedEvent,
  VolumeCacheVolumeRemovedEventDetail,
  NewImageEvent,
  NewImageEventDetail,
  ImageSpacingCalibratedEvent,
  ImageSpacingCalibratedEventDetail,
  DisplaySetsChangedEntry,
  DisplaySetsChangedEvent,
  DisplaySetsChangedEventDetail,
  ScrollOutOfBoundsEvent,
  ScrollOutOfBoundsEventDetail,
  CameraResetEvent,
  CameraResetEventDetail,
};
