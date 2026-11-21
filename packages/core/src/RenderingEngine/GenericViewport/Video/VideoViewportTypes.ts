import type {
  BaseViewportRenderContext,
  BasePresentationProps,
  DataProvider,
  MountedRendering,
  RenderPathResolver,
} from '../ViewportArchitectureTypes';
import type { ViewportCameraBase } from '../ViewportCameraTypes';
import type { VideoImageMetadata } from '../../../utilities/VideoUtilities';
import type { VOIRange } from '../../../types';
import type ViewportInputOptions from '../../../types/ViewportInputOptions';
import type { SpeedUnit } from '../../../enums/VideoEnums';

/** @internal */
export interface VideoStreamPayload {
  renderedUrl: string;
  fps: number;
  numberOfFrames: number;
  frameRange: [number, number];
  durationSeconds?: number;
  modality?: string;
  metadata: VideoImageMetadata;
}

export interface VideoPresentationProps extends BasePresentationProps {}

export interface VideoViewState extends ViewportCameraBase<[number, number]> {
  currentTimeSeconds?: number;
  /**
   * The first and the last frame that playback stays in, as 1-based frame
   * numbers. Undefined for the whole video. A range that is not two
   * different frame numbers is dropped. A reset of the view state and a
   * mount of a video clear it.
   */
  frameRange?: [number, number];
  /**
   * How far one step of `scroll` moves: `value` frames, or `value` seconds
   * with `SpeedUnit.SECOND`. One frame when not set. `utilities.scroll` and
   * the stack scroll tool move by steps of it, and `getNumberOfSlices` and
   * `getSliceIndex` count in these steps, as with the legacy
   * `setScrollSpeed`. A reset of the view state and a mount of a video keep
   * it.
   */
  scrollStep?: { value: number; unit: SpeedUnit };
}

export interface VideoProperties {
  playbackRate?: number;
  loop?: boolean;
  muted?: boolean;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  voiRange?: VOIRange;
  invert?: boolean;
  averageWhite?: [number, number, number];
}

export type VideoDataPresentation = VideoPresentationProps & VideoProperties;

export interface VideoViewportInput {
  id: string;
  element: HTMLDivElement;
  renderingEngineId: string;
  dataProvider?: DataProvider;
  renderPathResolver?: RenderPathResolver;
  /** The canvas of the viewport element. Made in the element when absent. */
  canvas?: HTMLCanvasElement;
  /** The options of the viewport. The canvas is filled with `background`. */
  defaultOptions?: ViewportInputOptions;
}

/** @deprecated Use `VideoViewportInput`: the same type. */
export type VideoGenericViewportInput = VideoViewportInput;

/** @internal */
export interface VideoElementRenderContext extends BaseViewportRenderContext {
  type: 'video';
  element: HTMLDivElement;
  /**
   * The canvas of the viewport. The video element is put just above it, so
   * that the canvas background shows around the video and the layers of the
   * tools draw over the video.
   */
  canvas?: HTMLCanvasElement;
}

/** @internal */
export type VideoElementRendering = MountedRendering<{
  renderMode: 'video2d';
  element: HTMLVideoElement;
  currentCamera?: VideoViewState;
}>;
