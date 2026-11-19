import type {
  ActorEntry,
  DisplayArea,
  ICamera,
  IImage,
  ImageSetOptions,
  VideoViewportProperties,
  ViewReference,
  VOIRange,
  ViewPresentation,
  ViewPresentationSelector,
} from '../../../types';
import type { Point2 } from '../../../types';
import { Events, VideoEnums } from '../../../enums';
import type ViewportInputOptions from '../../../types/ViewportInputOptions';
import { deepClone } from '../../../utilities/deepClone';
import triggerEvent from '../../../utilities/triggerEvent';
import FrameRange from '../../../utilities/FrameRange';
import { coreLog } from '../../../utilities/logger';
import { getVideoImageDataMetadata } from '../../../utilities/VideoUtilities';
import type { VideoImageMetadata } from '../../../utilities/VideoUtilities';
import { getGenericViewportSourceDataId } from '../genericViewportDisplaySetAccess';
import { viewportProjection } from '../viewportProjection';
import type {
  VideoDataPresentation,
  VideoViewState,
} from './VideoViewportTypes';
import VideoViewport from './VideoViewport';

const log = coreLog.getLogger('RenderingEngine', 'VideoViewportLegacyAdapter');

class VideoViewportLegacyAdapter extends VideoViewport {
  /**
   * False until the rendering engine disables the viewport, as on the legacy
   * viewports. The engine sets it to true.
   */
  isDisabled = false;

  /**
   * The options of the viewport, as on the legacy viewport: a copy of the
   * default options until `setOptions` or `reset` changes them.
   */
  options = deepClone(this.defaultOptions) as ViewportInputOptions;

  /**
   * Whether the viewport was made with the `suppressEvents` option, as on the
   * legacy viewport. It then fires no CAMERA_MODIFIED and no CAMERA_RESET.
   */
  readonly suppressEvents = Boolean(this.defaultOptions.suppressEvents);

  /** The id of the viewport. The legacy video viewport never set it. */
  get uid(): string {
    return this.id;
  }

  /** The modality of the video in the viewport, from its series metadata. */
  get modality(): string | undefined {
    return this.getVideoData()?.modality;
  }

  /**
   * Mounts the first display set as the video, as the next viewport does,
   * which shows the 1-based `frameNumber` of the options. Without one it then
   * shows the 0-based `viewReference.sliceIndex` of the options, as on the
   * legacy viewport.
   */
  async setDisplaySets(
    ...entries: Array<{
      displaySetId: string;
      options?: {
        frameNumber?: number;
        viewReference?: { sliceIndex?: number };
      };
    }>
  ): Promise<void> {
    await super.setDisplaySets(...entries);

    const { frameNumber, viewReference } = entries[0]?.options ?? {};

    if (
      frameNumber === undefined &&
      typeof viewReference?.sliceIndex === 'number'
    ) {
      this.setFrameNumber(viewReference.sliceIndex + 1);
    }
  }

  setDataIds(imageIds: string[], options?: ImageSetOptions) {
    const dataId = imageIds[0];

    if (!dataId) {
      return;
    }

    return this.setVideo(
      dataId,
      ((options?.viewReference?.sliceIndex as number) || 0) + 1
    );
  }

  async setVideo(imageId: string, frameNumber?: number): Promise<this> {
    await this.setDisplaySets({ displaySetId: imageId });

    if (typeof frameNumber === 'number') {
      this.setFrameNumber(frameNumber);
    }

    return this;
  }

