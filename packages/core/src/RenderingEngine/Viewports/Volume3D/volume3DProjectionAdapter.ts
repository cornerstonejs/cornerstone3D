import { ViewportType } from '../../../enums';
import type {
  ProjectionWriteOptions,
  ViewportProjectionAdapter,
} from '../ViewportProjectionTypes';
import applyVolume3DCamera from './applyVolume3DCamera';
import {
  getVolume3DProjectionFraming,
  withVolume3DProjectionFraming,
} from './volume3DProjectionFraming';
import { getVolume3DProjectionSnapshot } from './volume3DProjectionSnapshot';
import {
  VOLUME3D_PROJECTION_ID,
  type Volume3DProjectionFraming,
  type Volume3DProjectionRequest,
  type Volume3DProjectionSnapshot,
  type Volume3DRenderTarget,
} from './Volume3DProjectionTypes';
import type { Volume3DCamera } from './viewport3DTypes';

export { getVolume3DProjectionSnapshot };
export type {
  Volume3DProjectionFraming,
  Volume3DProjectionRequest,
  Volume3DProjectionSnapshot,
} from './Volume3DProjectionTypes';

/**
 * Identifies Volume3D render contexts as valid renderer-application targets.
 */
function isVolume3DRenderTarget(
  target: unknown
): target is Volume3DRenderTarget {
  return Boolean(
    target &&
      typeof target === 'object' &&
      'vtk' in target &&
      (target as Volume3DRenderTarget).vtk?.renderer
  );
}

/**
 * Volume3D projection adapter.
 *
 * 3D remains runtime-camera-backed, but the adapter exposes the same projection
 * snapshot seam as Planar so synchronizers can query capabilities generically.
 */
export const volume3DProjectionAdapter: ViewportProjectionAdapter<
  Volume3DCamera,
  Volume3DProjectionFraming,
  Volume3DProjectionSnapshot
> = {
  id: VOLUME3D_PROJECTION_ID,
  viewportTypes: [ViewportType.VOLUME_3D],
  getSnapshot: (request) =>
    getVolume3DProjectionSnapshot(request as Volume3DProjectionRequest),
  getFraming: (snapshot) => getVolume3DProjectionFraming(snapshot),
  withFraming: (
    snapshot,
    framing: Partial<Volume3DProjectionFraming>,
    options?: ProjectionWriteOptions
  ) => withVolume3DProjectionFraming(snapshot, framing, options),
  applyToRenderer: (snapshot, target) => {
    if (!isVolume3DRenderTarget(target)) {
      return;
    }

    applyVolume3DCamera(target, snapshot.rendererCamera as Volume3DCamera);
  },
};
