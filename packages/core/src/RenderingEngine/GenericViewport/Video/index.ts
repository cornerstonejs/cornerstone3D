import {
  getVideoProjectionSnapshot,
  videoProjectionAdapter,
} from './videoProjectionAdapter';

export { DefaultVideoDataProvider } from './DefaultVideoDataProvider';
export {
  createDefaultVideoRenderPaths,
  createVideoRenderPathResolver,
} from './VideoRenderPathResolver';
/**
 * Lower-level Video projection helpers for custom synchronizers and tooling.
 * Video projection exposes intrinsic media-pixel space rather than DICOM
 * patient space.
 *
 * @experimental Advanced helper namespace; prefer `viewportProjection` for
 * stable application-level presentation reads and writes.
 */
export const videoProjection = {
  adapter: videoProjectionAdapter,
  getSnapshot: getVideoProjectionSnapshot,
};
export type {
  VideoProjectionPresentation,
  VideoProjectionRequest,
  VideoProjectionSnapshot,
} from './videoProjectionAdapter';
export { default } from './VideoViewport';
export type {
  VideoViewState,
  VideoDataPresentation,
  VideoPresentationProps,
  VideoProperties,
  VideoViewportInput,
  VideoGenericViewportInput,
} from './VideoViewportTypes';
