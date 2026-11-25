import { ViewportType } from '../../../enums';
import type { ViewPresentation } from '../../../types';
import type {
  ProjectionWriteOptions,
  ViewportProjectionAdapter,
} from '../ViewportProjectionTypes';
import {
  getECGProjectionPresentation,
  withECGProjectionPresentation,
} from './ecgProjectionPresentation';
import { getECGProjectionSnapshot } from './ecgProjectionSnapshot';
import {
  ECG_PROJECTION_ID,
  type ECGProjectionRequest,
  type ECGProjectionSnapshot,
} from './ECGProjectionTypes';
import type { ECGViewState } from './ECGViewportTypes';

export { getECGProjectionSnapshot };
export type {
  ECGProjectionPresentation,
  ECGProjectionRequest,
  ECGProjectionSnapshot,
} from './ECGProjectionTypes';

/**
 * ECG projection adapter.
 *
 * ECG exposes signal space, where world coordinates mean sample index,
 * amplitude value, and channel index. The adapter keeps that signal model
 * explicit while still offering generic pan/zoom presentation compatibility.
 */
export const ecgProjectionAdapter: ViewportProjectionAdapter<
  ECGViewState,
  ViewPresentation,
  ECGProjectionSnapshot
> = {
  id: ECG_PROJECTION_ID,
  viewportTypes: [ViewportType.ECG_NEXT],
  getSnapshot: (request) =>
    getECGProjectionSnapshot(request as ECGProjectionRequest),
  getPresentation: (snapshot, selector) =>
    getECGProjectionPresentation(snapshot, selector),
  withPresentation: (
    snapshot,
    presentation,
    options?: ProjectionWriteOptions
  ) => withECGProjectionPresentation(snapshot, presentation, options),
};
