import type CustomEventType from '../types/CustomEventType';
import type ICachedImage from './ICachedImage';
import type ICachedVolume from './ICachedVolume';
import type ICamera from './ICamera';
import type IImage from './IImage';
import type IImageVolume from './IImageVolume';
import type { VOIRange } from './voi';
import type { mat4 } from 'gl-matrix';
import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';

/**
 * CAMERA_MODIFIED Event's data
 */
type CameraModifiedEventDetail = {
  /** Previous camera properties */
  previousCamera: ICamera;
  /** Current camera properties */
  camera: ICamera;
  /** Viewport HTML element in the DOM */
  element: HTMLElement;
  /** Viewport Unique ID in the renderingEngine */
  viewportId: string;
  /** Unique ID for the renderingEngine */
  renderingEngineId: string;
};

/**
 * VOI_MODIFIED Event's data
 */
type VoiModifiedEventDetail = {
  /** Viewport Unique ID in the renderingEngine */
  viewportId: string;
  /** Unique ID for the volume in the cache */
  volumeId: string;
  /** new VOI range */
  range: VOIRange;
};

/**
 * ELEMENT_DISABLED Event's data
 */
type ElementDisabledEventDetail = {
  /** Viewport HTML element in the DOM */
  element: HTMLElement;
  /** Viewport Unique ID in the renderingEngine */
  viewportId: string;
  /** Unique ID for the renderingEngine */
  renderingEngineId: string;
};

/**
 * ELEMENT_Enabled Event's data
 */
type ElementEnabledEventDetail = {
  /** Viewport HTML element in the DOM */
  element: HTMLElement;
  /** Viewport Unique ID in the renderingEngine */
  viewportId: string;
  /** Unique ID for the renderingEngine */
  renderingEngineId: string;
};

/**
 * IMAGE_RENDERED Event's data
 */
type ImageRenderedEventDetail = {
  /** Viewport HTML element in the DOM */
  element: HTMLElement;
  /** Viewport Unique ID in the renderingEngine */
  viewportId: string;
  /** Unique ID for the renderingEngine */
  renderingEngineId: string;
  /** Whether to suppress the event */
  suppressEvents?: boolean;
};
/**
 * IMAGE_VOLUME_MODIFIED Event's data
 */
type ImageVolumeModifiedEventDetail = {
  /** the modified volume */
  imageVolume: IImageVolume;
  /** FrameOfReferenceUID where the volume belongs to */
  FrameOfReferenceUID: string;
};

/**
 * IMAGE_LOADED Event's data
 */
type ImageLoadedEventDetail = {
  /** the loaded image */
  image: IImage;
};

/**
 * IMAGE_LOADED_FAILED Event's data
 */
type ImageLoadedFailedEventDetail = {
  /** the imageId for the image */
  imageId: string;
  error: unknown;
};

/**
 * VOLUME_LOADED Event's data
 */
type VolumeLoadedEventDetail = {
  /** the loaded volume */
  volume: IImageVolume;
};

/**
 * VOLUME_LOADED_FAILED Event's data
 */
type VolumeLoadedFailedEventDetail = {
  /** the volumeId for the volume */
  volumeId: string;
  error: unknown;
};

/**
 * IMAGE_CACHE_IMAGE_REMOVED Event's data
 */
type ImageCacheImageRemovedEventDetail = {
  /** the removed image id */
  imageId: string;
};

/**
 * IMAGE_CACHE_IMAGE_ADDED Event's data
 */
type ImageCacheImageAddedEventDetail = {
  /** the added image */
  image: ICachedImage;
};

/**
 * VOLUME_CACHE_VOLUME_REMOVED Event's data
 */
type VolumeCacheVolumeRemovedEventDetail = {
  /** the removed volume id */
  volumeId: string;
};

/**
 * VOLUME_CACHE_VOLUME_ADDED Event's data
 */
type VolumeCacheVolumeAddedEventDetail = {
  /** the added volume */
  volume: ICachedVolume;
};

/**
 * STACK_NEW_IMAGE Event's data
 */
type StackNewImageEventDetail = {
  /** the new image set on the stack viewport */
  image: IImage;
  /** the image imageId */
  imageId: string;
  /** unique id for the viewport */
  viewportId: string;
  /** unique id for the renderingEngine */
  renderingEngineId: string;
};

/**
 * IMAGE_SPACING_CALIBRATED Event's data
 */
type ImageSpacingCalibratedEventDetail = {
  element: HTMLElement;
  viewportId: string;
  renderingEngineId: string;
  imageId: string;
  rowScale: number;
  columnScale: number;
  imageData: vtkImageData;
  worldToIndex: mat4;
};

/**
 * IMAGE_LOAD_PROGRESS Event's data. Note this is only for one image load and NOT volume load.
 */
type ImageLoadProgressEventDetail = {
  /** url we are loading from */
  url: string;
  /** loading image image id */
  imageId: string;
  /** the bytes browser receive */
  loaded: number;
  /** the total bytes settled by the header */
  total: number;
  /** loaded divided by total * 100 - shows the percentage of the image loaded */
  percent: number;
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
 * START_NEW_IMAGE
 */
type StackNewImageEvent = CustomEventType<StackNewImageEventDetail>;

/**
 * IMAGE_SPACING_CALIBRATED
 */
type ImageSpacingCalibratedEvent =
  CustomEventType<ImageSpacingCalibratedEventDetail>;

/**
 * IMAGE_LOAD_PROGRESS
 */
type ImageLoadProgressEvent = CustomEventType<ImageLoadProgressEventDetail>;

export type {
  CameraModifiedEventDetail,
  CameraModifiedEvent,
  VoiModifiedEvent,
  VoiModifiedEventDetail,
  ElementDisabledEvent,
  ElementDisabledEventDetail,
  ElementEnabledEvent,
  ElementEnabledEventDetail,
  ImageRenderedEventDetail,
  ImageRenderedEvent,
  ImageVolumeModifiedEvent,
  ImageVolumeModifiedEventDetail,
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
  ImageCacheImageRemovedEvent,
  ImageCacheImageRemovedEventDetail,
  VolumeCacheVolumeAddedEvent,
  VolumeCacheVolumeAddedEventDetail,
  VolumeCacheVolumeRemovedEvent,
  VolumeCacheVolumeRemovedEventDetail,
  StackNewImageEvent,
  StackNewImageEventDetail,
  ImageSpacingCalibratedEvent,
  ImageSpacingCalibratedEventDetail,
  ImageLoadProgressEvent,
  ImageLoadProgressEventDetail,
};
