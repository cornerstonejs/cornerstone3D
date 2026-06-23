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
}

export type VideoGenericViewportInput = VideoViewportInput;

/** @internal */
export interface VideoElementRenderContext extends BaseViewportRenderContext {
  type: 'video';
  element: HTMLDivElement;
}

/** @internal */
export type VideoElementRendering = MountedRendering<{
  renderMode: 'video2d';
  element: HTMLVideoElement;
  currentCamera?: VideoViewState;
}>;
