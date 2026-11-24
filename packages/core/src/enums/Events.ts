/**
 * Cornerstone Core events
 */
enum Events {
  /**
   * ERROR CODES
   */
  ERROR_EVENT = 'CORNERSTONE_ERROR',

  /**
   * Fired when an image does not fit in the ImageCache. This can happen for
   * both volumes and stack images. `putImageSync` also throws an error with
   * this message.
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
   * Triggers on the HTML element of a viewport when the appearance of one of
   * its display sets changes: the window, invert, colormap, opacity,
   * visibility, blend mode, preset, interpolation, sharpening, smoothing,
   * slab thickness or any other key of the appearance of its family. It
   * fires once per change, with the keys that changed and the `cause`:
   * `'mount'`, `'edit'`, `'reset'` or `'default'`. The layer of a
   * segmentation fires nothing.
   *
   * Make use of {@link EventTypes.DisplaySetAppearanceChangedEvent | DisplaySetAppearanceChanged Event Type } for typing your event listeners for DISPLAY_SET_APPEARANCE_CHANGED event,
   * and see what event detail is included in {@link EventTypes.DisplaySetAppearanceChangedEventDetail | DisplaySetAppearanceChanged Event Detail }
   */
  DISPLAY_SET_APPEARANCE_CHANGED = 'CORNERSTONE_DISPLAY_SET_APPEARANCE_CHANGED',
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
   * Triggers on the HTML element when the derived viewport fidelity state
   * changes (loading / lod / lossy / done / hidden). Fires only on a state
   * change, not on every render (FIDELITY-EVENT-2..4).
   *
   * Make use of {@link EventTypes.ViewportFidelityChangedEvent | ViewportFidelityChanged Event Type }
   * for typing your event listeners, and see what event detail is included in
   * {@link EventTypes.ViewportFidelityChangedEventDetail | ViewportFidelityChanged Event Detail }.
   */
  VIEWPORT_FIDELITY_CHANGED = 'CORNERSTONE_VIEWPORT_FIDELITY_CHANGED',
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
   * Triggers on the eventTarget when a streaming volume cancels its load,
   * while the volume is still in the cache. The detail holds `volumeId`.
   */
  IMAGE_VOLUME_LOADING_CANCELLED = 'CORNERSTONE_IMAGE_VOLUME_LOADING_CANCELLED',
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
   * Internal. Triggers on the eventTarget when the settings that size a volume
   * texture change: the GPU settings preset, the lossy downsampling or the
   * texture budget. Each viewport that draws a volume chooses its texture
   * again. The event has no detail.
   */
  VOLUME_TEXTURE_LIMITS_CHANGED = 'CORNERSTONE_VOLUME_TEXTURE_LIMITS_CHANGED',
  /**
   * Triggers on the element when a viewport shows another image of its source
   * display set: another image of a stack, another slice of a volume or
   * another frame of a video. A planar viewport fires it once at a mount, for
   * what the mount shows, and once for each change of what is on display. A
   * video viewport fires it for each frame while it plays and for the frame
   * of a seek. An overlay, such as a labelmap, fires nothing. The detail has
   * the same keys in every mode.
   *
   * Make use of {@link EventTypes.NewImageEvent | NewImage Event Type } for typing your event listeners for NEW_IMAGE event,
   * and see what event detail is included in {@link EventTypes.NewImageEventDetail | NewImage Event Detail }
   */
  NEW_IMAGE = 'CORNERSTONE_NEW_IMAGE',

  /**
   * Triggers on the element when the viewport's image has calibrated its pixel spacings
   *
   * Make use of {@link EventTypes.ImageSpacingCalibratedEvent | ImageSpacingCalibrated Event Type } for typing your event listeners for IMAGE_SPACING_CALIBRATED event,
   * and see what event detail is included in {@link EventTypes.ImageSpacingCalibratedEventDetail | ImageSpacingCalibrated Event Detail }
   */
  IMAGE_SPACING_CALIBRATED = 'CORNERSTONE_IMAGE_SPACING_CALIBRATED',

