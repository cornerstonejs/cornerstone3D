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
 * presentation compatibility.
 *
 * @experimental Advanced helper namespace; prefer `viewportProjection` for
 * stable application-level presentation reads and writes.
 */
export const wsiProjection = {
  adapter: wsiProjectionAdapter,
  getSnapshot: getWSIProjectionSnapshot,
};
export type {
  WSIProjectionPresentation,
  WSIProjectionRequest,
  WSIProjectionSnapshot,
} from './wsiProjectionAdapter';
export { default } from './WSIViewport';
export type {
  WSICamera,
  WSIDataPresentation,
  WSIDataSetOptions,
  WSIPresentationProps,
  WSIProperties,
  WSIViewState,
  WSIViewportInput,
  WSIGenericViewportInput,
} from './WSIViewportTypes';
