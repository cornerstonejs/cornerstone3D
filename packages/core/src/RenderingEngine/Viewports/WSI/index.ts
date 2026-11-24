import {
  getWSIProjectionSnapshot,
  wsiProjectionAdapter,
} from './wsiProjectionAdapter';

export { DefaultWSIDataProvider } from './DefaultWSIDataProvider';
export {
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
} from './WSIRenderPathResolver';
/**
 * Lower-level WSI projection helpers for custom synchronizers and tooling.
 * WSI projection exposes slide/world coordinates with zoom and rotation
 * framing compatibility.
 *
 * @experimental Advanced helper namespace; prefer `viewportProjection` for
 * stable application-level framing reads and writes.
 */
export const wsiProjection = {
  adapter: wsiProjectionAdapter,
  getSnapshot: getWSIProjectionSnapshot,
};
export type {
  WSIProjectionFraming,
  WSIProjectionRequest,
  WSIProjectionSnapshot,
} from './wsiProjectionAdapter';
export { default } from './WSIViewport';
export type {
  WSICamera,
  WSIDisplaySetAppearance,
  WSIDataSetOptions,
  WSIAppearanceProps,
  WSIProperties,
  WSIViewState,
  WSIViewportInput,
} from './WSIViewportTypes';
