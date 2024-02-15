/**
 * Cornerstone Core events
 */
enum Events {
  /**
   * ERROR CODES
   */

  /**
   * Error that is thrown when the ImageCache exceeds its max cache size.
   * This can happen for both volumes and stack images.
   */
  CACHE_SIZE_EXCEEDED = 'CACHE_SIZE_EXCEEDED',
  /**
   * Happens if an image (either a single image in stack viewport) or a slice
   * of a volume fails to load by the image/volume loaders.
   */
  IMAGE_LOAD_ERROR = 'IMAGE_LOAD_ERROR',

  /**
   * Triggers on the HTML element when the viewport camera changes.
   *
   * Make use of {@link EventTypes.CameraModifiedEvent | CameraModified Event Type } for typing your event listeners for CAMERA_MODIFIED event,
   * and see what event detail is included in {@link EventTypes.CameraModifiedEventDetail | CameraModified Event Detail }
   */
  CAMERA_MODIFIED = 'CORNERSTONE_CAMERA_MODIFIED',
  /**
   * Triggers on the HTML element when the viewport camera resets
   *
   * Make use of {@link EventTypes.CameraResetEvent | CameraReset Event Type } for typing your event listeners for CAMERA_RESET event,
   * and see what event detail is included in {@link EventTypes.CameraResetEventDetail | CameraReset Event Detail }
   */
  CAMERA_RESET = 'CORNERSTONE_CAMERA_RESET',
  /**
   * Triggers on the HTML element when viewport modifies its VOI
   *
   * Make use of {@link EventTypes.VoiModifiedEvent | VoiModified Event Type } for typing your event listeners for VOI_MODIFIED event,
   * and see what event detail is included in {@link EventTypes.VoiModifiedEventDetail | VoiModified Event Detail }
   */
  VOI_MODIFIED = 'CORNERSTONE_VOI_MODIFIED',
  /**
   * Triggers on the HTML element when viewport modifies its preset (used in volume viewport 3D)
   *
   * Make use of {@link EventTypes.PresetModifiedEvent | PresetModified Event Type } for typing your event listeners for PRESET_MODIFIED event,
   */
  PRESET_MODIFIED = 'CORNERSTONE_VIEWPORT_RENDERING_PRESET_MODIFIED',
  /**
   * Triggers on the HTML element when viewport modifies its display area
   *
   * Make use of {@link EventTypes.DisplayAreaModifiedEvent | DisplayAreaModified Event Type } for typing your event listeners for DISPLAY_AREA_MODIFIED event,
   * and see what event detail is included in {@link EventTypes.DisplayAreaModifiedEventDetail | DisplayAreaModified Event Detail }
   */
  DISPLAY_AREA_MODIFIED = 'CORNERSTONE_DISPLAY_AREA_MODIFIED',
  /**
   * Triggers on the eventTarget when the element is disabled
   *
   * Make use of {@link EventTypes.ElementDisabledEvent | ElementDisabled Event Type } for typing your event listeners for ELEMENT_DISABLED event,
   * and see what event detail is included in {@link EventTypes.ElementDisabledEventDetail | ElementDisabled Event Detail }
   */
  ELEMENT_DISABLED = 'CORNERSTONE_ELEMENT_DISABLED',
  /**
   * Triggers on the eventTarget when the element is enabled
   *
   * Make use of {@link EventTypes.ElementEnabledEvent | ElementEnabled Event Type } for typing your event listeners for ELEMENT_ENABLED event,
   * and see what event detail is included in {@link EventTypes.ElementEnabledEventDetail | ElementEnabled Event Detail }
   */
  ELEMENT_ENABLED = 'CORNERSTONE_ELEMENT_ENABLED',
  /**
   * Triggers on the element when the image in the element has been rendered
   *
   * Make use of {@link EventTypes.ImageRenderedEvent | ImageRendered Event Type } for typing your event listeners for IMAGE_RENDERED event,
   * and see what event detail is included in {@link EventTypes.ImageRenderedEventDetail | ImageRendered Event Detail }
   */
  IMAGE_RENDERED = 'CORNERSTONE_IMAGE_RENDERED',
  /**
   * Triggers on the eventTarget when the image volume data is modified. This happens
   * in the streamingImageLoader when each frame is loaded and inserted into a volume.
   *
   *
   * Make use of {@link EventTypes.ImageVolumeModifiedEvent | ImageVolumeModified Event Type } for typing your event listeners for IMAGE_VOLUME_MODIFIED event,
   * and see what event detail is included in {@link EventTypes.ImageVolumeModifiedEventDetail | ImageVolumeModified Event Detail }
   */
  IMAGE_VOLUME_MODIFIED = 'CORNERSTONE_IMAGE_VOLUME_MODIFIED',
  /**
   * Triggers on the eventTarget when the image volume loading is completed and all
   * frames are loaded and inserted into a volume.
   *
   * Make use of {@link EventTypes.ImageVolumeLoadingCompletedEvent | ImageVolumeLoadingCompleted Event Type } for typing your
   * event listeners for IMAGE_VOLUME_LOADING_COMPLETED event, and see what event detail is included
   * in {@link EventTypes.ImageVolumeLoadingCompletedEventDetail | ImageVolumeLoadingCompleted Event Detail }
   */
  IMAGE_VOLUME_LOADING_COMPLETED = 'CORNERSTONE_IMAGE_VOLUME_LOADING_COMPLETED',
  /**
   * Triggers on the eventTarget when the image has successfully loaded by imageLoaders.
   * This event may be fired multiple times for different statuses as the image data gets loaded.
   *
   * Make use of {@link EventTypes.ImageLoadedEvent | ImageLoaded Event Type } for typing your event listeners for IMAGE_LOADED event,
   * and see what event detail is included in {@link EventTypes.ImageLoadedEventDetail | ImageLoaded Event Detail }
   */
  IMAGE_LOADED = 'CORNERSTONE_IMAGE_LOADED',
  /**
   * Triggers on the eventTarget when progressive loading stages are completed.
   * That is, the stage is complete for all images included in that stage (which
   * can be zero).  If you need individual image load information related to
   * the stage, see the status attribute on the IMAGE_LOADED event - which has
   * the status of the image, but not the actual stage that loaded it.
   */
  IMAGE_RETRIEVAL_STAGE = 'CORNERSTONE_IMAGE_RETRIEVAL_STAGE',
  /**
   * Triggers on the eventTarget when the image has failed loading by imageLoaders
   *
   * Make use of {@link EventTypes.ImageLoadedFailedEvent | ImageLoadedFailed Event Type } for typing your event listeners for IMAGE_LOADED_FAILED event,
   * and see what event detail is included in {@link EventTypes.ImageLoadedFailedEventDetail | ImageLoadedFailed Event Detail }
   */
  IMAGE_LOAD_FAILED = 'CORNERSTONE_IMAGE_LOAD_FAILED',
  /**
   * Triggers on element when a new voluem is set on the volume viewport
   */
  VOLUME_VIEWPORT_NEW_VOLUME = 'CORNERSTONE_VOLUME_VIEWPORT_NEW_VOLUME',

