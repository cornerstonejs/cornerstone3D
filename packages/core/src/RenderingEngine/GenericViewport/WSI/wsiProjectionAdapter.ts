import { ViewportType } from '../../../enums';
import type { ViewPresentation } from '../../../types';
import type {
  ProjectionWriteOptions,
  ViewportProjectionAdapter,
} from '../ViewportProjectionTypes';
import {
  getWSIProjectionPresentation,
  withWSIProjectionPresentation,
} from './wsiProjectionPresentation';
import { getWSIProjectionSnapshot } from './wsiProjectionSnapshot';
import {
  WSI_PROJECTION_ID,
  type WSIProjectionRequest,
  type WSIProjectionSnapshot,
} from './WSIProjectionTypes';
import type { WSIViewState } from './WSIViewportTypes';

export { getWSIProjectionSnapshot };
export type {
  WSIProjectionPresentation,
  WSIProjectionRequest,
  WSIProjectionSnapshot,
} from './WSIProjectionTypes';

/**
 * WSI projection adapter.
 *
 * WSI exposes slide/world coordinates and keeps zoom/rotation presentation
 * round trips in the projection service rather than on the viewport instance.
 */
export const wsiProjectionAdapter: ViewportProjectionAdapter<
  WSIViewState,
  ViewPresentation,
  WSIProjectionSnapshot
> = {
  id: WSI_PROJECTION_ID,
  viewportTypes: [ViewportType.WHOLE_SLIDE_NEXT],
  getSnapshot: (request) =>
    getWSIProjectionSnapshot(request as WSIProjectionRequest),
  getPresentation: (snapshot, selector) =>
    getWSIProjectionPresentation(snapshot, selector),
  withPresentation: (
    snapshot,
    presentation,
    options?: ProjectionWriteOptions
  ) => withWSIProjectionPresentation(snapshot, presentation, options),
};
