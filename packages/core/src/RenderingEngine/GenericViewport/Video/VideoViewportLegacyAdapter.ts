import type {
  ActorEntry,
  CPUIImageData,
  DisplayArea,
  ICamera,
  IImage,
  ImageSetOptions,
  IVoxelManager,
  RGB,
  VideoViewportProperties,
  ViewportInput,
  ViewReference,
  ViewReferenceSpecifier,
  VOIRange,
  ViewPresentation,
  ViewPresentationSelector,
} from '../../../types';
import type { Point2, Point3 } from '../../../types';
import type ViewportInputOptions from '../../../types/ViewportInputOptions';
import { Events, VideoEnums } from '../../../enums';
import { deepClone } from '../../../utilities/deepClone';
import FrameRange from '../../../utilities/FrameRange';
import { coreLog } from '../../../utilities/logger';
import triggerEvent from '../../../utilities/triggerEvent';
import { getVideoImageDataMetadata } from '../../../utilities/VideoUtilities';
import type { VideoImageMetadata } from '../../../utilities/VideoUtilities';
import VoxelManager from '../../../utilities/VoxelManager';
import getOrCreateCanvas from '../../helpers/getOrCreateCanvas';
import { getGenericViewportSourceDataId } from '../genericViewportDisplaySetAccess';
import type { GenericViewportReferenceContext } from '../genericViewportReferenceCompatibility';
import { viewportProjection } from '../viewportProjection';
import type {
  VideoDataPresentation,
  VideoViewState,
  VideoViewportInput,
} from './VideoViewportTypes';
import VideoViewport from './VideoViewport';

const log = coreLog.getLogger('RenderingEngine', 'VideoViewportLegacyAdapter');

/** The RGBA pixels of one video frame, with the frame number they show. */
type FrameScalarData = Uint8ClampedArray & {
  frameNumber?: number;
  getRange?: () => [number, number];
};

class VideoViewportLegacyAdapter extends VideoViewport {
  /**
   * The canvas of the viewport element, as on the legacy viewports. The next
   * video viewport draws the frame with a video element, so this canvas
   * holds no pixels of the video.
   */
  readonly canvas: HTMLCanvasElement;

  /** The options that the viewport was made with. */
  readonly defaultOptions: ViewportInputOptions;

  /** Whether the viewport fires no events, from the default options. */
  readonly suppressEvents: boolean;

  /**
   * False until the rendering engine disables the viewport, as on the legacy
   * viewports. The engine sets it to true.
   */
  isDisabled = false;

  /**
   * The options of the viewport, as on the legacy viewport: a copy of the
   * default options until `setOptions` or `reset` changes them.
   */
  options: ViewportInputOptions;

  /** The frames that playback stays in, or undefined for every frame. */
  private frameRange?: [number, number];

  /** The number of frames that one step of `scroll` moves. */
  private scrollSpeed = 1;

  /** Whether the check that follows the frames of playback is running. */
  private isWatchingPlayback = false;

  /** The frame number of the last frame event. */
  private lastEventFrameNumber?: number;

  /** The pixels of the frame that `getImageData` read last. */
  private frameScalarData?: FrameScalarData;

  constructor(
    args: VideoViewportInput &
      Partial<Pick<ViewportInput, 'canvas' | 'defaultOptions'>>
  ) {
    super(args);
    this.canvas = args.canvas || getOrCreateCanvas(this.element);
    this.defaultOptions = deepClone(args.defaultOptions || {});
    this.options = deepClone(this.defaultOptions);
    this.suppressEvents = Boolean(this.defaultOptions.suppressEvents);
  }

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
   * and then shows the frame that the options name: `frameNumber` (1-based)
   * or `viewReference.sliceIndex` (0-based), as on the legacy viewport.
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
    this.frameRange = undefined;
    this.frameScalarData = undefined;
    await super.setDisplaySets(...entries);

    const { frameNumber, viewReference } = entries[0]?.options ?? {};
    const initialFrameNumber =
      frameNumber ??
      (typeof viewReference?.sliceIndex === 'number'
        ? viewReference.sliceIndex + 1
        : undefined);

    if (typeof initialFrameNumber === 'number') {
      this.setFrameNumber(initialFrameNumber);
    }

