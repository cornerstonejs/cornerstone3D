/**
 * Cornerstone Core events
 */
enum Events {
  /**
   * Triggers on the HTML element when the viewport camera changes.
   *
   * Make use of {@link EventsTypes.CameraModifiedEvent | CameraModified Event Type } for typing your event listeners for CAMERA_MODIFIED event,
   * and see what event detail is included in {@link EventsTypes.CameraModifiedEventData | CameraModified Event Data }
   */
  CAMERA_MODIFIED = 'CORNERSTONE_CAMERA_MODIFIED',
  /**
   * Triggers on the HTML element when viewport modifies its VOI
   *
   * Make use of {@link EventsTypes.VoiModifiedEvent | VoiModified Event Type } for typing your event listeners for VOI_MODIFIED event,
   * and see what event detail is included in {@link EventsTypes.VoiModifiedEventData | VoiModified Event Data }
   */
  VOI_MODIFIED = 'CORNERSTONE_VOI_MODIFIED',
  /**
   * Triggers on the eventTarget when the element is disabled
   *
   * Make use of {@link EventsTypes.ElementDisabledEvent | ElementDisabled Event Type } for typing your event listeners for ELEMENT_DISABLED event,
   * and see what event detail is included in {@link EventsTypes.ElementDisabledEventData | ElementDisabled Event Data }
   */
  ELEMENT_DISABLED = 'CORNERSTONE_ELEMENT_DISABLED',
  /**
   * Triggers on the eventTarget when the element is enabled
   *
   * Make use of {@link EventsTypes.ElementEnabledEvent | ElementEnabled Event Type } for typing your event listeners for ELEMENT_ENABLED event,
   * and see what event detail is included in {@link EventsTypes.ElementEnabledEventData | ElementEnabled Event Data }
   */
  ELEMENT_ENABLED = 'CORNERSTONE_ELEMENT_ENABLED',
  /**
   * Triggers on the element when the image in the element has been rendered
   *
   * Make use of {@link EventsTypes.ImageRenderedEvent | ImageRendered Event Type } for typing your event listeners for IMAGE_RENDERED event,
   * and see what event detail is included in {@link EventsTypes.ImageRenderedEventData | ImageRendered Event Data }
   */
  IMAGE_RENDERED = 'CORNERSTONE_IMAGE_RENDERED',
  /**
   * Triggers on the eventTarget when the image volume data is modified. This happens
   * in the streamingImageLoader when each frame is loaded and inserted into a volume.
   *
   *
   * Make use of {@link EventsTypes.ImageVolumeModifiedEvent | ImageVolumeModified Event Type } for typing your event listeners for IMAGE_VOLUME_MODIFIED event,
   * and see what event detail is included in {@link EventsTypes.ImageVolumeModifiedEventData | ImageVolumeModified Event Data }
   */
  IMAGE_VOLUME_MODIFIED = 'CORNERSTONE_IMAGE_VOLUME_MODIFIED',
  /**
   * Triggers on the eventTarget when the image has successfully loaded by imageLoaders
   *
   * Make use of {@link EventsTypes.ImageLoadedEvent | ImageLoaded Event Type } for typing your event listeners for IMAGE_LOADED event,
   * and see what event detail is included in {@link EventsTypes.ImageLoadedEventData | ImageLoaded Event Data }
   */
  IMAGE_LOADED = 'CORNERSTONE_IMAGE_LOADED',
  /**
   * Triggers on the eventTarget when the image has failed loading by imageLoaders
   *
   * Make use of {@link EventsTypes.ImageLoadedFailedEvent | ImageLoadedFailed Event Type } for typing your event listeners for IMAGE_LOADED_FAILED event,
   * and see what event detail is included in {@link EventsTypes.ImageLoadedFailedEventData | ImageLoadedFailed Event Data }
   */
  IMAGE_LOAD_FAILED = 'CORNERSTONE_IMAGE_LOAD_FAILED',
  /**
   * Triggers on the eventTarget when the volume has successfully loaded by volumeLoaders
   *
   * Make use of {@link EventsTypes.VolumeLoadedEvent | VolumeLoaded Event Type } for typing your event listeners for VOLUME_LOADED event,
   * and see what event detail is included in {@link EventsTypes.VolumeLoadedEventData | VolumeLoaded Event Data }
   */
  VOLUME_LOADED = 'CORNERSTONE_VOLUME_LOADED',
  /**
   * Triggers on the eventTarget when the image has failed loading by volumeLoaders
   *
   * Make use of {@link EventsTypes.VolumeLoadedFailedEvent | VolumeLoadedFailed Event Type } for typing your event listeners for VOLUME_LOADED_FAILED event,
   * and see what event detail is included in {@link EventsTypes.VolumeLoadedFailedEventData | VolumeLoadedFailed Event Data }
   */
  VOLUME_LOADED_FAILED = 'CORNERSTONE_VOLUME_LOADED_FAILED',
  /**
   * Triggers on the eventTarget when an image is added to the image cache
   *
   * Make use of {@link EventsTypes.ImageCacheImageAddedEvent | ImageCacheAdded Event Type } for typing your event listeners for IMAGE_CACHE_ADDED event,
   * and see what event detail is included in {@link EventsTypes.ImageCacheImageAddedEventData | ImageCacheAdded Event Data }
   */
  IMAGE_CACHE_IMAGE_ADDED = 'CORNERSTONE_IMAGE_CACHE_IMAGE_ADDED',
  /**
   * Triggers on the eventTarget when an image is removed from the image cache
   *
   * Make use of {@link EventsTypes.ImageCacheImageRemovedEvent | ImageCacheRemoved Event Type } for typing your event listeners for IMAGE_CACHE_REMOVED event,
   * and see what event detail is included in {@link EventsTypes.ImageCacheImageRemovedEventData | ImageCacheRemoved Event Data }
   */
  IMAGE_CACHE_IMAGE_REMOVED = 'CORNERSTONE_IMAGE_CACHE_IMAGE_REMOVED',
  /**
   * Triggers on the eventTarget when a volume is added to the volume cache
   *
   * Make use of {@link EventsTypes.VolumeCacheVolumeAddedEvent | VolumeCacheAdded Event Type } for typing your event listeners for VOLUME_CACHE_ADDED event,
   * and see what event detail is included in {@link EventsTypes.VolumeCacheVolumeAddedEventData | VolumeCacheAdded Event Data }
   */
  VOLUME_CACHE_VOLUME_ADDED = 'CORNERSTONE_VOLUME_CACHE_VOLUME_ADDED',
  /**
   * Triggers on the eventTarget when a volume is removed from the volume cache
   *
   * Make use of {@link EventsTypes.VolumeCacheVolumeRemovedEvent | VolumeCacheRemoved Event Type } for typing your event listeners for VOLUME_CACHE_REMOVED event,
   * and see what event detail is included in {@link EventsTypes.VolumeCacheVolumeRemovedEventData | VolumeCacheRemoved Event Data }
   */
  VOLUME_CACHE_VOLUME_REMOVED = 'CORNERSTONE_VOLUME_CACHE_VOLUME_REMOVED',
  /**
   * Triggers on the element when a new image is set on the stackViewport
   *
   * Make use of {@link EventsTypes.StackNewImageEvent | StackNewImage Event Type } for typing your event listeners for STACK_NEW_IMAGE event,
   * and see what event detail is included in {@link EventsTypes.StackNewImageEventData | StackNewImage Event Data }
   */
  STACK_NEW_IMAGE = 'CORNERSTONE_STACK_NEW_IMAGE',
  /**
   * Triggers on the element when the viewport's image has calibrated its pixel spacings
   *
   * Make use of {@link EventsTypes.ImageSpacingCalibratedEvent | ImageSpacingCalibrated Event Type } for typing your event listeners for IMAGE_SPACING_CALIBRATED event,
   * and see what event detail is included in {@link EventsTypes.ImageSpacingCalibratedEventData | ImageSpacingCalibrated Event Data }
   */
  IMAGE_SPACING_CALIBRATED = 'CORNERSTONE_IMAGE_SPACING_CALIBRATED',
  /**
   * Triggers on the eventTarget when there is a progress in the image load process. Note: this event
   * is being used in the Cornerstone-WADO-Image-Loader repository. See {@link https://github.com/cornerstonejs/cornerstoneWADOImageLoader/blob/master/src/imageLoader/internal/xhrRequest.js | here}
   *
   * Make use of {@link EventsTypes.ImageLoadProgress | ImageLoadProgress Event Type } for typing your event listeners for IMAGE_LOAD_PROGRESS event,
   * and see what event detail is included in {@link EventsTypes.ImageLoadProgressEventData | ImageLoadProgress Event Data }
   */
  IMAGE_LOAD_PROGRESS = 'CORNERSTONE_IMAGE_LOAD_PROGRESS',
  // IMAGE_CACHE_FULL = 'CORNERSTONE_IMAGE_CACHE_FULL',
  // PRE_RENDER = 'CORNERSTONE_PRE_RENDER',
  // ELEMENT_RESIZED = 'CORNERSTONE_ELEMENT_RESIZED',
}

export default Events
