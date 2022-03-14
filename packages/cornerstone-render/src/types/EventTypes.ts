import { CustomEventType } from '../types'
import ICachedImage from './ICachedImage'
import ICachedVolume from './ICachedVolume'
import ICamera from './ICamera'
import IImage from './IImage'
import IImageVolume from './IImageVolume'
import { VOIRange } from './voi'
import type { mat4 } from 'gl-matrix'
import type vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData'

/**
 * CAMERA_MODIFIED Event's data
 */
type CameraModifiedEventData = {
  /** Previous camera properties */
  previousCamera: ICamera
  /** Current camera properties */
  camera: ICamera
  /** Viewport HTML element in the DOM */
  element: HTMLElement
  /** Viewport Unique ID in the renderingEngine */
  viewportUID: string
  /** Unique ID for the renderingEngine */
  renderingEngineUID: string
}

/**
 * VOI_MODIFIED Event's data
 */
type VoiModifiedEventData = {
  /** Viewport Unique ID in the renderingEngine */
  viewportUID: string
  /** Unique ID for the volume in the cache */
  volumeUID: string
  /** new VOI range */
  range: VOIRange
}

/**
 * ELEMENT_DISABLED Event's data
 */
type ElementDisabledEventData = {
  /** Viewport HTML element in the DOM */
  element: HTMLElement
  /** Viewport Unique ID in the renderingEngine */
  viewportUID: string
  /** Unique ID for the renderingEngine */
  renderingEngineUID: string
}

/**
 * ELEMENT_Enabled Event's data
 */
type ElementEnabledEventData = {
  /** Viewport HTML element in the DOM */
  element: HTMLElement
  /** Viewport Unique ID in the renderingEngine */
  viewportUID: string
  /** Unique ID for the renderingEngine */
  renderingEngineUID: string
}

/**
 * IMAGE_RENDERED Event's data
 */
type ImageRenderedEventData = {
  /** Viewport HTML element in the DOM */
  element: HTMLElement
  /** Viewport Unique ID in the renderingEngine */
  viewportUID: string
  /** Unique ID for the renderingEngine */
  renderingEngineUID: string
  /** Whether to suppress the event */
  suppressEvents?: boolean
}
/**
 * IMAGE_VOLUME_MODIFIED Event's data
 */
type ImageVolumeModifiedEventData = {
  /** the modified volume */
  imageVolume: IImageVolume
  /** FrameOfReferenceUID where the volume belongs to */
  FrameOfReferenceUID: string
}

/**
 * IMAGE_LOADED Event's data
 */
type ImageLoadedEventData = {
  /** the loaded image */
  image: IImage
}

/**
 * IMAGE_LOADED_FAILED Event's data
 */
type ImageLoadedFailedEventData = {
  /** the imageId for the image */
  imageId: string
  error: unknown
}

/**
 * VOLUME_LOADED Event's data
 */
type VolumeLoadedEventData = {
  /** the loaded volume */
  volume: IImageVolume
}

/**
 * VOLUME_LOADED_FAILED Event's data
 */
type VolumeLoadedFailedEventData = {
  /** the volumeId for the volume */
  volumeId: string
  error: unknown
}

/**
 * IMAGE_CACHE_IMAGE_REMOVED Event's data
 */
type ImageCacheImageRemovedEventData = {
  /** the removed image id */
  imageId: string
}

/**
 * IMAGE_CACHE_IMAGE_ADDED Event's data
 */
type ImageCacheImageAddedEventData = {
  /** the added image */
  image: ICachedImage
}

/**
 * VOLUME_CACHE_VOLUME_REMOVED Event's data
 */
type VolumeCacheVolumeRemovedEventData = {
  /** the removed volume id */
  volumeId: string
}

/**
 * VOLUME_CACHE_VOLUME_ADDED Event's data
 */
type VolumeCacheVolumeAddedEventData = {
  /** the added volume */
  volume: ICachedVolume
}

/**
 * STACK_NEW_IMAGE Event's data
 */
type StackNewImageEventData = {
  /** the new image set on the stack viewport */
  image: IImage
  /** the image imageId */
  imageId: string
  /** unique id for the viewport */
  viewportUID: string
  /** unique id for the renderingEngine */
  renderingEngineUID: string
}

/**
 * IMAGE_SPACING_CALIBRATED Event's data
 */
type ImageSpacingCalibratedEventData = {
  element: HTMLElement
  viewportUID: string
  renderingEngineUID: string
  imageId: string
  rowScale: number
  columnScale: number
  imageData: vtkImageData
  worldToIndex: mat4
}

