import BaseViewport from '../BaseViewport';
import type {
  ActorEntry,
  CPUIImageData,
  EventTypes,
  ICamera,
  IStackInput,
  IViewport,
  IVoxelManager,
  ImageActor,
  Point2,
  Point3,
  ReferenceViewableCheck,
  RGB,
  ViewReference,
  ViewReferenceSpecifier,
  ViewportContentMode,
} from '../../../types';
import { Events, ViewportType } from '../../../enums';
import cache from '../../../cache/cache';
import CanvasActor from '../../CanvasActor';
import { resetCanvasLabelmapComposition } from '../../CanvasActor/canvasLabelmapLayer';
import triggerEvent from '../../../utilities/triggerEvent';
import {
  frameNumberToTimeSeconds,
  timeSecondsToFrameNumber,
} from '../../../utilities/VideoUtilities';
import FrameRange from '../../../utilities/FrameRange';
import VoxelManager from '../../../utilities/VoxelManager';
import getOrCreateCanvas from '../../helpers/getOrCreateCanvas';
import getDevicePixelSize from '../../helpers/getDevicePixelSize';
import { generateFrameImageId } from '../../../utilities/splitImageIdsBy4DTags';
import imageIdToURI from '../../../utilities/imageIdToURI';
import { DefaultVideoDataProvider } from './DefaultVideoDataProvider';
import type {
  BindingRole,
  LoadedData,
  ViewportDataBinding,
} from '../ViewportArchitectureTypes';
import { getDisplaySetImageId } from '../displaySetAccess';
import scrollViewport from '../viewportScroll';
import type { ViewReferenceContext } from '../viewReferenceCompatibility';
import type {
  VideoViewState,
  VideoDisplaySetAppearance,
  VideoElementRenderContext,
  VideoMountOptions,
  VideoElementRendering,
  VideoStreamPayload,
  VideoViewportInput,
} from './VideoViewportTypes';
import {
  createDefaultVideoViewState,
  getVideoScrollStepFrames,
  normalizeVideoViewState,
} from './videoViewportCamera';
import { createVideoRenderPathResolver } from './VideoRenderPathResolver';
import VideoResolvedView from './VideoResolvedView';
import {
  getViewStateKeptThroughResize,
  type ResizeCanvasSize,
} from '../viewportResizeCamera';
import { videoLoadError } from './videoLoadError';

/** The RGBA pixels of one video frame, with the frame number they show. */
type FrameScalarData = Uint8ClampedArray & {
  frameNumber?: number;
  getRange?: () => [number, number];
};

class VideoViewport extends BaseViewport<
  VideoViewState,
  VideoDisplaySetAppearance,
  VideoElementRenderContext
