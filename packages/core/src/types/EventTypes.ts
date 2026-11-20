import type { mat4 } from 'gl-matrix';
import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import type CustomEventType from '../types/CustomEventType';
import type ICachedImage from './ICachedImage';
import type ICachedVolume from './ICachedVolume';
import type ICamera from './ICamera';
import type IImage from './IImage';
import type IImageVolume from './IImageVolume';
import type { VOIRange } from './voi';
import type VOILUTFunctionType from '../enums/VOILUTFunctionType';
import type ViewportStatus from '../enums/ViewportStatus';
import type DisplayArea from './displayArea';
import type IImageCalibration from './IImageCalibration';
import type { ColormapPublic } from './Colormap';
import type { IViewport } from './IViewport';
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
 * VOI_MODIFIED Event's data
 */
interface VoiModifiedEventDetail {
  /** Viewport Unique ID in the renderingEngine */
  viewportId: string;
  /** new VOI range */
  range: VOIRange;
  /** Unique ID for the volume in the cache */
  volumeId?: string;
  /** VOILUTFunction */
  VOILUTFunction?: VOILUTFunctionType;
  /** inverted */
  invert?: boolean;
  /** Indicates if the 'invert' state has changed from the previous state */
  invertStateChanged?: boolean;
  /** color map */
  colormap?: ColormapPublic;
}

interface ColormapModifiedEventDetail {
  /** Viewport Unique ID in the renderingEngine */
  viewportId: string;
  /** The new colormap */
  colormap: ColormapPublic;
  /** Unique ID for the volume in the cache */
  volumeId?: string;
}

/**
 * DISPLAY_AREA_MODIFIED Event's data
 */
interface DisplayAreaModifiedEventDetail {
  /** Viewport Unique ID in the renderingEngine */
  viewportId: string;
  /** new display area */
  displayArea: DisplayArea;
  /** Unique ID for the volume in the cache */
  volumeId?: string;
  /** Whether displayArea was stored as initial view */
  storeAsInitialCamera?: boolean;
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
 * Volume Scroll Out of Bounds event detail
 */
type VolumeScrollOutOfBoundsEventDetail = {
  volumeId: string;
  viewport: IViewport;
  desiredStepIndex: number;
  currentStepIndex: number;
  delta: number; // difference between the desired and current frame
  numScrollSteps: number; // total scroll steps in the volume
  /**
   * The image id shown after the scroll. Undefined out of the acquisition
   * plane, where the view shows no single image, as in 5.x.
   */
  currentImageId?: string;
};

/**
 * NEW_IMAGE Event's data. A viewport fires the event when it shows another
 * image: a planar viewport for another image of a stack and for another slice
 * of a volume, a video viewport for another frame. The detail has the same
 * keys in every mode.
 */
interface NewImageEventDetail {
  /** unique id for the viewport */
  viewportId: string;
  /** unique id for the renderingEngine */
  renderingEngineId: string;
  /**
   * The index of what is on display, which is what
   * `viewport.getCurrentImageIdIndex()` gives. In stack mode it is the index
   * of the image in the stack. In volume mode it is the slice index of the
   * view, in any orientation: it counts along the view, which can run against
   * the order of the image ids, so it is not the place of `imageId` in the
   * image ids. On a video it is the 0-based index of the frame.
   */
  imageIdIndex: number;
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
 * The VIEWPORT_NEW_IMAGE_SET event's data, when a planar viewport shows a new stack
 */
interface StackViewportNewStackEventDetail {
  imageIds: string[];
  viewportId: string;
  element: HTMLDivElement;
  currentImageIdIndex: number;
}

/**
 * Stack Scroll out of bounds event detail
 */
type StackScrollOutOfBoundsEventDetail = {
  /** the current imageId index in the stack that we just scroll to */
  imageIdIndex: number;
  /** direction of the scroll */
  direction: number;
};

/**
 * CameraModified Event type
 */
type CameraModifiedEvent = CustomEventType<CameraModifiedEventDetail>;

/**
 * VOI_MODIFIED Event type
 */
type VoiModifiedEvent = CustomEventType<VoiModifiedEventDetail>;

/**
 * COLORMAP_MODIFIED Event type
 */
type ColormapModifiedEvent = CustomEventType<ColormapModifiedEventDetail>;

/**
 * DISPLAY_AREA_MODIFIED Event type
 */
type DisplayAreaModifiedEvent = CustomEventType<DisplayAreaModifiedEventDetail>;

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
 * VIEWPORT_NEW_IMAGE_SET
 */
type StackViewportNewStackEvent =
  CustomEventType<StackViewportNewStackEventDetail>;

type StackScrollOutOfBoundsEvent =
  CustomEventType<StackScrollOutOfBoundsEventDetail>;

type VolumeScrollOutOfBoundsEvent =
  CustomEventType<VolumeScrollOutOfBoundsEventDetail>;

export type {
  VolumeScrollOutOfBoundsEventDetail,
  VolumeScrollOutOfBoundsEvent,
  ViewportFidelityChangedEventDetail,
  ViewportFidelityChangedEvent,
  CameraModifiedEventDetail,
  CameraModifiedEvent,
  VoiModifiedEvent,
  VoiModifiedEventDetail,
  ColormapModifiedEvent,
  ColormapModifiedEventDetail,
  DisplayAreaModifiedEvent,
  DisplayAreaModifiedEventDetail,
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
  StackViewportNewStackEvent,
  StackViewportNewStackEventDetail,
  StackScrollOutOfBoundsEvent,
  StackScrollOutOfBoundsEventDetail,
  CameraResetEvent,
  CameraResetEventDetail,
};