  /**
   * Triggers on the element once for each committed `setDisplaySets`,
   * `addDisplaySet` and `removeDisplaySet` of a viewport of any family, for
   * an overlay as well as for the source. A call is committed when its data
   * is loaded and bound and the getters of the viewport answer for the new
   * display sets; a call that a newer `setDisplaySets` supersedes, or that
   * fails, fires nothing. `detail.sourceChanged` is false when only an
   * overlay came or went: a listener that cares only for the source returns
   * early then.
   *
   * Make use of {@link EventTypes.DisplaySetsChangedEvent | DisplaySetsChanged Event Type } for typing your event listeners for DISPLAY_SETS_CHANGED event,
   * and see what event detail is included in {@link EventTypes.DisplaySetsChangedEventDetail | DisplaySetsChanged Event Detail }
   */
  DISPLAY_SETS_CHANGED = 'CORNERSTONE_DISPLAY_SETS_CHANGED',

  /**
   * Triggers when the scroll function is called with a delta that is out of bounds in the stack viewport.
   */
  STACK_SCROLL_OUT_OF_BOUNDS = 'STACK_SCROLL_OUT_OF_BOUNDS',

  /**
   * Triggers on the eventTarget when a new geometry is added to the geometry cache
   */
  GEOMETRY_CACHE_GEOMETRY_ADDED = 'CORNERSTONE_GEOMETRY_CACHE_GEOMETRY_ADDED',

  // removed
  GEOMETRY_CACHE_GEOMETRY_REMOVED = 'CORNERSTONE_GEOMETRY_CACHE_GEOMETRY_REMOVED',

  /**
   * Triggers on the eventTarget when `utilities.scroll` of a planar viewport
   * in volume mode is asked to go past the first or the last slice while the
   * view is in the acquisition plane, in place of VOLUME_VIEWPORT_SCROLL.
   * This is usually for signaling that the user may want a different volume for partially loaded volumes which is meant to optimize memory.
   */
  VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS = 'VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS',

  /**
   * Triggers on the eventTarget when `utilities.scroll` scrolls a planar
   * viewport in volume mode.
   */
  VOLUME_VIEWPORT_SCROLL = 'VOLUME_VIEWPORT_SCROLL',

  /**
   * Triggers when the webworker has made progress
   * You should use it with a workerType to indicate the type of worker that is making progress
   */
  WEB_WORKER_PROGRESS = 'CORNERSTONE_WEB_WORKER_PROGRESS',

  /**
   * Dynamic image volume dimension group number changed
   * The first dimension group number is 1
   */
  DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED = 'DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED',

  /**
   * Dynamic image volume dimension group loaded
   * The first dimension group number is 1
   */
  DYNAMIC_VOLUME_DIMENSION_GROUP_LOADED = 'DYNAMIC_VOLUME_DIMENSION_GROUP_LOADED',

  /**
   * Triggers on the eventTarget when a geometry has successfully loaded by geometryLoaders
   *
   * Make use of {@link EventTypes.GeometryLoadedEvent | GeometryLoaded Event Type } for typing your event listeners for GEOMETRY_LOADED event,
   * and see what event detail is included in {@link EventTypes.GeometryLoadedEventDetail | GeometryLoaded Event Detail }
   */
  GEOMETRY_LOADED = 'GEOMETRY_LOADED',

  /**
   * Triggers on the eventTarget when a geometry is being loaded by geometryLoaders
   *
   * Make use of {@link EventTypes.GeometryLoadProgressEvent | GeometryLoadProgress Event Type } for typing your event listeners for GEOMETRY_LOAD_PROGRESS event,
   * and see what event detail is included in {@link EventTypes.GeometryLoadProgressEventDetail | GeometryLoadProgress Event Detail }
   */
  GEOMETRY_LOAD_PROGRESS = 'GEOMETRY_LOAD_PROGRESS',