    this.getVideoElement()?.addEventListener('seeked', () =>
      this.triggerFrameEvents()
    );
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
   * The view reference of the next viewport with the camera of the legacy
   * video viewport: the focal point, the view plane normal and the view up.
   * The area tools read the normal of an annotation to measure the frame.
   */
  getViewReference(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): ViewReference {
    const viewReference = super.getViewReference(viewRefSpecifier);
    const camera = this.getResolvedView()?.toICamera();

    if (!camera) {
      return viewReference;
    }

    return {
      ...viewReference,
      cameraFocalPoint: camera.focalPoint,
      viewPlaneNormal: camera.viewPlaneNormal,
      viewUp: camera.viewUp,
    };
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
      scrollSpeed: this.scrollSpeed,
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

  /**
   * Starts playback. While it plays, the playback stays in the frame range
   * of `setFrameRange`, as on the legacy video viewport: a frame after the
   * range goes back to its first frame. Each new frame fires the frame events
   * of the legacy video viewport.
   */
  async play(): Promise<void> {
    await super.play();
    this.watchPlayback();
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
   * Moves by frames, as the next viewport does, with each step the number
   * of frames of `setScrollSpeed`.
   */
  async scroll(delta = 1, debounceLoading = true, loop = false): Promise<void> {
    super.scroll(delta * this.scrollSpeed, debounceLoading, loop);
  }

  /**
   * Sets how far one step of `scroll` moves, in frames, or in seconds with
   * `SpeedUnit.SECOND`.
   */
  setScrollSpeed(scrollSpeed = 1, unit = VideoEnums.SpeedUnit.FRAME): void {
    this.scrollSpeed =
      unit === VideoEnums.SpeedUnit.SECOND
        ? scrollSpeed * this.getFrameRate()
        : scrollSpeed;
  }

  /**
   * Sets the 1-based first and last frame that playback stays in. No range
   * means every frame. A range that is not two different frames is ignored,
   * as on the legacy video viewport.
   */
  setFrameRange(frameRange: number[]): void {
    if (!frameRange) {
      this.frameRange = undefined;

      return;
    }

    if (frameRange.length !== 2 || frameRange[0] === frameRange[1]) {
      return;
    }

    this.frameRange = [frameRange[0], frameRange[1]];
  }

  /** The 1-based first and last frame that playback stays in. */
  getFrameRange(): [number, number] {
    const frameRange = this.frameRange ??
      this.getVideoData()?.frameRange ?? [0, 0];

    return [frameRange[0], frameRange[1]];
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
    this.options = deepClone(this.defaultOptions);

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
    return this.options?.displayArea;
  }

  /**
   * The reference contexts of the next viewport with the focal point and the
   * view plane normal of the camera, as the generic viewport gives them, so
   * that a reference with a view plane normal is viewable here.
   */
  protected getReferenceViewContexts(): GenericViewportReferenceContext[] {
    const camera = this.getResolvedView()?.toICamera();

    return super.getReferenceViewContexts().map((context) =>
      camera
        ? {
            ...context,
            cameraFocalPoint: camera.focalPoint,
            viewPlaneNormal: camera.viewPlaneNormal,
          }
        : context
    );
  }

  /**
   * Checks the frame on every animation frame while the video plays. A frame
   * out of the frame range goes back to the first frame of the range, and a
   * new frame fires the frame events.
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

      const frameNumber = this.getFrameNumber();

      if (
        this.frameRange &&
        (frameNumber < this.frameRange[0] || frameNumber > this.frameRange[1])
      ) {
        this.setFrameNumber(this.frameRange[0]);
      } else if (frameNumber !== this.lastEventFrameNumber) {
        this.triggerFrameEvents();
      }

      requestAnimationFrame(check);
    };

    this.isWatchingPlayback = true;
    check();
  }

  /**
   * Fires `STACK_NEW_IMAGE` and `IMAGE_RENDERED` with the time and the
   * duration of the video, as the legacy video viewport does for each frame
   * that it draws.
   */
  private triggerFrameEvents(): void {
    const element = this.getVideoElement();

    if (this.isDestroyed || !element) {
      return;
    }

    const { currentTime: time, duration } = element;

    this.lastEventFrameNumber = this.getFrameNumber();
    triggerEvent(this.element, Events.STACK_NEW_IMAGE, {
      element: this.element,
      viewportId: this.id,
      viewport: this,
      renderingEngineId: this.renderingEngineId,
      time,
      duration,
    });
    triggerEvent(this.element, Events.IMAGE_RENDERED, {
      element: this.element,
      viewportId: this.id,
      viewport: this,
      imageIndex: this.getCurrentImageIdIndex(),
      numberOfSlices: this.getNumberOfFrames(),
      renderingEngineId: this.renderingEngineId,
      time,
      duration,
    });
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
}

export default VideoViewportLegacyAdapter;
