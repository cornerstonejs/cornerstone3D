import {
  ecgProjectionAdapter,
  getECGProjectionSnapshot,
} from './ecgProjectionAdapter';

export {
  createDefaultECGRenderPaths,
  createECGRenderPathResolver,
} from './ECGRenderPathResolver';
export { DefaultECGDataProvider } from './DefaultECGDataProvider';
/**
 * Lower-level ECG projection helpers for custom synchronizers and tooling.
 * ECG projection exposes signal space as sample index, amplitude value, and
 * channel index.
 *
 * @experimental Advanced helper namespace; prefer `viewportProjection` for
 * stable application-level presentation reads and writes.
 */
export const ecgProjection = {
  adapter: ecgProjectionAdapter,
  getSnapshot: getECGProjectionSnapshot,
};
export type {
  ECGProjectionPresentation,
  ECGProjectionRequest,
  ECGProjectionSnapshot,
} from './ecgProjectionAdapter';
export { default } from './ECGViewport';
export type {
  ECGViewState,
  ECGDataPresentation,
  ECGChannelData,
  ECGPresentationProps,
  ECGProperties,
  ECGViewportInput,
  ECGGenericViewportInput,
} from './ECGViewportTypes';