  /**
   * Triggers on the eventTarget when the volume has successfully loaded by volumeLoaders
   *
   * Make use of {@link EventTypes.VolumeLoadedEvent | VolumeLoaded Event Type } for typing your event listeners for VOLUME_LOADED event,
   * and see what event detail is included in {@link EventTypes.VolumeLoadedEventDetail | VolumeLoaded Event Detail }
   */
  VOLUME_LOADED = 'CORNERSTONE_VOLUME_LOADED',
  /**
   * Triggers on the eventTarget when the image has failed loading by volumeLoaders
   *
   * Make use of {@link EventTypes.VolumeLoadedFailedEvent | VolumeLoadedFailed Event Type } for typing your event listeners for VOLUME_LOADED_FAILED event,
   * and see what event detail is included in {@link EventTypes.VolumeLoadedFailedEventDetail | VolumeLoadedFailed Event Detail }
   */
  VOLUME_LOADED_FAILED = 'CORNERSTONE_VOLUME_LOADED_FAILED',
  /**
   * Triggers on the eventTarget when an image is added to the image cache
   *
   * Make use of {@link EventTypes.ImageCacheImageAddedEvent | ImageCacheAdded Event Type } for typing your event listeners for IMAGE_CACHE_ADDED event,
   * and see what event detail is included in {@link EventTypes.ImageCacheImageAddedEventDetail | ImageCacheAdded Event Detail }
   */
  IMAGE_CACHE_IMAGE_ADDED = 'CORNERSTONE_IMAGE_CACHE_IMAGE_ADDED',
  /**
   * Triggers on the eventTarget when an image is removed from the image cache
   *
   * Make use of {@link EventTypes.ImageCacheImageRemovedEvent | ImageCacheRemoved Event Type } for typing your event listeners for IMAGE_CACHE_REMOVED event,
   * and see what event detail is included in {@link EventTypes.ImageCacheImageRemovedEventDetail | ImageCacheRemoved Event Detail }
   */
  IMAGE_CACHE_IMAGE_REMOVED = 'CORNERSTONE_IMAGE_CACHE_IMAGE_REMOVED',
  /**
   * Triggers on the eventTarget when a volume is added to the volume cache
   *
   * Make use of {@link EventTypes.VolumeCacheVolumeAddedEvent | VolumeCacheAdded Event Type } for typing your event listeners for VOLUME_CACHE_ADDED event,
   * and see what event detail is included in {@link EventTypes.VolumeCacheVolumeAddedEventDetail | VolumeCacheAdded Event Detail }
   */
  VOLUME_CACHE_VOLUME_ADDED = 'CORNERSTONE_VOLUME_CACHE_VOLUME_ADDED',
  /**
   * Triggers on the eventTarget when a volume is removed from the volume cache
   *
   * Make use of {@link EventTypes.VolumeCacheVolumeRemovedEvent | VolumeCacheRemoved Event Type } for typing your event listeners for VOLUME_CACHE_REMOVED event,
   * and see what event detail is included in {@link EventTypes.VolumeCacheVolumeRemovedEventDetail | VolumeCacheRemoved Event Detail }
   */
  VOLUME_CACHE_VOLUME_REMOVED = 'CORNERSTONE_VOLUME_CACHE_VOLUME_REMOVED',
  /**
   * Triggers on the element when a new image is set on the stackViewport
   *
   * Make use of {@link EventTypes.StackNewImageEvent | StackNewImage Event Type } for typing your event listeners for STACK_NEW_IMAGE event,
   * and see what event detail is included in {@link EventTypes.StackNewImageEventDetail | StackNewImage Event Detail }
   */
  STACK_NEW_IMAGE = 'CORNERSTONE_STACK_NEW_IMAGE',

