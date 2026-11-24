import { ViewportType } from '../../../enums';
import type { ViewFraming } from '../../../types';
import type {
  ProjectionWriteOptions,
  ViewportProjectionAdapter,
} from '../ViewportProjectionTypes';
import {
  getVideoProjectionFraming,
  withVideoProjectionFraming,
} from './videoProjectionFraming';
import { getVideoProjectionSnapshot } from './videoProjectionSnapshot';
import {
  VIDEO_PROJECTION_ID,
  type VideoProjectionRequest,
  type VideoProjectionSnapshot,
} from './VideoProjectionTypes';
import type { VideoViewState } from './VideoViewportTypes';

export { getVideoProjectionSnapshot };
export type {
  VideoProjectionFraming,
  VideoProjectionRequest,
  VideoProjectionSnapshot,
} from './VideoProjectionTypes';

/**
 * Video projection adapter.
 *
 * Video exposes media-pixel space rather than DICOM patient space, while still
 * supporting portable pan/zoom/rotation framing for tools.
 */
export const videoProjectionAdapter: ViewportProjectionAdapter<
  VideoViewState,
  ViewFraming,
  VideoProjectionSnapshot
> = {
  id: VIDEO_PROJECTION_ID,
  viewportTypes: [ViewportType.VIDEO],
  getSnapshot: (request) =>
    getVideoProjectionSnapshot(request as VideoProjectionRequest),
  getFraming: (snapshot, selector) =>
    getVideoProjectionFraming(snapshot, selector),
  withFraming: (snapshot, framing, options?: ProjectionWriteOptions) =>
    withVideoProjectionFraming(snapshot, framing, options),
};
