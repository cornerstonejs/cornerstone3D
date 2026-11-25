import { ViewportType } from '../../../enums';
import type { ViewPresentation } from '../../../types';
import type {
  ProjectionWriteOptions,
  ViewportProjectionAdapter,
} from '../ViewportProjectionTypes';
import {
  getVideoProjectionPresentation,
  withVideoProjectionPresentation,
} from './videoProjectionPresentation';
import { getVideoProjectionSnapshot } from './videoProjectionSnapshot';
import {
  VIDEO_PROJECTION_ID,
  type VideoProjectionRequest,
  type VideoProjectionSnapshot,
} from './VideoProjectionTypes';
import type { VideoViewState } from './VideoViewportTypes';

export { getVideoProjectionSnapshot };
export type {
  VideoProjectionPresentation,
  VideoProjectionRequest,
  VideoProjectionSnapshot,
} from './VideoProjectionTypes';

/**
 * Video projection adapter.
 *
 * Video exposes media-pixel space rather than DICOM patient space, while still
 * supporting portable pan/zoom/rotation presentation for tools.
 */
export const videoProjectionAdapter: ViewportProjectionAdapter<
  VideoViewState,
  ViewPresentation,
  VideoProjectionSnapshot
> = {
  id: VIDEO_PROJECTION_ID,
  viewportTypes: [ViewportType.VIDEO_NEXT],
  getSnapshot: (request) =>
    getVideoProjectionSnapshot(request as VideoProjectionRequest),
  getPresentation: (snapshot, selector) =>
    getVideoProjectionPresentation(snapshot, selector),
  withPresentation: (
    snapshot,
    presentation,
    options?: ProjectionWriteOptions
  ) => withVideoProjectionPresentation(snapshot, presentation, options),
};