  /**
   * Triggers on the eventTarget when a geometry has failed loading by geometryLoaders
   *
   * Make use of {@link EventTypes.GeometryLoadedFailedEvent | GeometryLoadedFailed Event Type } for typing your event listeners for GEOMETRY_LOADED_FAILED event,
   * and see what event detail is included in {@link EventTypes.GeometryLoadedFailedEventDetail | GeometryLoadedFailed Event Detail }
   */
  GEOMETRY_LOADED_FAILED = 'GEOMETRY_LOADED_FAILED',

  /**
   * Triggers on the eventTarget after the global render backend changes
   * (setRenderBackend, or a deprecated CPU-rendering toggle that changed the
   * effective backend). Detail: `{ previous, current, effectiveBackend, reason }`.
   */
  RENDER_BACKEND_CHANGED = 'CORNERSTONE_RENDER_BACKEND_CHANGED',

  /**
   * Triggers on the eventTarget when one of the rendering engine's WebGL
   * contexts is lost. Cornerstone does not switch backends on its own;
   * applications can listen for this to offer the user a switch to CPU
   * rendering via setRenderBackend('cpu').
   * Detail: `{ renderingEngineId, contextIndex }`.
   */
  WEBGL_CONTEXT_LOST = 'CORNERSTONE_WEBGL_CONTEXT_LOST',

  /**
   * Triggers on the eventTarget when a previously lost WebGL context is
   * restored by the browser. Detail: `{ renderingEngineId, contextIndex }`.
   *
   * Before this event fires, cornerstone drops every GL object of that
   * context (programs, buffers, 2D and 3D textures, framebuffers). Right after
   * it, the rendering engine renders once every viewport that draws through
   * that context, and that render builds the GL objects again from the images,
   * volumes and actors in memory. An application no longer has to render,
   * reload images or volumes, or recreate viewports to get the picture back.
   *
   * An application still has to restore what cornerstone does not own: GL
   * objects it made itself in that context, and anything it changed when
   * WEBGL_CONTEXT_LOST fired. Cornerstone does not change the render backend:
   * if contexts keep getting lost, the application decides whether to call
   * setRenderBackend('cpu').
   */
  WEBGL_CONTEXT_RESTORED = 'CORNERSTONE_WEBGL_CONTEXT_RESTORED',

  /**
   * Triggers on the eventTarget when a BaseViewport render path throws
   * while mounting or rendering data. Like WEBGL_CONTEXT_LOST this is a
   * degradation signal for applications; no automatic backend switch happens.
   * Detail: `{ renderingEngineId, viewportId, displaySetId, error }`.
   */
  RENDER_PATH_ERROR = 'CORNERSTONE_RENDER_PATH_ERROR',

  /**
   * Triggers on the eventTarget after a viewport finishes rebuilding its
   * render paths in place (live render-backend switch via setRenderBackend,
   * or a deprecated CPU-rendering toggle). The viewport's actors were
   * replaced, so consumers that decorate them (e.g. segmentation
   * representations) listen for this to re-reconcile and restyle their
   * overlays. Detail: `{ renderingEngineId, viewportId }`.
   */
  RENDERING_PIPELINE_CHANGED = 'CORNERSTONE_RENDERING_PIPELINE_CHANGED',

  /**
   * Triggers on the viewport element and on the eventTarget when the render
   * plan of one layer of a planar viewport changes
   * (`PlanarViewport.getRenderPlan`): how its slice is made, what draws it,
   * its render backend or the reason. It fires at most once for each layer in
   * one pass of the render path decision, and also for a layer that was just
   * added. Detail (`RenderPlanChangedEventDetail`): `{ renderingEngineId,
   * viewportId, displaySetId, previous, current, reason }`.
   */
  RENDER_PLAN_CHANGED = 'CORNERSTONE_RENDER_PLAN_CHANGED',
}

export default Events;