  /**
   * Triggers on the element when a new image is set on the volumeViewport, this can be due to scrolling or other
   * tools that change the camera position or focal point.
   *
   * Make use of {@link EventTypes.VolumeNewImageEvent | VolumeNewImage Event Type } for typing your event listeners for VOLUME_NEW_IMAGE event,
   * and see what event detail is included in {@link EventTypes.VolumeNewImageEventDetail | VolumeNewImage Event Detail }
   */
  VOLUME_NEW_IMAGE = 'CORNERSTONE_VOLUME_NEW_IMAGE',

  /**
   * Triggers on the element when a new image is about to be set on the stackViewport, pre display
   *
   * Make use of {@link EventTypes.PreStackNewImageEvent | PreStackNewImage Event Type } for typing your event listeners for PRE_STACK_NEW_IMAGE event,
   * and see what event detail is included in {@link EventTypes.PreStackNewImageEventDetail | PreStackNewImage Event Detail }
   */
  PRE_STACK_NEW_IMAGE = 'CORNERSTONE_PRE_STACK_NEW_IMAGE',
  /**
   * Triggers on the element when the viewport's image has calibrated its pixel spacings
   *
   * Make use of {@link EventTypes.ImageSpacingCalibratedEvent | ImageSpacingCalibrated Event Type } for typing your event listeners for IMAGE_SPACING_CALIBRATED event,
   * and see what event detail is included in {@link EventTypes.ImageSpacingCalibratedEventDetail | ImageSpacingCalibrated Event Detail }
   */
  IMAGE_SPACING_CALIBRATED = 'CORNERSTONE_IMAGE_SPACING_CALIBRATED',