> {
  // ── Fields ───────────────────────────────────────────────────────────

  readonly type = ViewportType.VIDEO;
  readonly renderingEngineId: string;

  /**
   * The canvas of the viewport element, for the rendering engine and for the
   * tools that read its size. The video element draws the frame, so this
   * canvas holds no pixels of the video.
   */
  readonly canvas: HTMLCanvasElement;

  protected renderContext: VideoElementRenderContext;
  private trackedVideoElement?: HTMLVideoElement;
  private cleanupTrackedVideoElement?: () => void;

  /** Whether the check that follows the frames of playback is running. */
  private isWatchingPlayback = false;

  /** The frame number of the last frame event. */
  private lastFrameEventNumber?: number;

  /** The animation frame that fires the next IMAGE_RENDERED, while one waits. */
  private imageRenderedFrame?: number;

  /** The pixels of the frame that `getImageData` read last. */
  private frameScalarData?: FrameScalarData;

  /**
   * The images drawn over the video, one canvas actor each, in the order
   * they were added: the labelmap image of the frame on display.
   */
  private overlayActors: ActorEntry[] = [];

  /** The canvas just above the video that the overlay actors draw on. */
  private overlayLayer?: HTMLCanvasElement;

  /**
   * The size of the canvas, in CSS pixels, that the view was last laid out
   * at on the video elements: the camera that a resize keeps is the one of
   * this size.
   */
  private layoutSize?: ResizeCanvasSize;

  /**
   * The frame number of the mount of each video that was given one, for
   * `getDisplaySets`.
   */
  private readonly mountFrameNumbers = new Map<string, number>();

  /** The frame image ids that `getImageIds` gave last, and for which video. */
  private frameImageIds?: {
    displaySetId: string;
    numberOfFrames: number;
    imageIds: string[];
  };

  // ── Static ───────────────────────────────────────────────────────────

  static get useCustomRenderingPipeline(): boolean {
    return true;
  }

  // ── Constructor ──────────────────────────────────────────────────────

  constructor(args: VideoViewportInput) {
    super(args);
    this.renderingEngineId = args.renderingEngineId;
    this.canvas = args.canvas || getOrCreateCanvas(this.element);
    this.element.style.position = this.element.style.position || 'relative';
    this.element.style.overflow = 'hidden';
    this.element.style.background = this.element.style.background || '#000';
    this.dataProvider = args.dataProvider || new DefaultVideoDataProvider();
    this.renderPathResolver =
      args.renderPathResolver || createVideoRenderPathResolver();
    this.renderContext = {
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      type: 'video',
      element: this.element,
      canvas: this.canvas,
    };
    this.viewState = createDefaultVideoViewState();

    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );
  }

  // ====================================================================
  // Public API -- data
  // ====================================================================

  /**
   * Replaces all mounted video display sets with the provided ones using the
   * HTML video render path. The first entry is mounted as the source binding
   * and the others as overlays, unless an entry names its `role`, and the
   * first video then shows the 1-based `frameNumber` of its options. The
   * first video sets the view up: the view state starts from the default.
   * Each later video is drawn over the videos before it, in the same view
   * and on the time that the view shows. The calls without a display set id
   * follow the source. The
   * option `appearance` of an entry is the appearance of the video from its
   * first draw (its playback rate, loop, mute, object fit, opacity and the
   * rest), merged over the overrides set before the mount;
   * DISPLAY_SET_APPEARANCE_CHANGED fires once for it, with cause `'mount'`.
   * NEW_IMAGE fires once for the frame that the mount shows: after the seek
   * when the mount seeks, else when the frame shows. The legacy video viewport
   * fired its new image event at every mount too. DISPLAY_SETS_CHANGED fires
   * once the videos are mounted. A newer call stops this one at once, as on
   * the planar viewport: it resolves and fires nothing, and the video that it
   * waits for, before or after its metadata, stops its load and goes with
   * its listeners, also when its server never answers.
   *
   * A video whose element fires `error` before its first frame rejects the
   * call with the display set, the URL and the media error
   * (`videoLoadError`), as a planar mount rejects for an image that does
   * not load: the failing video is unbound and its element removed, its
   * appearance overrides are those from before the call, and
   * DISPLAY_SETS_CHANGED does not fire (a video that fails after its
   * metadata has fired the appearance event of its mount at the bind).
   * A call that a newer one superseded has ended, so a later error of its
   * video changes nothing. An error after the first frame does not fail
   * the mount. There is no
   * time limit: `stalled` and `abort` are not failures, and the call waits
   * until the browser gives the frame or the error.
   *
   * @param entries - Video display sets to mount.
   */
  async setDisplaySets(
    ...entries: Array<{
      displaySetId: string;
      options?: VideoMountOptions;
    }>
  ): Promise<void> {
    const isSuperseded = this.startSetDisplaySets();
    const signal = this.getSetDisplaySetsSignal();

    this.removeAllData();
    this.overlayActors = [];

    for (const [index, { displaySetId, options }] of entries.entries()) {
      const mounted = await this.mountVideo(
        displaySetId,
        options,
        options?.role ?? (index === 0 ? 'source' : 'overlay'),
        index === 0,
        isSuperseded,
        signal
      );

      if (!mounted) {
        return;
      }
    }

    this.showMountedFrame(entries[0]?.options?.frameNumber);
    this.triggerDisplaySetsChanged(
      entries.map(({ displaySetId }) => displaySetId)
    );
  }

  /**
   * Mounts one more video as `setDisplaySets` mounts that entry, and leaves
   * the videos on display as they are. Without a `role` it is the source on
   * a viewport that shows nothing, else an overlay. On a viewport that shows
   * nothing it sets the view up and shows the `frameNumber` of its options,
   * with its NEW_IMAGE; any other video is drawn over the videos on display,
   * in their view and on the time that the view shows, and fires no
   * NEW_IMAGE. It rejects as `setDisplaySets` does for a video that does
   * not load. DISPLAY_SETS_CHANGED fires once it is mounted. Calls that race
   * mount in call order; a `setDisplaySets` or a `destroy` that starts while
   * it waits for its video ends it at once, and it binds nothing.
   *
   * @param displaySetId - The video display set to mount.
   * @param options - The options of its mount, as for an entry of
   * `setDisplaySets`.
   */
  async addDisplaySet(
    displaySetId: string,
    options: VideoMountOptions = {}
  ): Promise<void> {
    return this.queueAddDisplaySet(async (isSuperseded, signal) => {
      const opensView = Array.from(this.bindings.keys()).every(
        (mountedId) => mountedId === displaySetId
      );
      const mounted = await this.mountVideo(
        displaySetId,
        options,
        this.resolveAddRole(displaySetId, options.role),
        opensView,
        isSuperseded,
        signal
      );

      if (!mounted) {
        return;
      }

      this.showMountedFrame(opensView ? options.frameNumber : undefined);
      this.triggerDisplaySetsChanged([displaySetId]);
    });
  }

  /**
   * Mounts one video with the HTML video render path and the appearance of
   * its mount, the one mount of `setDisplaySets` and `addDisplaySet`, and
   * waits for its first frame. A video that `opensView` (the first of a
   * viewport) starts the view state from the default; another one keeps
   * the view, and its element shows the time of the view. Gives false when
   * a newer `setDisplaySets` superseded the call: `signal` aborts then, and
   * the wait for the metadata or the first frame ends at once. Rejects, with
   * the video unbound and the overrides from before the call, when the video
   * does not load.
   */
  private async mountVideo(
    displaySetId: string,
    options: VideoMountOptions | undefined,
    role: BindingRole,
    opensView: boolean,
    isSuperseded?: () => boolean,
    signal?: AbortSignal
  ): Promise<boolean> {
    const restoreAppearance = this.stageMountedAppearance(
      displaySetId,
      {
        visible: true,
        opacity: 1,
        playbackRate: 1,
        loop: true,
        muted: true,
        objectFit: 'contain',
      },
      options?.appearance
    );
    let bound = false;

    try {
      bound = await this.bindDisplaySet(
        displaySetId,
        { renderMode: 'video2d', role },
        isSuperseded,
        signal
      );
    } finally {
      if (!bound) {
        restoreAppearance();
      }
    }

    if (!bound) {
      return false;
    }

    if (typeof options?.frameNumber === 'number') {
      this.mountFrameNumbers.set(displaySetId, options.frameNumber);
    }

    const binding = this.getBinding(displaySetId);

    if (!binding) {
      return true;
    }

    this.applyMountedAppearance(displaySetId);

    const videoData = this.getVideoDataFromBinding(binding);

    if (!videoData) {
      throw new Error(
        `[VideoViewport] Loaded data for ${displaySetId} is not a valid video stream`
      );
    }

    if (opensView) {
      this.viewState = this.normalizeViewState({
        ...createDefaultVideoViewState(),
        scrollStep: this.viewState.scrollStep,
      });

      if (videoData.frameRange[0] > 1) {
        this.viewState.currentTimeSeconds = frameNumberToTimeSeconds(
          videoData.frameRange[0],
          videoData.fps
        );
      }

      this.lastFrameEventNumber = undefined;
      this.modified();
    }

    this.trackVideoElement();

    try {
      await untilAborted(
        this.primeInitialFrame(
          isVideoElementRendering(binding.rendering)
            ? binding.rendering.element
            : undefined,
          videoData,
          this.getCurrentTime()
        ),
        signal
      );
    } catch (error) {
      if (signal?.aborted) {
        return false;
      }

      if (!isSuperseded?.()) {
        this.removeDisplaySetBinding(displaySetId);
        restoreAppearance();
      }

      throw error;
    }

    return !isSuperseded?.();
  }

  /**
   * Ends a mount: the source shows `frameNumber` when it is given, and
   * NEW_IMAGE fires for the frame on display unless it fired since the view
   * was set up or a seek will fire it.
   */
  private showMountedFrame(frameNumber?: number): void {
    if (typeof frameNumber === 'number') {
      this.setFrameNumber(frameNumber);
    }

    const element = this.getVideoElement();

    if (
      element &&
      !element.seeking &&
      this.lastFrameEventNumber === undefined
    ) {
      this.triggerFrameEvents();
    }
  }

  /**
   * The display sets that the viewport shows, in mount order, each with the
   * options of its mount: the role that it has now and the `frameNumber`
   * that the mount was given. `appearance` is not among them: it was
   * applied once, at the mount, and `getDisplaySetAppearance(displaySetId)`
   * gives the look. `other.setDisplaySets(...viewport.getDisplaySets())` on
   * another video viewport therefore shows the same videos in the same
   * roles. The images drawn over the video (`addImages`) are not display
   * sets: `getActors()` lists them.
   */
  override getDisplaySets(): Array<{
    displaySetId: string;
    options: VideoMountOptions;
  }> {
    return Array.from(this.bindings.entries()).map(
      ([displaySetId, binding]) => {
        const frameNumber = this.mountFrameNumbers.get(displaySetId);

        return {
          displaySetId,
          options:
            frameNumber === undefined
              ? { role: binding.role }
              : { role: binding.role, frameNumber },
        };
      }
    );
  }

  /**
   * Removes a video dataset and rebinds tracking when the current video, the
   * source, goes. An id of an image drawn over the video (`addImages`)
   * removes that image.
   *
   * @param displaySetId - Logical dataset id to remove.
   */
  protected override removeDisplaySetBinding(displaySetId: string): void {
    const overlayActors = this.overlayActors.filter(
      (actorEntry) => actorEntry.uid !== displaySetId
    );

    if (overlayActors.length !== this.overlayActors.length) {
      this.overlayActors = overlayActors;
      this.render();
      return;
    }

    const currentDisplaySetId = this.getCurrentBinding()?.data.id;

    super.removeDisplaySetBinding(displaySetId);
    this.mountFrameNumbers.delete(displaySetId);

    if (currentDisplaySetId === displaySetId) {
      this.untrackVideoElement();
      this.trackVideoElement();
    }
  }

  /**
   * The content mode of the video family: `video` once a video is mounted,
   * `empty` before. `utilities.getViewportContentMode` gives `video` for the
   * legacy video viewport too.
   */
  getCurrentMode(): ViewportContentMode {
    return this.getSourceBinding() ? 'video' : 'empty';
  }

  /**
   * The view reference of a frame, with the camera of the view: the focal
   * point, the view plane normal and the view up. The area tools read the
   * normal of an annotation to measure the frame. A `rangeEndSliceIndex`, or
   * the frame range of the view state while the video plays, gives a
   * reference over a range of frames, with the last frame in
   * `multiSliceReference`.
   */
  getViewReference(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): ViewReference {
    const isPlayingRange =
      viewRefSpecifier.sliceIndex === undefined &&
      viewRefSpecifier.frameNumber === undefined &&
      this.getVideoElement()?.paused === false;
    const frameRange = this.getPlaybackFrameRange();
    const frameNumber = isPlayingRange
      ? frameRange[0]
      : (viewRefSpecifier.frameNumber ??
        (typeof viewRefSpecifier.sliceIndex === 'number'
          ? viewRefSpecifier.sliceIndex + 1
          : this.getFrameNumber()));
    const sliceIndex =
      typeof viewRefSpecifier.sliceIndex === 'number'
        ? viewRefSpecifier.sliceIndex
        : frameNumber - 1;
    const rangeEndSliceIndex =
      viewRefSpecifier.rangeEndSliceIndex ??
      (isPlayingRange ? frameRange[1] - 1 : undefined);
    const referencedImageId =
      typeof sliceIndex === 'number'
        ? this.getCurrentImageId(sliceIndex)
        : this.getCurrentImageId();
    const displaySetId = this.getCurrentBinding()?.data.id;
    const camera = this.getResolvedView()?.toICamera();

    return {
      FrameOfReferenceUID: this.getFrameOfReferenceUID(),
      displaySetId,
      dimensionGroupNumber: frameNumber,
      referencedImageId,
      sliceIndex,
      multiSliceReference:
        rangeEndSliceIndex > sliceIndex
          ? {
              sliceIndex: rangeEndSliceIndex,
              dimensionGroupNumber: rangeEndSliceIndex + 1,
              referencedImageId: this.getCurrentImageId(rangeEndSliceIndex),
            }
          : undefined,
      cameraFocalPoint: camera?.focalPoint,
      viewPlaneNormal: camera?.viewPlaneNormal,
      viewUp: camera?.viewUp,
    };
  }

  getCurrentImageId(index = this.getCurrentImageIdIndex()): string | undefined {
    const sourceImageId = getDisplaySetImageId(
      this.getCurrentBinding()?.data.id || ''
    );

    if (!sourceImageId) {
      return;
    }

    return generateFrameImageId(sourceImageId, index + 1);
  }

  getViewReferenceId(specifier: ViewReferenceSpecifier = {}): string {
    const sliceIndex = specifier.sliceIndex;

    if (sliceIndex === undefined) {
      return `videoId:${this.getCurrentImageId()}`;
    }

    return `videoId:${this.getCurrentImageId(sliceIndex)}`;
  }

  setViewReference(viewRef: ViewReference): void {
    if (typeof viewRef.dimensionGroupNumber === 'number') {
      this.setFrameNumber(viewRef.dimensionGroupNumber);
      return;
    }

    if (typeof viewRef.sliceIndex === 'number') {
      this.setFrameNumber(viewRef.sliceIndex + 1);
    }
  }

  /**
   * The index of the frame on display, counted in scroll steps of the view
   * state, as the legacy video viewport counted in steps of its scroll
   * speed. With no scroll step it is the frame index.
   */
  getSliceIndex(): number {
    return this.getCurrentImageIdIndex() / this.getScrollStepFrames();
  }

  /**
   * A check of whether the viewport shows a reference, for the frame on
   * display when it was made. A reference to an image of one frame shows on
   * that frame. A reference whose image names a range of frames
   * (`.../frames/3-9`) shows on each frame of the range. A reference to the
   * video without a frame shows on every frame. With `withNavigation` the
   * answer is whether the video has the frame at all.
   */
  override getReferenceViewableCheck(): ReferenceViewableCheck {
    const isViewable = super.getReferenceViewableCheck();

    return (viewRef, options) =>
      isViewable(asFrameRangeReference(viewRef), options);
  }

  /**
   * The image data of the frame on display, as the legacy video viewport
   * builds it: the geometry of the video, the RGBA pixels of the frame and a
   * voxel manager over them. A world point of a video is its index point.
   *
   * @returns undefined while no video is mounted.
   */
  getImageData(): CPUIImageData {
    const videoData = this.getVideoData();

    if (!videoData) {
      return;
    }

    const { metadata } = videoData;
    const scalarData = this.getFrameScalarData();
    const worldToIndex = (point: Point3): Point3 => [point[0], point[1], 0];

    return {
      dimensions: metadata.dimensions,
      spacing: metadata.spacing,
      origin: metadata.origin,
      direction: metadata.direction as CPUIImageData['direction'],
      metadata: {
        Modality: videoData.modality,
        FrameOfReferenceUID: this.getFrameOfReferenceUID(),
      },
      scalarData,
      imageData: {
        getDirection: () => metadata.direction as CPUIImageData['direction'],
        getDimensions: () => metadata.dimensions,
        getRange: () => [0, 255],
        getScalarData: () => this.getFrameScalarData(),
        getSpacing: () => metadata.spacing,
        worldToIndex,
        indexToWorld: worldToIndex,
      },
      voxelManager: this.getFrameVoxelManager(scalarData),
      hasPixelSpacing: metadata.hasPixelSpacing,
      preScale: {
        scaled: false,
      },
    };
  }

  /**
   * The actor entries of the images drawn over the video, in the order they
   * were added. The labelmap of a segmentation is one of them: the labelmap
   * image of the frame on display. The video itself has no actor.
   */
  getActors(): ActorEntry[] {
    return [...this.overlayActors];
  }

  /**
   * Draws images over the video, as the legacy video viewport did. Each image
   * is a canvas actor in the pixels of the video, drawn on a canvas just above
   * the video with the zoom, the pan and the rotation of the view, as the
   * planar viewport draws a labelmap on the CPU. The id of an image is its
   * `displaySetId`, else its `representationUID`, else its image id, as on the
   * planar viewport. An input with the id of an image that is drawn already
   * replaces it, and `removeDisplaySet` with that id takes it away. The labelmap
   * display of the tools adds the labelmap image of the frame on display.
   *
   * @param stackInputs - The images, by the image id of an image in the
   * cache. `representationUID`, `reference` and `excludeFromFidelity` go on
   * the actor entry, and `callback` is called with the actor.
   */
  addImages(stackInputs: IStackInput[]): void {
    for (const stackInput of stackInputs) {
      const image = cache.getImage(stackInput.imageId);

      if (!image) {
        continue;
      }

      const actor = new CanvasActor(
        {
          getImageData: () => this.getOverlayGeometry(),
        } as unknown as IViewport,
        image
      );
      const uid =
        stackInput.displaySetId ??
        (stackInput.representationUID as string | undefined) ??
        stackInput.imageId;

      actor.setVisibility(stackInput.visibility !== false);
      this.overlayActors = [
        ...this.overlayActors.filter((actorEntry) => actorEntry.uid !== uid),
        {
          uid,
          actor,
          ...(stackInput.displaySetId
            ? { displaySetId: stackInput.displaySetId }
            : {}),
          referencedId: stackInput.imageId,
          representationUID: stackInput.representationUID,
          reference: stackInput.reference,
          excludeFromFidelity: stackInput.excludeFromFidelity === true,
        },
      ];
      stackInput.callback?.({
        imageActor: actor as unknown as ImageActor,
        imageId: stackInput.imageId,
      });
    }

    this.render();
  }

  // ====================================================================
  // Public API -- camera & navigation
  // ====================================================================

  /**
   * Returns the current zoom level derived from camera scale.
   */
  getZoom(): number {
    return (
      this.getResolvedView()?.zoom ?? Math.max(this.viewState.scale ?? 1, 0.001)
    );
  }

  /**
   * Sets the zoom level, optionally anchored to a canvas point.
   */
  setZoom(zoom: number, canvasPoint?: Point2): void {
    const resolvedView = this.getResolvedView();

    if (resolvedView) {
      this.applyResolvedViewState(
        resolvedView.withZoom(zoom, canvasPoint).state.viewState
      );
      return;
    }

    this.setViewState({
      scale: Math.max(zoom, 0.001),
      scaleMode: 'fit',
    });
  }

  /**
   * Returns the pan in canvas pixels on the screen, as on the planar
   * viewport: `[0, 0]` for the fitted view, and the move of the picture on
   * the screen after that, at any rotation and zoom.
   */
  getPan(): Point2 {
    return this.getResolvedView()?.canvasPan ?? [0, 0];
  }

  /**
   * Moves the picture so that `getPan` gives this pan. A canvas delta added
   * to `getPan` moves the picture by that delta on the screen, as PanTool
   * expects.
   */
  setPan(pan: Point2): void {
    const resolvedView = this.getResolvedView();

    if (!resolvedView) {
      return;
    }

    this.applyResolvedViewState(
      resolvedView.withCanvasPan(pan).state.viewState
    );
  }

  /**
   * Returns the computed camera that resolves layout, zoom, and pan
   * from the raw camera state and the current video element dimensions.
   * While the element has no size, the view is resolved at the last size
   * that it had (see `getFramingCanvasSize`).
   */
  getResolvedView(): VideoResolvedView | undefined {
    return this.resolveViewAt(this.getFramingCanvasSize());
  }

  /**
   * The view resolved on a canvas of the given size in CSS pixels, from the
   * view state and the video on display.
   */
  private resolveViewAt(size: ResizeCanvasSize): VideoResolvedView | undefined {
    const videoElement = this.getVideoElement();
    const videoData = this.getVideoData();

    if (!videoElement || !videoData) {
      return;
    }

    this.syncCameraCurrentTimeFromElement();

    const { width, height } = size;

    return new VideoResolvedView({
      viewState: this.viewState,
      containerHeight: height,
      containerWidth: width,
      frameOfReferenceUID:
        (
          videoData.metadata.imagePlaneModule as
            | { frameOfReferenceUID?: string }
            | undefined
        )?.frameOfReferenceUID || videoData.renderedUrl,
      intrinsicHeight: videoElement.videoHeight || height,
      intrinsicWidth: videoElement.videoWidth || width,
      objectFit: this.getEffectiveDisplaySetAppearance(videoData.id)?.objectFit,
      payload: videoData,
    });
  }

  /**
   * The reference context of the video, with the focal point and the view
   * plane normal of the view, so that a reference with a view plane normal
   * is viewable here.
   */
  protected getReferenceViewContexts(): ViewReferenceContext[] {
    const binding = this.getCurrentBinding();
    const videoData = this.getVideoData();

    if (!binding || !videoData) {
      return super.getReferenceViewContexts();
    }

    const sourceImageId =
      getDisplaySetImageId(binding.data.id) ?? binding.data.id;
    const frameNumber = this.getFrameNumber();
    const camera = this.getResolvedView()?.toICamera();

    return [
      {
        displaySetId: binding.data.id,
        displaySetIds: [binding.data.id, sourceImageId],
        frameOfReferenceUID: this.getFrameOfReferenceUID(),
        imageIds: this.getImageIds(),
        imageURIs: [withoutFrames(imageIdToURI(sourceImageId))],
        currentImageIdIndex: frameNumber - 1,
        dimensionGroupNumber: frameNumber,
        numDimensionGroups: videoData.numberOfFrames,
        cameraFocalPoint: camera?.focalPoint,
        viewPlaneNormal: camera?.viewPlaneNormal,
      },
    ];
  }

  // ====================================================================
  // Public API -- playback
  // ====================================================================

  /**
   * Starts playback on the active video element. While it plays, each new
   * frame fires NEW_IMAGE.
   *
   * @returns A promise that resolves after the play request settles.
   */
  play(): Promise<void> {
    const element = this.getVideoElement();

    if (!element) {
      return Promise.resolve();
    }

    return element
      .play()
      .then(() => this.watchPlayback())
      .catch(() => undefined);
  }

  /**
   * Pauses playback and synchronizes the cached current time.
   */
  pause(): void {
    this.getVideoElement()?.pause();
    this.syncCameraCurrentTimeFromElement();
  }

  /**
   * Whether the video plays: true from `play()` on, also when a tool started
   * it, and false with no video, after `pause()`, and when a video without
   * `loop` ends. The legacy `togglePlayPause()` returned this state.
   */
  isPlaying(): boolean {
    return this.getVideoElement()?.paused === false;
  }

  /**
   * The 1-based first and last frame that playback stays in: the frame range
   * of the view state, or else every frame of the video.
   */
  protected getPlaybackFrameRange(): [number, number] {
    const frameRange = this.viewState.frameRange ??
      this.getVideoData()?.frameRange ?? [0, 0];

    return [frameRange[0], frameRange[1]];
  }

  /**
   * Seeks the active video to the requested time in seconds.
   *
   * @param timeSeconds - Target playback time in seconds.
   */
  seek(timeSeconds: number): void {
    const videoData = this.getVideoData();
    const maxTimeSeconds = videoData?.durationSeconds
      ? Math.max(videoData.durationSeconds, 0)
      : Number.POSITIVE_INFINITY;

    this.setViewState({
      currentTimeSeconds: Math.max(0, Math.min(timeSeconds, maxTimeSeconds)),
    });
  }

  /**
   * Seeks to the requested frame number using the dataset frame rate.
   *
   * @param frameNumber - Target frame number in dataset coordinates.
   */
  setFrameNumber(frameNumber: number): void {
    const videoData = this.getVideoData();

    if (!videoData) {
      return;
    }

    this.seek(frameNumberToTimeSeconds(frameNumber, videoData.fps));
  }

  /**
   * Updates playback rate through the appearance of the display set.
   *
   * @param playbackRate - Playback rate to apply to the active dataset.
   */
  setPlaybackRate(playbackRate: number): void {
    const displaySetId = this.getCurrentBinding()?.data.id;

    if (!displaySetId) {
      return;
    }

    this.setDisplaySetAppearance(displaySetId, {
      playbackRate,
    });
  }

  /**
   * Scrolls through frames using a signed delta, with the scroll of
   * `utilities.scroll`: the same request gives the same frame and the same
   * event by either. The video pauses and goes to the start of the frame
   * `delta` steps away. Without `loop` it stops at the first and at the last
   * frame, and when it stops there short of the frame it asked for it fires
   * SCROLL_OUT_OF_BOUNDS on the element and on the eventTarget.
   *
   * @param delta - Signed number of scroll steps to move by. A step is one
   * frame, or the `scrollStep` of the view state.
   * @param debounceLoading - Unused compatibility argument kept for stack-like
   * callers.
   * @param loop - Whether to wrap when scrolling past either end.
   */
  scroll(delta = 1, debounceLoading = true, loop = false): void {
    scrollViewport(this, { delta, debounceLoading, loop });
  }

  // ====================================================================
  // Public API -- queries
  // ====================================================================

  /**
   * Returns the active dataset frame rate.
   */
  getFrameRate(): number {
    return this.getVideoData()?.fps ?? 0;
  }

  /**
   * Returns the total number of frames in the active dataset.
   */
  getNumberOfFrames(): number {
    return this.getVideoData()?.numberOfFrames ?? 0;
  }

  /**
   * Returns the stack-like slice count used by tool compatibility layers:
   * the number of frames, counted in scroll steps of the view state, as the
   * legacy video viewport counted in steps of its scroll speed.
   */
  getNumberOfSlices(): number {
    return Math.round(
      (this.getImageIds().length || this.getNumberOfFrames()) /
        this.getScrollStepFrames()
    );
  }

  /**
   * The number of frames of one scroll step: the `scrollStep` of the view
   * state at the frame rate of the video, or one frame.
   */
  protected getScrollStepFrames(): number {
    return getVideoScrollStepFrames(this.viewState, this.getFrameRate());
  }

  /**
   * Returns the current playback time in seconds.
   */
  getCurrentTime(): number {
    this.syncCameraCurrentTimeFromElement();
    return this.viewState.currentTimeSeconds ?? 0;
  }

  /**
   * Returns the current frame number derived from playback time.
   */
  getFrameNumber(): number {
    const videoData = this.getVideoData();

    if (!videoData) {
      return 1;
    }

    const frameNumber = timeSecondsToFrameNumber(
      this.getCurrentTime(),
      videoData.fps
    );

    return Math.max(
      videoData.frameRange[0],
      Math.min(frameNumber, videoData.frameRange[1])
    );
  }

  /**
   * Returns the current frame index in zero-based stack form.
   */
  getCurrentImageIdIndex(): number {
    return Math.max(0, this.getFrameNumber() - 1);
  }

  /**
   * Returns generated frame image ids for the active video dataset. The same
   * array comes back while the video stays the same, as a planar viewport
   * gives the same array for its stack: the reference checks keep what they
   * work out for an array, so a check per labelmap image of a long video
   * does not make the ids of every frame again.
   */
  getImageIds(): string[] {
    const displaySetId = this.getCurrentBinding()?.data.id;
    const videoData = this.getVideoData();

    if (!displaySetId || !videoData) {
      return [];
    }

    const { numberOfFrames } = videoData;

    if (
      this.frameImageIds?.displaySetId === displaySetId &&
      this.frameImageIds.numberOfFrames === numberOfFrames
    ) {
      return this.frameImageIds.imageIds;
    }

    const sourceImageId = getDisplaySetImageId(displaySetId) ?? displaySetId;
    let imageIds = Array<string>(numberOfFrames);

    for (let frameNumber = 1; frameNumber <= numberOfFrames; frameNumber++) {
      try {
        imageIds[frameNumber - 1] = generateFrameImageId(
          sourceImageId,
          frameNumber
        );
      } catch {
        imageIds = [sourceImageId];
        break;
      }
    }

    this.frameImageIds = { displaySetId, numberOfFrames, imageIds };

    return imageIds;
  }

  // ====================================================================
  // Public API -- lifecycle
  // ====================================================================

  /**
   * Fires IMAGE_RENDERED on the next animation frame, once for all the
   * changes until then. The render path applies a change to the video element
   * when it is made, so the event only tells the tools to draw again over
   * the frame on display.
   */
  render(): void {
    if (this.isDestroyed || this.imageRenderedFrame !== undefined) {
      return;
    }

    this.imageRenderedFrame = requestAnimationFrame(() => {
      this.imageRenderedFrame = undefined;
      this.triggerImageRendered();
    });
  }

  /**
   * Called by the rendering engine render loop for custom-pipeline viewports
   * (getUseCustomRenderingPipeline returns true). DOM updates happen eagerly in
   * the render path, so this defers to render(); without it the engine threw
   * `customRenderViewportToCanvas is not a function` for the next video viewport.
   * Mirrors the ECG and WSI native viewports.
   */
  customRenderViewportToCanvas(): void {
    this.render();
  }

  /**
   * The view state, with the time that the media shows now: a view state
   * that is read, changed and written back, as a pan or a zoom writes it,
   * then keeps the time of a playing video.
   */
  override getViewState(): VideoViewState {
    this.syncCameraCurrentTimeFromElement();

    return super.getViewState();
  }

  /**
   * Writes a patch of the view state. The time of the media is read first, so
   * a patch without `currentTimeSeconds` keeps the time that the video shows
   * now, also while it plays, as the legacy video viewport kept it.
   *
   * @param viewStatePatch - The view state keys to change.
   */
  override setViewState(viewStatePatch: Partial<VideoViewState>): void {
    this.syncCameraCurrentTimeFromElement();
    super.setViewState(viewStatePatch);
  }

  /**
   * Keeps the camera of the view through a change of the size of the
   * element, as the planar viewport keeps its parallel scale and its focal
   * point: the point of the video at the centre of the canvas stays at the
   * centre, and the height of the canvas in pixels of the video stays. Across
   * a change of the width the video keeps its size in pixels and its distance
   * from the centre; across a change of the height it scales with the
   * canvas. The zoom against the fit and `getPan` read after it are those of
   * the new size; the world pan stays. One CAMERA_MODIFIED fires when the
   * view changed. With the object fit `fill` the video has no one scale, and
   * it fills the new size. A framing written while the element had no size
   * is set again at the new size, see `setViewFraming`.
   */
  override resize(): void {
    if (this.isDestroyed) {
      return;
    }

    const pending = this.takePendingViewFraming();
    const previousCamera = this.keepCameraThroughResize();

    this.resizeBindings();
    this.modified(previousCamera);
    this.applyPendingViewFraming(pending);
  }

  /**
   * Writes the view state that keeps the camera of the view laid out at
   * `layoutSize` on the canvas of the size now.
   *
   * @returns The camera before the resize when the view state changed.
   */
  private keepCameraThroughResize(): ICamera | undefined {
    const previousSize = this.layoutSize;
    const nextSize = this.keepCanvasSize();
    const objectFit = this.getEffectiveDisplaySetAppearance(
      this.getVideoData()?.id
    )?.objectFit;

    if (!previousSize || !nextSize || objectFit === 'fill') {
      return;
    }

    const previousView = this.resolveViewAt(previousSize);
    const nextView = this.resolveViewAt(nextSize);

    if (!previousView || !nextView) {
      return;
    }

    const centre = previousView.canvasToWorld([
      previousSize.width / 2,
      previousSize.height / 2,
    ]);
    const kept = getViewStateKeptThroughResize({
      previousSize,
      nextSize,
      previousCentre: [centre[0], centre[1]],
      previousRatio: previousView.worldToCanvasRatio,
      nextFitRatio: nextView.worldToCanvasRatio / nextView.zoom,
    });

    if (!kept) {
      return;
    }

    this.viewState = this.normalizeViewState({ ...this.viewState, ...kept });

    return previousView.toICamera();
  }

  /**
   * Lays the view out on the video elements at the size of the canvas now,
   * which the next resize keeps the camera of.
   */
  protected override modified(previousCamera?: ICamera): void {
    this.layoutSize = this.keepCanvasSize() ?? this.layoutSize;
    super.modified(previousCamera);
  }

  /**
   * Resets layout navigation while preserving the current video time and
   * the scroll step.
   */
  resetViewState(): boolean {
    if (this.isDestroyed) {
      return false;
    }

    this.syncCameraCurrentTimeFromElement();

    const previousCamera = this.getCameraForEvent();
    const { currentTimeSeconds, scrollStep } = this.viewState;

    this.viewState = this.normalizeViewState({
      ...createDefaultVideoViewState(),
      currentTimeSeconds,
      scrollStep,
    });
    this.modified(previousCamera);
    this.triggerCameraResetEvent();

    return true;
  }

  /**
   * Alias for {@link destroy}. Provided for compatibility with disposable
   * resource conventions.
   */
  public override dispose(): void {
    this.destroy();
  }

  /**
   * Returns whether this viewport bypasses the shared rendering pipeline.
   */
  getUseCustomRenderingPipeline(): boolean {
    return true;
  }

  // ====================================================================
  // Protected
  // ====================================================================

  /**
   * Clamps and normalizes video camera values before storage.
   */
  protected override normalizeViewState(
    viewState: VideoViewState
  ): VideoViewState {
    return normalizeVideoViewState(viewState);
  }

  /**
   * Releases the tracked video element listener during destroy.
   */
  protected override onDestroy(): void {
    if (this.imageRenderedFrame !== undefined) {
      cancelAnimationFrame(this.imageRenderedFrame);
      this.imageRenderedFrame = undefined;
    }

    this.untrackVideoElement();
    this.overlayActors = [];
    this.overlayLayer?.remove();
    this.overlayLayer = undefined;
  }

  /**
   * Called on each animation frame while the video plays. Keeps playback in
   * the frame range of the view state, as the legacy video viewport keeps
   * it in the range of `setFrameRange`: a frame out of the range goes back
   * to its first frame. Another frame fires the frame events.
   */
  protected onPlaybackFrame(): void {
    const frameNumber = this.getFrameNumber();
    const { frameRange } = this.viewState;

    if (
      frameRange &&
      (frameNumber < frameRange[0] || frameNumber > frameRange[1])
    ) {
      this.setFrameNumber(frameRange[0]);

      return;
    }

    if (frameNumber !== this.lastFrameEventNumber) {
      this.triggerFrameEvents();
    }
  }

  /**
   * Fires NEW_IMAGE for the frame on display, as the next planar viewport
   * fires it for a new image: the video display set, the 0-based index of
   * the frame, the number of frames and the image id of the frame. A video
   * has no image object for a frame. Then asks for the IMAGE_RENDERED of the
   * frame.
   */
  private triggerFrameEvents(): void {
    const element = this.getVideoElement();
    const displaySetId = this.getCurrentBinding()?.data.id;

    if (this.isDestroyed || !element || !displaySetId) {
      return;
    }

    const sliceIndex = this.getCurrentImageIdIndex();
    const detail: EventTypes.NewImageEventDetail = {
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      displaySetId,
      sliceIndex,
      numberOfSlices: this.getNumberOfFrames(),
      imageId: this.getCurrentImageId(sliceIndex),
      image: undefined,
    };

    this.lastFrameEventNumber = sliceIndex + 1;
    triggerEvent(this.element, Events.NEW_IMAGE, detail);
    this.render();
  }

  /**
   * Draws the images over the video, then fires IMAGE_RENDERED for the frame
   * on display, with the detail of the legacy video viewport: the 0-based
   * frame index, the number of frames, and the time and the duration of the
   * video in seconds.
   */
  protected triggerImageRendered(): void {
    const element = this.getVideoElement();

    if (this.isDestroyed || !element) {
      return;
    }

    this.drawOverlayActors(element);
    this.setRendered();
    triggerEvent(this.element, Events.IMAGE_RENDERED, {
      element: this.element,
      viewportId: this.id,
      viewport: this,
      imageIndex: this.getCurrentImageIdIndex(),
      numberOfSlices: this.getNumberOfFrames(),
      renderingEngineId: this.renderingEngineId,
      time: element.currentTime,
      duration: element.duration,
    });
  }

  // ====================================================================
  // Private
  // ====================================================================

  protected getVideoElement(): HTMLVideoElement | undefined {
    return this.getVideoRendering()?.element;
  }

  protected getVideoData(): LoadedData<VideoStreamPayload> | undefined {
    const binding = this.getCurrentBinding();

    if (!binding) {
      return;
    }

    return this.getVideoDataFromBinding(binding);
  }

  private getVideoDataFromBinding(
    binding: ViewportDataBinding<VideoDisplaySetAppearance>
  ): LoadedData<VideoStreamPayload> | undefined {
    if (!isVideoStreamData(binding.data)) {
      return;
    }

    return binding.data;
  }

  private getVideoRendering(): VideoElementRendering | undefined {
    const binding = this.getCurrentBinding();

    if (!binding || !isVideoElementRendering(binding.rendering)) {
      return;
    }

    return binding.rendering;
  }

  private syncCameraCurrentTimeFromElement(): void {
    const element = this.getVideoElement();

    if (!element) {
      return;
    }

    const currentTimeSeconds = Math.max(0, element.currentTime || 0);

    if (currentTimeSeconds === (this.viewState.currentTimeSeconds ?? 0)) {
      return;
    }

    this.viewState = {
      ...this.viewState,
      currentTimeSeconds,
    };
  }

  private trackVideoElement(): void {
    const element = this.getVideoElement();

    if (!element || this.trackedVideoElement === element) {
      return;
    }

    this.untrackVideoElement();
    this.frameScalarData = undefined;

    const syncCurrentTime = () => {
      this.syncCameraCurrentTimeFromElement();
    };
    const onSeeked = () => {
      this.triggerFrameEvents();
    };

    element.addEventListener('loadedmetadata', syncCurrentTime);
    element.addEventListener('seeked', syncCurrentTime);
    element.addEventListener('seeked', onSeeked);
    element.addEventListener('timeupdate', syncCurrentTime);

    this.trackedVideoElement = element;
    this.cleanupTrackedVideoElement = () => {
      element.removeEventListener('loadedmetadata', syncCurrentTime);
      element.removeEventListener('seeked', syncCurrentTime);
      element.removeEventListener('seeked', onSeeked);
      element.removeEventListener('timeupdate', syncCurrentTime);
    };

    syncCurrentTime();
  }

  private untrackVideoElement(): void {
    this.cleanupTrackedVideoElement?.();
    this.cleanupTrackedVideoElement = undefined;
    this.trackedVideoElement = undefined;
  }

  /**
   * Reads the pixels of the frame on display through a canvas, once per
   * frame number. Before the video has a frame the data is empty.
   */
  private getFrameScalarData(): FrameScalarData {
    const frameNumber = this.getFrameNumber();

    if (this.frameScalarData?.frameNumber === frameNumber) {
      return this.frameScalarData;
    }

    const element = this.getVideoElement();

    if (!element?.videoWidth || !element.videoHeight) {
      const emptyData = new Uint8ClampedArray() as FrameScalarData;

      emptyData.getRange = () => [0, 255];
      emptyData.frameNumber = -1;

      return emptyData;
    }

    const canvas = document.createElement('canvas');

    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;

    const context = canvas.getContext('2d');

    context.drawImage(element, 0, 0);

    const scalarData = context.getImageData(0, 0, canvas.width, canvas.height)
      .data as FrameScalarData;

    scalarData.getRange = () => [0, 255];
    scalarData.frameNumber = frameNumber;
    this.frameScalarData = scalarData;

    return scalarData;
  }

  /**
   * A voxel manager over the RGBA pixels of the frame, whose value at a pixel
   * is its `[r, g, b]` triple, as on the legacy video viewport.
   *
   * @returns undefined when the pixels do not fill the frame, so that the
   * tools report no statistics and never a wrong value.
   */
  private getFrameVoxelManager(
    scalarData: FrameScalarData
  ): IVoxelManager<number> | IVoxelManager<RGB> | undefined {
    const element = this.getVideoElement();
    const width = element?.videoWidth;
    const height = element?.videoHeight;

    if (!width || !height || scalarData.length !== width * height * 4) {
      return undefined;
    }

    return VoxelManager.createScalarVolumeVoxelManager({
      dimensions: [width, height, 1],
      scalarData,
      numberOfComponents: 4,
      id: `videoFrame:${this.id}:${scalarData.frameNumber}`,
    });
  }

  /**
   * The geometry of the video that a canvas actor over it reads: its size,
   * spacing, origin and direction, and the index of a world point, which is
   * the point itself, as `getImageData` gives it. It reads no pixels.
   */
  private getOverlayGeometry():
    | (Pick<
        CPUIImageData,
        'dimensions' | 'spacing' | 'origin' | 'direction'
      > & {
        imageData: Pick<
          CPUIImageData['imageData'],
          'worldToIndex' | 'indexToWorld'
        >;
      })
    | undefined {
    const metadata = this.getVideoData()?.metadata;

    if (!metadata) {
      return;
    }

    const worldToIndex = (point: Point3): Point3 => [point[0], point[1], 0];

    return {
      dimensions: metadata.dimensions,
      spacing: metadata.spacing,
      origin: metadata.origin,
      direction: metadata.direction as CPUIImageData['direction'],
      imageData: {
        worldToIndex,
        indexToWorld: worldToIndex,
      },
    };
  }

  /**
   * Draws the overlay actors on the overlay layer, which is cleared first:
   * each visible actor through the transform from the pixels of the video to
   * the pixels of the layer, which the view gives (`worldToCanvas`), as the
   * planar viewport draws a labelmap on its CPU canvas. The layer is made on
   * the first draw with an actor, sized to the element in device pixels by
   * the rule of every canvas of a pane (`getDevicePixelSize`), and kept just
   * above the video element. CSS stretches the layer over the box of the
   * element, so a CSS pixel of the view is `layer.width / box.width` layer
   * pixels across and `layer.height / box.height` down, the box being the
   * `getBoundingClientRect()` of the element. Its context is made with
   * `willReadFrequently`: labelmaps that overlap are composed by reading the
   * layer back on each draw (`composeCanvasLabelmapLayer`), as on the CPU
   * canvas of a planar viewport.
   */
  private drawOverlayActors(videoElement: HTMLVideoElement): void {
    if (!this.overlayActors.length && !this.overlayLayer) {
      return;
    }

    const layer = this.getOverlayLayer(videoElement);
    const context = layer.getContext('2d', { willReadFrequently: true });
    const devicePixelSize = getDevicePixelSize(this.element);
    const width = Math.max(1, devicePixelSize.width);
    const height = Math.max(1, devicePixelSize.height);

    if (layer.width !== width || layer.height !== height) {
      layer.width = width;
      layer.height = height;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    resetCanvasLabelmapComposition(layer);

    const resolvedView = this.getResolvedView();

    if (!resolvedView || !this.overlayActors.length) {
      return;
    }

    const box = this.element.getBoundingClientRect();
    const scaleX = width / Math.max(box.width, 1);
    const scaleY = height / Math.max(box.height, 1);
    const origin = resolvedView.worldToCanvas([0, 0, 0]);
    const column = resolvedView.worldToCanvas([1, 0, 0]);
    const row = resolvedView.worldToCanvas([0, 1, 0]);

    context.setTransform(
      (column[0] - origin[0]) * scaleX,
      (column[1] - origin[1]) * scaleY,
      (row[0] - origin[0]) * scaleX,
      (row[1] - origin[1]) * scaleY,
      origin[0] * scaleX,
      origin[1] * scaleY
    );

    for (const { actor } of this.overlayActors) {
      (actor as CanvasActor).render(this as unknown as IViewport, context);
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
  }

  /**
   * The canvas of the overlay actors, made once, and put just after the video
   * elements: over the videos and under the SVG layer of the tools.
   */
  private getOverlayLayer(videoElement: HTMLVideoElement): HTMLCanvasElement {
    if (!this.overlayLayer) {
      const layer = document.createElement('canvas');

      layer.style.position = 'absolute';
      layer.style.inset = '0';
      layer.style.width = '100%';
      layer.style.height = '100%';
      layer.style.pointerEvents = 'none';
      this.overlayLayer = layer;
    }

    let lastVideo: Element = videoElement;

    while (lastVideo.nextElementSibling instanceof HTMLVideoElement) {
      lastVideo = lastVideo.nextElementSibling;
    }

    if (lastVideo.nextElementSibling !== this.overlayLayer) {
      lastVideo.after(this.overlayLayer);
    }

    return this.overlayLayer;
  }

  /**
   * Checks the frame on every animation frame while the video plays, with
   * `onPlaybackFrame`, until it pauses.
   */
  private watchPlayback(): void {
    if (this.isWatchingPlayback) {
      return;
    }

    const check = () => {
      const element = this.getVideoElement();

      if (this.isDestroyed || !element || element.paused) {
        this.isWatchingPlayback = false;

        return;
      }

      this.onPlaybackFrame();
      requestAnimationFrame(check);
    };

    this.isWatchingPlayback = true;
    check();
  }

  /**
   * Applies a resolved Video view state through the canonical mutation path.
   */
  private applyResolvedViewState(nextViewState: VideoViewState): void {
    this.setViewState(nextViewState);
  }

  /**
   * Shows the frame of the mount of a video, paused, as the legacy viewport
   * does: the video does not play, it only seeks to that frame when it shows
   * another one, and waits until the frame is painted. The frame is the one
   * at `targetTimeSeconds`, the time of the view: the first frame of the
   * range for the video that set the view up. A video that played
   * to load its frame (`playMutedForFrameData`) can show a later frame at the
   * pause while `currentTime` has not moved, and a seek to the time that the
   * element has already shows nothing new, so it seeks one frame on and then
   * to the frame to show. Rejects with `videoLoadError` when the video fails
   * before its first frame.
   */
  private async primeInitialFrame(
    element: HTMLVideoElement | undefined,
    videoData: LoadedData<VideoStreamPayload>,
    targetTimeSeconds: number
  ): Promise<void> {
    if (!element) {
      return;
    }

    const played = await waitForVideoReady(element, videoData.id);

    element.pause();

    if (played) {
      await seekVideoElement(
        element,
        targetTimeSeconds + 1 / Math.max(1, videoData.fps),
        true
      );
    }

    await seekVideoElement(element, targetTimeSeconds, played);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    this.syncCameraCurrentTimeFromElement();
  }
}

export default VideoViewport;

/**
 * Settles as the promise does, or rejects with the reason of the signal when
 * it aborts first.
 */
function untilAborted<T>(
  promise: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  if (!signal) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

/** An image id or an image URI of a video without its frame part. */
function withoutFrames(image: string): string {
  const framesMatch = image.match(FrameRange.frameRangeExtractor);

  return framesMatch ? image.substring(0, framesMatch.index) : image;
}

/**
 * Gives a reference whose image names a range of frames (`.../frames/3-9`)
 * as a reference to the first frame with the last frame in
 * `multiSliceReference`, which is how the reference check reads a range.
 * Any other reference comes back as it is.
 */
function asFrameRangeReference(viewRef: ViewReference): ViewReference {
  const image = viewRef?.referencedImageURI ?? viewRef?.referencedImageId;

  if (!image || viewRef.multiSliceReference) {
    return viewRef;
  }

  const firstFrame = FrameRange.imageIdToFrameStart(image);
  const lastFrame = FrameRange.imageIdToFrameEnd(image);

  if (!(lastFrame > firstFrame)) {
    return viewRef;
  }

  const atFrame = (value: string | undefined, frame: number) =>
    value?.replace(
      FrameRange.frameRangeExtractor,
      (_match, prefix: string) => `${prefix}${frame}`
    );

  return {
    ...viewRef,
    referencedImageId: atFrame(viewRef.referencedImageId, firstFrame),
    referencedImageURI: atFrame(viewRef.referencedImageURI, firstFrame),
    multiSliceReference: {
      referencedImageId: atFrame(viewRef.referencedImageId ?? image, lastFrame),
      referencedImageURI: atFrame(viewRef.referencedImageURI, lastFrame),
    },
  };
}

/**
 * How long a video whose network stopped before its first frame may take to
 * load the frame by itself before it plays muted to get it. Chrome stops for
 * a moment after the metadata and goes on loading; Safari on iOS stays
 * stopped.
 */
const FRAME_DATA_GRACE_MS = 250;

/**
 * Waits until a video element has the data of its current frame. When the
 * network stops first and is still stopped, with no frame, after
 * `FRAME_DATA_GRACE_MS`, it plays the video muted to get the frame
 * (`playMutedForFrameData`). Gives whether it played. Rejects with
 * `videoLoadError` when the element has or fires a media error before the
 * frame; `stalled` and `abort` do not end the wait.
 */
async function waitForVideoReady(
  element: HTMLVideoElement,
  displaySetId: string
): Promise<boolean> {
  if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return false;
  }

  if (element.error) {
    throw videoLoadError(displaySetId, element);
  }

  let played = false;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;

  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(videoLoadError(displaySetId, element));
    };
    const playIfStillStopped = () => {
      if (
        element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA &&
        element.networkState === HTMLMediaElement.NETWORK_IDLE
      ) {
        element.removeEventListener('suspend', onSuspend);
        played = true;
        playMutedForFrameData(element);
      }
    };
    const onSuspend = () => {
      if (element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        clearTimeout(graceTimer);
        graceTimer = setTimeout(playIfStillStopped, FRAME_DATA_GRACE_MS);
      }
    };
    const cleanup = () => {
      clearTimeout(graceTimer);
      element.removeEventListener('loadeddata', onReady);
      element.removeEventListener('canplay', onReady);
      element.removeEventListener('suspend', onSuspend);
      element.removeEventListener('error', onError);
    };

    element.addEventListener('loadeddata', onReady, { once: true });
    element.addEventListener('canplay', onReady, { once: true });
    element.addEventListener('suspend', onSuspend);
    element.addEventListener('error', onError);

    if (element.networkState === HTMLMediaElement.NETWORK_IDLE) {
      onSuspend();
    }
  });

  return played;
}