  setProperties(props: VideoViewportProperties): void {
    if (props.scrollSpeed !== undefined) {
      this.setScrollSpeed(props.scrollSpeed);
    }

    const dataId = this.getFirstBinding()?.data.id;

    if (!dataId) {
      return;
    }

    const dataPresentation: Partial<VideoDataPresentation> = {};
    const viewPresentation: ViewPresentation = {};

    if (typeof props.loop === 'boolean') {
      dataPresentation.loop = props.loop;
    }
    if (typeof props.muted === 'boolean') {
      dataPresentation.muted = props.muted;
    }
    if (typeof props.playbackRate === 'number') {
      dataPresentation.playbackRate = props.playbackRate;
    }
    if (props.pan) {
      viewPresentation.pan = props.pan;
    }
    if (props.voiRange) {
      dataPresentation.voiRange = props.voiRange;
    }
    if (props.invert !== undefined) {
      dataPresentation.invert = props.invert;
    }

    if (Object.keys(dataPresentation).length) {
      this.setDisplaySetPresentation(dataId, dataPresentation);
    }

    if (Object.keys(viewPresentation).length) {
      this.setViewPresentation(viewPresentation);
    }
  }

  /**
   * Compatibility wrapper for legacy callers. Next viewports should read
   * presentation through `viewportProjection.getPresentation`.
   */
  getViewPresentation(
    selector?: ViewPresentationSelector
  ): ViewPresentation | undefined {
    return viewportProjection.getPresentation<ViewPresentation>(this, {
      selector,
    });
  }

  /**
   * Compatibility wrapper for legacy callers. Next viewports should use
   * viewport projection to derive view state, then call `setViewState`.
   */
  setViewPresentation(viewPres?: ViewPresentation): void {
    if (!viewPres) {
      return;
    }

    const nextViewState = viewportProjection.withPresentation<
      VideoViewState,
      ViewPresentation
    >(this, viewPres);

    if (nextViewState) {
      this.setViewState(nextViewState);
    }
  }

  /**
   * Compatibility wrapper for legacy callers. Direct Next viewports should use
   * `resetViewState`.
   */
  resetCamera(): boolean {
    return this.resetViewState();
  }

  /**
   * Returns the legacy camera of the frame on display: the world point at the
   * centre of the canvas as the focal point, and the parallel scale of the
   * zoom, as on the legacy video viewport, together with the view state.
   */
  getCamera(): VideoViewState & ICamera {
    return {
      ...this.getViewState(),
      ...this.getCameraForEvent(),
    } as VideoViewState & ICamera;
  }

  /**
   * Applies a legacy camera. A `parallelScale` sets the zoom, and a
   * `focalPoint` moves the view so that this world point shows at the centre
   * of the canvas, as on the legacy video viewport. Without a focal point the
   * centre of the view stays where it is.
   */
  setCamera(camera: Partial<ICamera>): void {
    const resolvedView = this.getResolvedView();
    const { parallelScale, focalPoint } = camera;

    if (!resolvedView || (!(parallelScale > 0) && !focalPoint)) {
      return;
    }

    const currentCamera = resolvedView.toICamera();
    const center = focalPoint ?? currentCamera.focalPoint;
    const viewStatePatch: Partial<VideoViewState> = {
      anchorCanvas: [0.5, 0.5],
      anchorWorld: [center[0], center[1]],
    };

    if (parallelScale > 0) {
      viewStatePatch.scale =
        (resolvedView.zoom * currentCamera.parallelScale) / parallelScale;
    }

    this.setViewState(viewStatePatch);
  }

  /**
   * Sets the zoom. The second argument is a canvas point to zoom about, as on
   * the next viewport. A boolean there is the `storeAsInitialCamera` flag of
   * the legacy viewports, which the video viewport does not use.
   */
  setZoom(zoom: number, canvasPoint?: Point2 | boolean): void {
    super.setZoom(zoom, Array.isArray(canvasPoint) ? canvasPoint : undefined);
  }

  /**
   * The pan of the legacy video viewport, in world units of the video: a
   * world point shows at the canvas point `(world + pan) * ratio`.
   */
  getPan(): Point2 {
    return this.getResolvedView()?.pan ?? [0, 0];
  }

  /** Sets the pan of the legacy video viewport, in world units of the video. */
  setPan(pan: Point2): void {
    const resolvedView = this.getResolvedView();

    if (resolvedView) {
      this.setViewState(resolvedView.withPan(pan).state.viewState);
    }
  }

