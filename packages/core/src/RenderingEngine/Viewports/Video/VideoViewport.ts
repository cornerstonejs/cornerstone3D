import BaseViewport from '../BaseViewport';
import type {
  ActorEntry,
  CPUIImageData,
  EventTypes,
  IStackInput,
  IViewport,
  IVoxelManager,
  ImageActor,
  Point2,
  Point3,
  ReferenceCompatibleOptions,
  RGB,
  ViewReference,
  ViewReferenceSpecifier,
  ViewportContentMode,
} from '../../../types';
import { ActorRenderMode } from '../../../types';
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
import { generateFrameImageId } from '../../../utilities/splitImageIdsBy4DTags';
import imageIdToURI from '../../../utilities/imageIdToURI';
import { DefaultVideoDataProvider } from './DefaultVideoDataProvider';
import type {
  LoadedData,
  ViewportDataBinding,
} from '../ViewportArchitectureTypes';
import { getDisplaySetImageId } from '../displaySetAccess';
import type { ViewReferenceContext } from '../viewReferenceCompatibility';
import type {
  VideoViewState,
  VideoDisplaySetAppearance,
  VideoElementRenderContext,
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
   * HTML video render path. The first entry is mounted as the source binding,
   * and the video then shows the 1-based `frameNumber` of its options.
   * NEW_IMAGE fires once for the frame that the mount shows: after the seek
   * when the mount seeks, else when the frame shows. The legacy video viewport
   * fired its new image event at every mount too.
   *
   * @param entries - Video display sets to mount.
   */
  async setDisplaySets(
    ...entries: Array<{
      displaySetId: string;
      options?: { frameNumber?: number };
    }>
  ): Promise<void> {
    this.removeAllData();
    this.overlayActors = [];
    this.frameScalarData = undefined;
    this.lastFrameEventNumber = undefined;

    for (const [index, { displaySetId }] of entries.entries()) {
      await this.addDisplaySet(displaySetId, {
        renderMode: 'video2d',
        role: index === 0 ? 'source' : 'overlay',
      });
      const binding = this.getBinding(displaySetId);

      if (!binding) {
        continue;
      }

      this.setDefaultAppearance(displaySetId, {
        visible: true,
        opacity: 1,
        playbackRate: 1,
        loop: true,
        muted: true,
        objectFit: 'contain',
      });

      const videoData = this.getVideoDataFromBinding(binding);

      if (!videoData) {
        throw new Error(
          `[VideoViewport] Loaded data for ${displaySetId} is not a valid video stream`
        );
      }

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

      this.modified();
      this.trackVideoElement();
      await this.primeInitialFrame(videoData);
    }

    const frameNumber = entries[0]?.options?.frameNumber;

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
   * Removes a video dataset and rebinds tracking if the primary video changed.
   * An id of an image drawn over the video (`addImages`) removes that image.
   *
   * @param displaySetId - Logical dataset id to remove.
   */
  removeDisplaySet(displaySetId: string): void {
    const overlayActors = this.overlayActors.filter(
      (actorEntry) => actorEntry.uid !== displaySetId
    );

    if (overlayActors.length !== this.overlayActors.length) {
      this.overlayActors = overlayActors;
      this.render();
      return;
    }

    const firstDisplaySetId = this.getFirstBinding()?.data.id;

    super.removeDisplaySet(displaySetId);

    if (firstDisplaySetId === displaySetId) {
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
    const displaySetId = this.getFirstBinding()?.data.id;
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
      this.getFirstBinding()?.data.id || ''
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
   * Whether the viewport shows a reference. A reference to an image of one
   * frame shows on that frame. A reference whose image names a range of
   * frames (`.../frames/3-9`) shows on each frame of the range. A reference
   * to the video without a frame shows on every frame. With `withNavigation`
   * the answer is whether the video has the frame at all.
   */
  override isReferenceViewable(
    viewRef: ViewReference,
    options: ReferenceCompatibleOptions = {}
  ): boolean {
    return super.isReferenceViewable(asFrameRangeReference(viewRef), options);
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
          actorMapper: {
            actor,
            mapper: actor.getMapper(),
            renderMode: ActorRenderMode.CPU_IMAGE,
          },
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
   */
  getResolvedView(): VideoResolvedView | undefined {
    const videoElement = this.getVideoElement();
    const videoData = this.getVideoData();

    if (!videoElement || !videoData) {
      return;
    }

    this.syncCameraCurrentTimeFromElement();

    return new VideoResolvedView({
      viewState: this.viewState,
      containerHeight: this.element.clientHeight,
      containerWidth: this.element.clientWidth,
      frameOfReferenceUID:
        (
          videoData.metadata.imagePlaneModule as
            | { frameOfReferenceUID?: string }
            | undefined
        )?.frameOfReferenceUID || videoData.renderedUrl,
      intrinsicHeight: videoElement.videoHeight || this.element.clientHeight,
      intrinsicWidth: videoElement.videoWidth || this.element.clientWidth,
      objectFit: this.getDisplaySetAppearance(videoData.id)?.objectFit,
      payload: videoData,
    });
  }

  /**
   * The reference context of the video, with the focal point and the view
   * plane normal of the view, so that a reference with a view plane normal
   * is viewable here.
   */
  protected getReferenceViewContexts(): ViewReferenceContext[] {
    const binding = this.getFirstBinding();
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
    const displaySetId = this.getFirstBinding()?.data.id;

    if (!displaySetId) {
      return;
    }

    this.setDisplaySetAppearance(displaySetId, {
      playbackRate,
    });
  }

  /**
   * Scrolls through frames using a signed delta.
   *
   * @param delta - Signed number of scroll steps to move by. A step is one
   * frame, or the `scrollStep` of the view state.
   * @param _debounceLoading - Unused compatibility argument kept for stack-like
   * callers.
   * @param loop - Whether to wrap when scrolling past either end.
   */
  scroll(delta = 1, _debounceLoading = true, loop = false): void {
    const videoData = this.getVideoData();

    if (!videoData?.fps) {
      return;
    }

    this.pause();

    const minTimeSeconds = frameNumberToTimeSeconds(
      videoData.frameRange[0],
      videoData.fps
    );
    const maxTimeSeconds =
      videoData.durationSeconds ??
      frameNumberToTimeSeconds(videoData.frameRange[1], videoData.fps);
    let nextTimeSeconds =
      this.getCurrentTime() +
      (delta * this.getScrollStepFrames()) / videoData.fps;

    if (loop) {
      const durationSeconds = Math.max(
        maxTimeSeconds - minTimeSeconds,
        1 / videoData.fps
      );

      while (nextTimeSeconds < minTimeSeconds) {
        nextTimeSeconds += durationSeconds;
      }

      while (nextTimeSeconds > maxTimeSeconds) {
        nextTimeSeconds -= durationSeconds;
      }
    } else {
      nextTimeSeconds = Math.max(
        minTimeSeconds,
        Math.min(nextTimeSeconds, maxTimeSeconds)
      );
    }

    this.seek(nextTimeSeconds);
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
    const displaySetId = this.getFirstBinding()?.data.id;
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
   * fires it for a new image: the 0-based index of the frame, the number of
   * frames and the image id of the frame. A video has no image object for a
   * frame. Then asks for the IMAGE_RENDERED of the frame.
   */
  private triggerFrameEvents(): void {
    const element = this.getVideoElement();

    if (this.isDestroyed || !element) {
      return;
    }

    const imageIdIndex = this.getCurrentImageIdIndex();
    const detail: EventTypes.NewImageEventDetail = {
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      imageIdIndex,
      numberOfSlices: this.getNumberOfFrames(),
      imageId: this.getCurrentImageId(imageIdIndex),
      image: undefined,
    };

    this.lastFrameEventNumber = imageIdIndex + 1;
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
    const binding = this.getFirstBinding();

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
   * the first draw with an actor, sized to the element in device pixels, and
   * kept just above the video element.
   */
  private drawOverlayActors(videoElement: HTMLVideoElement): void {
    if (!this.overlayActors.length && !this.overlayLayer) {
      return;
    }

    const layer = this.getOverlayLayer(videoElement);
    const context = layer.getContext('2d');
    const devicePixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(
      1,
      Math.round(this.element.clientWidth * devicePixelRatio)
    );
    const height = Math.max(
      1,
      Math.round(this.element.clientHeight * devicePixelRatio)
    );

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

    const scale = width / Math.max(this.element.clientWidth, 1);
    const origin = resolvedView.worldToCanvas([0, 0, 0]);
    const column = resolvedView.worldToCanvas([1, 0, 0]);
    const row = resolvedView.worldToCanvas([0, 1, 0]);

    context.setTransform(
      (column[0] - origin[0]) * scale,
      (column[1] - origin[1]) * scale,
      (row[0] - origin[0]) * scale,
      (row[1] - origin[1]) * scale,
      origin[0] * scale,
      origin[1] * scale
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
   * Shows the first frame of the range, paused, as the legacy viewport does:
   * the video does not play, it only seeks to that frame when it shows
   * another one, and waits until the frame is painted.
   */
  private async primeInitialFrame(
    videoData: LoadedData<VideoStreamPayload>
  ): Promise<void> {
    const element = this.getVideoElement();

    if (!element) {
      return;
    }

    await waitForVideoReady(element);

    const targetTimeSeconds =
      videoData.frameRange[0] > 1
        ? frameNumberToTimeSeconds(videoData.frameRange[0], videoData.fps)
        : 0;

    element.pause();
    await seekVideoElement(element, targetTimeSeconds);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    this.syncCameraCurrentTimeFromElement();
  }
}

export default VideoViewport;

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

async function waitForVideoReady(element: HTMLVideoElement): Promise<void> {
  if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return;
  }

  await new Promise<void>((resolve) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onSuspend = () => {
      if (element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        element.removeEventListener('suspend', onSuspend);
        playMutedForFrameData(element);
      }
    };
    const cleanup = () => {
      element.removeEventListener('loadeddata', onReady);
      element.removeEventListener('canplay', onReady);
      element.removeEventListener('suspend', onSuspend);
    };

    element.addEventListener('loadeddata', onReady, { once: true });
    element.addEventListener('canplay', onReady, { once: true });
    element.addEventListener('suspend', onSuspend);

    if (element.networkState === HTMLMediaElement.NETWORK_IDLE) {
      onSuspend();
    }
  });
}

/**
 * Makes Safari on iOS load the frame of a paused video. Safari loads only the
 * metadata of a video that has not played and then stops (`suspend`), so the
 * first frame never comes. A muted video may play there without a tap: it
 * plays muted and pauses at once, and its own `muted` comes back. The caller
 * then seeks to the frame to show. Other browsers load the frame without it.
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

async function seekVideoElement(
  element: HTMLVideoElement,
  timeSeconds: number
): Promise<void> {
  if (Math.abs((element.currentTime || 0) - timeSeconds) <= 0.001) {
    return;
  }

  await new Promise<void>((resolve) => {
    const onSeeked = () => {
      element.removeEventListener('seeked', onSeeked);
      resolve();
    };

    element.addEventListener('seeked', onSeeked, { once: true });
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