/**
 * IMAGE_LOAD_PROGRESS Event's data. Note this is only for one image load and NOT volume load.
 */
type ImageLoadProgressEventData = {
  /** url we are loading from */
  url: string
  /** loading image image id */
  imageId: string
  /** the bytes browser receive */
  loaded: number
  /** the total bytes settled by the header */
  total: number
  /** loaded divided by total * 100 - shows the percentage of the image loaded */
  percent: number
}

/**
 * CameraModified Event type
 */
type CameraModifiedEvent = CustomEventType<CameraModifiedEventData>

/**
 * VOI_MODIFIED Event type
 */
type VoiModifiedEvent = CustomEventType<VoiModifiedEventData>

/**
 * ELEMENT_DISABLED Event type
 */
type ElementDisabledEvent = CustomEventType<ElementDisabledEventData>

/**
 * ELEMENT_ENABLED Event type
 */
type ElementEnabledEvent = CustomEventType<ElementEnabledEventData>

/**
 * IMAGE_RENDERED Event type
 */
type ImageRenderedEvent = CustomEventType<ElementEnabledEventData>

/**
 * IMAGE_VOLUME_MODIFIED Event type
 */
type ImageVolumeModifiedEvent = CustomEventType<ImageVolumeModifiedEventData>

/**
 * IMAGE_LOADED Event type
 */
type ImageLoadedEvent = CustomEventType<ImageLoadedEventData>

/**
 * IMAGE_LOADED_FAILED Event type
 */
type ImageLoadedFailedEvent = CustomEventType<ImageLoadedFailedEventData>

/**
 * VOLUME_LOADED Event type
 */
type VolumeLoadedEvent = CustomEventType<VolumeLoadedEventData>

/**
 * VOLUME_LOADED_FAILED Event type
 */
type VolumeLoadedFailedEvent = CustomEventType<VolumeLoadedFailedEventData>

/**
 * IMAGE_CACHE_IMAGE_ADDED Event type
 */
type ImageCacheImageAddedEvent = CustomEventType<ImageCacheImageAddedEventData>

/**
 * IMAGE_CACHE_IMAGE_REMOVED Event type
 */
type ImageCacheImageRemovedEvent =
  CustomEventType<ImageCacheImageRemovedEventData>

/**
 * VOLUME_CACHE_VOLUME_ADDED Event type
 */
type VolumeCacheVolumeAddedEvent =
  CustomEventType<VolumeCacheVolumeAddedEventData>

/**
 * VOLUME_CACHE_VOLUME_REMOVED Event type
 */
type VolumeCacheVolumeRemovedEvent =
  CustomEventType<VolumeCacheVolumeRemovedEventData>

/**
 * START_NEW_IMAGE
 */
type StartNewImageEvent = CustomEventType<StackNewImageEventData>

/**
 * IMAGE_SPACING_CALIBRATED
 */
type ImageSpacingCalibratedEvent =
  CustomEventType<ImageSpacingCalibratedEventData>

/**
 * IMAGE_LOAD_PROGRESS
 */
type ImageLoadProgressEvent = CustomEventType<ImageLoadProgressEventData>

export type {
  CameraModifiedEventData,
  CameraModifiedEvent,
  VoiModifiedEvent,
  VoiModifiedEventData,
  ElementDisabledEvent,
  ElementDisabledEventData,
  ElementEnabledEvent,
  ElementEnabledEventData,
  ImageRenderedEventData,
  ImageRenderedEvent,
  ImageVolumeModifiedEvent,
  ImageVolumeModifiedEventData,
  ImageLoadedEvent,
  ImageLoadedEventData,
  ImageLoadedFailedEventData,
  ImageLoadedFailedEvent,
  VolumeLoadedEvent,
  VolumeLoadedEventData,
  VolumeLoadedFailedEvent,
  VolumeLoadedFailedEventData,
  ImageCacheImageAddedEvent,
  ImageCacheImageAddedEventData,
  ImageCacheImageRemovedEvent,
  ImageCacheImageRemovedEventData,
  VolumeCacheVolumeAddedEvent,
  VolumeCacheVolumeAddedEventData,
  VolumeCacheVolumeRemovedEvent,
  VolumeCacheVolumeRemovedEventData,
  StartNewImageEvent,
  StackNewImageEventData,
  ImageSpacingCalibratedEvent,
  ImageSpacingCalibratedEventData,
  ImageLoadProgressEvent,
  ImageLoadProgressEventData,
}
