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
 */
export const volume3DProjection = {
  adapter: volume3DProjectionAdapter,
  getSnapshot: getVolume3DProjectionSnapshot,
};
export type {
  Volume3DProjectionPresentation,
  Volume3DProjectionRequest,
  Volume3DProjectionSnapshot,
} from './volume3DProjectionAdapter';
export { default } from './viewport3D';
export type {
  Volume3DCamera,
  Volume3DDataPresentation,
  Volume3DPresentationProps,
  Volume3DProperties,
  Volume3DRequestedRenderMode,
  Volume3DSetDataOptions,
  VolumeViewport3DV2Input,
} from './viewport3DTypes';
