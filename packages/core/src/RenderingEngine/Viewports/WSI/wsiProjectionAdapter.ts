import { ViewportType } from '../../../enums';
import type { ViewFraming } from '../../../types';
import type {
  ProjectionWriteOptions,
  ViewportProjectionAdapter,
} from '../ViewportProjectionTypes';
import {
  getWSIProjectionFraming,
  withWSIProjectionFraming,
} from './wsiProjectionFraming';
import { getWSIProjectionSnapshot } from './wsiProjectionSnapshot';
import {
  WSI_PROJECTION_ID,
  type WSIProjectionRequest,
  type WSIProjectionSnapshot,
} from './WSIProjectionTypes';
import type { WSIViewState } from './WSIViewportTypes';

export { getWSIProjectionSnapshot };
export type {
  WSIProjectionFraming,
  WSIProjectionRequest,
  WSIProjectionSnapshot,
} from './WSIProjectionTypes';

/**
 * WSI projection adapter.
 *
 * WSI exposes slide/world coordinates and keeps zoom/rotation framing
 * round trips in the projection service rather than on the viewport instance.
 */
export const wsiProjectionAdapter: ViewportProjectionAdapter<
  WSIViewState,
  ViewFraming,
  WSIProjectionSnapshot
> = {
  id: WSI_PROJECTION_ID,
  viewportTypes: [ViewportType.WHOLE_SLIDE],
  getSnapshot: (request) =>
    getWSIProjectionSnapshot(request as WSIProjectionRequest),
  getFraming: (snapshot, selector) =>
    getWSIProjectionFraming(snapshot, selector),
  withFraming: (snapshot, framing, options?: ProjectionWriteOptions) =>
    withWSIProjectionFraming(snapshot, framing, options),
};
