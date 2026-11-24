import {
  getVolume3DProjectionSnapshot,
  volume3DProjectionAdapter,
} from './volume3DProjectionAdapter';

export { DefaultVolume3DDataProvider } from './DefaultVolume3DDataProvider';
export {
  createDefaultVolume3DRenderPaths,
  createVolume3DRenderPathResolver,
} from './Volume3DRenderPathResolver';
/**
 * Lower-level 3D projection helpers for custom synchronizers and tooling.
 * This namespace is less stable than the core viewport API while the generic
 * projection service settles.
 *
 * @experimental Advanced helper namespace; prefer `viewportProjection` for
 * stable application-level framing reads and writes.
 */
export const volume3DProjection = {
  adapter: volume3DProjectionAdapter,
  getSnapshot: getVolume3DProjectionSnapshot,
};
export type {
  Volume3DProjectionFraming,
  Volume3DProjectionRequest,
  Volume3DProjectionSnapshot,
} from './volume3DProjectionAdapter';
export { default } from './viewport3D';
export type {
  Volume3DCamera,
  Volume3DDisplaySetAppearance,
  Volume3DAppearanceProps,
  Volume3DProperties,
  Volume3DSetDataOptions,
  VolumeViewport3DInput,
} from './viewport3DTypes';
