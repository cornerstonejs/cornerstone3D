import { ViewportType } from '../../../enums';
import type { ViewFraming } from '../../../types';
import type {
  ProjectionWriteOptions,
  ViewportProjectionAdapter,
} from '../ViewportProjectionTypes';
import {
  getECGProjectionFraming,
  withECGProjectionFraming,
} from './ecgProjectionFraming';
import { getECGProjectionSnapshot } from './ecgProjectionSnapshot';
import {
  ECG_PROJECTION_ID,
  type ECGProjectionRequest,
  type ECGProjectionSnapshot,
} from './ECGProjectionTypes';
import type { ECGViewState } from './ECGViewportTypes';

export { getECGProjectionSnapshot };
export type {
  ECGProjectionFraming,
  ECGProjectionRequest,
  ECGProjectionSnapshot,
} from './ECGProjectionTypes';

/**
 * ECG projection adapter.
 *
 * ECG exposes signal space, where world coordinates mean sample index,
 * amplitude value, and channel index. The adapter keeps that signal model
 * explicit while still offering generic pan/zoom framing compatibility.
 */
export const ecgProjectionAdapter: ViewportProjectionAdapter<
  ECGViewState,
  ViewFraming,
  ECGProjectionSnapshot
> = {
  id: ECG_PROJECTION_ID,
  viewportTypes: [ViewportType.ECG],
  getSnapshot: (request) =>
    getECGProjectionSnapshot(request as ECGProjectionRequest),
  getFraming: (snapshot, selector) =>
    getECGProjectionFraming(snapshot, selector),
  withFraming: (snapshot, framing, options?: ProjectionWriteOptions) =>
    withECGProjectionFraming(snapshot, framing, options),
};
