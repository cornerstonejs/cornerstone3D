import type {
  BaseViewportRenderContext,
  BasePresentationProps,
  DataProvider,
  MountedRendering,
  RenderPathResolver,
} from '../ViewportArchitectureTypes';
import type { VideoImageMetadata } from '../../../utilities/VideoUtilities';

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

export interface VideoCamera {
  zoom?: number;
  pan?: [number, number];
  rotation?: number;
  currentTimeSeconds?: number;
}

export interface VideoProperties {
  playbackRate?: number;
  loop?: boolean;
  muted?: boolean;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
}

/** @deprecated Use VideoCamera instead */
export type VideoViewState = VideoCamera;

/** @deprecated Use VideoProperties instead */
export type VideoViewportPresentation = VideoProperties;

export interface VideoViewportV2Input {
  id: string;
  element: HTMLDivElement;
  renderingEngineId: string;
  dataProvider?: DataProvider;
  renderPathResolver?: RenderPathResolver;
}

export interface VideoElementRenderContext extends BaseViewportRenderContext {
  type: 'video';
  element: HTMLDivElement;
}

export interface VideoElementRendering
  extends MountedRendering<{
    element: HTMLVideoElement;
    payload: VideoStreamPayload;
    currentCamera?: VideoCamera;
  }> {
  renderMode: 'video2d';
}