/**
 * Makes Safari on iOS load the frame of a paused video. Safari loads only the
 * metadata of a video that has not played and then stops (`suspend`), so the
 * first frame never comes. A muted video may play there without a tap: it
 * plays muted and pauses at once, and its own `muted` comes back. The caller
 * then seeks to the frame to show. Chrome too stops for a moment after the
 * metadata (`suspend`, the network idle) and then loads the frame by
 * itself; `waitForVideoReady` plays only when the network is still stopped
 * after `FRAME_DATA_GRACE_MS`.
 */
function playMutedForFrameData(element: HTMLVideoElement): void {
  const { muted } = element;

  element.muted = true;
  element
    .play()
    .then(() => element.pause())
    .catch(() => undefined)
    .finally(() => {
      element.muted = muted;
    });
}

/**
 * Seeks a video element and waits for `seeked`. Without `always` it does
 * nothing when the element is within a millisecond of the time. A video
 * with a media error does not seek, and an error during the seek ends the
 * wait: an error after the first frame does not fail a mount, which keeps
 * the frame that the video has.
 */
async function seekVideoElement(
  element: HTMLVideoElement,
  timeSeconds: number,
  always = false
): Promise<void> {
  if (
    element.error ||
    (!always && Math.abs((element.currentTime || 0) - timeSeconds) <= 0.001)
  ) {
    return;
  }

  await new Promise<void>((resolve) => {
    const onDone = () => {
      element.removeEventListener('seeked', onDone);
      element.removeEventListener('error', onDone);
      resolve();
    };

    element.addEventListener('seeked', onDone);
    element.addEventListener('error', onDone);
    element.currentTime = timeSeconds;
  });
}

function isVideoStreamData(
  data: LoadedData
): data is LoadedData<VideoStreamPayload> {
  if (typeof data !== 'object' || data === null || data.type !== 'video') {
    return false;
  }

  const payload = data as Record<string, unknown>;

  return (
    typeof payload.renderedUrl === 'string' &&
    typeof payload.fps === 'number' &&
    typeof payload.numberOfFrames === 'number' &&
    Array.isArray(payload.frameRange) &&
    payload.frameRange.length === 2 &&
    typeof payload.frameRange[0] === 'number' &&
    typeof payload.frameRange[1] === 'number'
  );
}

function isVideoElementRendering(rendering: {
  renderMode: string;
}): rendering is VideoElementRendering {
  return rendering.renderMode === 'video2d';
}