  /** The rotation of the view state in degrees. */
  getRotation(): number {
    return this.getViewState().rotation ?? 0;
  }

  getProperties(): VideoViewportProperties {
    const dataId = this.getFirstBinding()?.data.id;
    const dataPresentation = dataId
      ? this.getDisplaySetPresentation(dataId)
      : undefined;
    const viewPresentation = this.getViewPresentation();

    return {
      invert: dataPresentation?.invert,
      loop: dataPresentation?.loop,
      muted: dataPresentation?.muted,
      pan: viewPresentation?.pan,
      playbackRate: dataPresentation?.playbackRate,
      scrollSpeed: this.getScrollStepFrames(),
      voiRange: dataPresentation?.voiRange ?? { lower: 0, upper: 255 },
    };
  }

  resetProperties(): void {
    const dataId = this.getFirstBinding()?.data.id;

    if (!dataId) {
      return;
    }

    this.setDisplaySetPresentation(dataId, {
      invert: false,
      loop: true,
      muted: true,
      playbackRate: 1,
      voiRange: undefined,
    });
    this.setViewPresentation({
      pan: [0, 0] as Point2,
      zoom: 1,
    });
  }

  setVOI(voiRange: VOIRange): void {
    const dataId = this.getFirstBinding()?.data.id;

    if (!dataId) {
      return;
    }

    this.setDisplaySetPresentation(dataId, { voiRange });
  }

  /**
   * Sets the VOI from a window width and a window centre, as on the legacy
   * video viewport.
   */
  setWindowLevel(windowWidth = 256, windowCenter = 128): void {
    this.setVOI({
      lower: windowCenter - windowWidth / 2,
      upper: windowCenter + windowWidth / 2 - 1,
    });
  }

  setAverageWhite(averageWhite: [number, number, number]): void {
    const dataId = this.getFirstBinding()?.data.id;

    if (!dataId) {
      return;
    }

    this.setDisplaySetPresentation(dataId, { averageWhite });
  }

  /** Plays a paused video and pauses a playing one; true when it now plays. */
  togglePlayPause(): boolean {
    const element = this.getVideoElement();

    if (element && !element.paused) {
      this.pause();

      return false;
    }

    this.play();

    return true;
  }

  /** Goes to the time in seconds. */
  async setTime(timeInSeconds: number): Promise<void> {
    this.seek(timeInSeconds);
  }

  /** Goes to the start of the video. */
  async start(): Promise<void> {
    this.seek(0);
  }

  /** Goes to the end of the video. */
  async end(): Promise<void> {
    const durationSeconds = this.getVideoData()?.durationSeconds;

    if (typeof durationSeconds === 'number') {
      this.seek(durationSeconds);
    }
  }

  /** Goes to the 1-based frame number. */
  async setFrameNumber(frameNumber: number): Promise<void> {
    super.setFrameNumber(frameNumber);
  }

  /**
   * Moves by steps, as the next viewport does, with each step the number of
   * frames of `setScrollSpeed`.
   */
  async scroll(delta = 1, debounceLoading = true, loop = false): Promise<void> {
    super.scroll(delta, debounceLoading, loop);
  }

  /**
   * Sets how far one step of `scroll` moves, in frames, or in seconds with
   * `SpeedUnit.SECOND`: the `scrollStep` of the view state.
   */
  setScrollSpeed(scrollSpeed = 1, unit = VideoEnums.SpeedUnit.FRAME): void {
    this.viewState = this.normalizeViewState({
      ...this.viewState,
      scrollStep: { value: scrollSpeed, unit },
    });
  }

  /**
   * Sets the 1-based first and last frame that playback stays in, which is
   * the frame range of the view state. No range means every frame. A range
   * that is not two different frames is ignored, and no event fires, as on
   * the legacy video viewport.
   */
  setFrameRange(frameRange: number[]): void {
    if (
      frameRange &&
      (frameRange.length !== 2 || frameRange[0] === frameRange[1])
    ) {
      return;
    }

    this.viewState = this.normalizeViewState({
      ...this.viewState,
      frameRange: frameRange ? [frameRange[0], frameRange[1]] : undefined,
    });
  }

