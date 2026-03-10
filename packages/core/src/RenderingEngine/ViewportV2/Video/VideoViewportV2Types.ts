import type {
  BasePresentationProps,
  DataProvider,
  MountedRendering,
  RenderPathResolver,
  ViewportBackendContext,
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

export interface VideoPresentationProps extends BasePresentationProps {
  playbackRate?: number;
  loop?: boolean;
  muted?: boolean;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
}

export interface VideoViewState {
  zoom?: number;
  pan?: [number, number];
  rotation?: number;
  currentTimeSeconds?: number;
}

export interface VideoViewportV2Input {
  id: string;
  element: HTMLDivElement;
  dataProvider?: DataProvider;
  renderPathResolver?: RenderPathResolver;
}

export interface VideoElementBackendContext extends ViewportBackendContext {
  viewportKind: 'video';
  element: HTMLDivElement;
}

export interface VideoElementRendering
  extends MountedRendering<{
    element: HTMLVideoElement;
    payload: VideoStreamPayload;
  }> {
  role: 'video';
  renderMode: 'video2d';
}