  /**
   * Triggers on the event target when a new stack is set on its stack viewport.
   * Make use of {@link EventTypes.StackViewportNewStack | StackViewportNewStack Event Type } for typing your event listeners for STACK_VIEWPORT_NEW_STACK event,
   * and see what event detail is included in {@link EventTypes.StackViewportNewStackEventDetail | StackViewportNewStack Event Detail }
   */
  STACK_VIEWPORT_NEW_STACK = 'CORNERSTONE_STACK_VIEWPORT_NEW_STACK',

  /**
   * Triggers on the element when the underlying StackViewport is scrolled.
   * Make use of {@link EventTypes.StackViewportScroll | StackViewportScroll Event Type } for typing your event listeners for STACK_VIEWPORT_SCROLL event,
   * and see what event detail is included in {@link EventTypes.StackViewportScrollEventDetail | StackViewportScroll Event Detail }
   */
  STACK_VIEWPORT_SCROLL = 'CORNERSTONE_STACK_VIEWPORT_SCROLL',

  /**
   * Triggers on the eventTarget when a new geometry is added to the geometry cache
   */
  GEOMETRY_CACHE_GEOMETRY_ADDED = 'CORNERSTONE_GEOMETRY_CACHE_GEOMETRY_ADDED',

  /**
   * Triggers when the scroll function is called with a delta that is out of bounds.
   * This is usually for signaling that the user may want a different volume for partially loaded volumes which is meant to optimize memory.
   */
  VOLUME_SCROLL_OUT_OF_BOUNDS = 'VOLUME_SCROLL_OUT_OF_BOUNDS',

  /**
   * Triggers when the scroll function is called on a volume.
   */
  VOLUME_VIEWPORT_SCROLL = 'VOLUME_VIEWPORT_SCROLL',

  /**
   * Triggers when the clipping planes has been updated
   */
  CLIPPING_PLANES_UPDATED = 'CORNERSTONE_CLIPPING_PLANES_UPDATED',

  /**
   * Triggers when the webworker has made progress
   * You should use it with a workerType to indicate the type of worker that is making progress
   * Checkout the polySEG convertors in the cornerstone tools
   * to lean how to use it
   */
  WEB_WORKER_PROGRESS = 'CORNERSTONE_WEB_WORKER_PROGRESS',
  // IMAGE_CACHE_FULL = 'CORNERSTONE_IMAGE_CACHE_FULL',
  // PRE_RENDER = 'CORNERSTONE_PRE_RENDER',
  // ELEMENT_RESIZED = 'CORNERSTONE_ELEMENT_RESIZED',

  /**
   * Triggers on the HTML element when viewport modifies its colormap
   * Make use of {@link EventTypes.ColormapModifiedEvent | ColormapModified Event Type } for typing your event listeners for COLORMAP_MODIFIED event,
   * and see what event detail is included in {@link EventTypes.ColormapModifiedEventDetail | ColormapModified Event Detail }
   */
  COLORMAP_MODIFIED = "CORNERSTONE_COLORMAP_MODIFIED"
}

export default Events;