  /** The 1-based first and last frame that playback stays in. */
  getFrameRange(): [number, number] {
    return this.getPlaybackFrameRange();
  }

  /**
   * The first frame number that an image id or a view reference names, as on
   * the legacy video viewport.
   */
  getSliceIndexForImage(reference: string | ViewReference): number {
    if (!reference) {
      return;
    }

    if (typeof reference === 'string') {
      return FrameRange.imageIdToFrameStart(reference);
    }

    if (reference.referencedImageId) {
      return FrameRange.imageIdToFrameStart(reference.referencedImageId);
    }
  }

  /**
   * Whether the viewport shows the video of this image URI. A frame number or
   * a frame range in the URI is ignored, as on the legacy video viewport.
   */
  hasImageURI(imageURI: string): boolean {
    const dataId = this.getFirstBinding()?.data.id;

    if (!dataId || !imageURI) {
      return false;
    }

    const framesMatch = imageURI.match(FrameRange.frameRangeExtractor);
    const testURI = framesMatch
      ? imageURI.substring(0, framesMatch.index)
      : imageURI;

    return getGenericViewportSourceDataId(dataId).includes(testURI);
  }

  /** The geometry of a video image, from its image plane metadata. */
  getImageDataMetadata(image: IImage | string): VideoImageMetadata {
    return getVideoImageDataMetadata(
      typeof image === 'string' ? image : image.imageId
    );
  }

  /** No actors: the next video viewport draws with a video element. */
  getActors(): ActorEntry[] {
    return [];
  }

  /** Undefined: the next video viewport has no actors. */
  getDefaultActor(): ActorEntry | undefined {
    return undefined;
  }

  /** Undefined: the next video viewport has no actors. */
  getActor(_actorUID: string): ActorEntry | undefined {
    return undefined;
  }

  /** Returns the canvas of the viewport element. */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Sets the options of the viewport and renders when `immediate` is set. A
   * display area or an aspect ratio in the options is not applied, and the
   * adapter logs a warning for them.
   */
  setOptions(options: ViewportInputOptions, immediate = false): void {
    this.options = deepClone(options);

    if (this.options?.displayArea || this.options?.aspectRatio) {
      log.warn(
        'A video viewport does not apply the display area or the aspect ratio of its options'
      );
    }

    if (immediate) {
      this.render();
    }
  }

  /**
   * Sets the options back to the default options, as on the legacy viewport,
   * and renders when `immediate` is set.
   */
  reset(immediate = false): void {
    this.options = deepClone(this.defaultOptions) as ViewportInputOptions;

    if (immediate) {
      this.render();
    }
  }

  /** Always false, as on the legacy viewports: the view plane stays the same. */
  isOrientationChangeable(): boolean {
    return false;
  }

  /** The display area of the options, as on the legacy viewport. */
  getDisplayArea(): DisplayArea | undefined {
    return this.options?.displayArea as DisplayArea | undefined;
  }

  /**
   * Fires NEW_IMAGE for the frame on display as the next viewport does, and
   * then STACK_NEW_IMAGE as the legacy video viewport fired it for a frame:
   * the image id and the 0-based index of the frame, with the time and the
   * duration of the video in seconds.
   */
  protected override triggerFrameEvents(): void {
    super.triggerFrameEvents();

    const element = this.getVideoElement();

    if (this.isDestroyed || !element) {
      return;
    }

    const imageIdIndex = this.getCurrentImageIdIndex();

    triggerEvent(this.element, Events.STACK_NEW_IMAGE, {
      element: this.element,
      imageId: this.getCurrentImageId(imageIdIndex),
      imageIdIndex,
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      time: element.currentTime,
      duration: element.duration,
    });
  }
}

export default VideoViewportLegacyAdapter;
