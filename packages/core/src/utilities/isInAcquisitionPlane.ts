import cache from '../cache/cache';
import type { IGenericViewport, IViewport } from '../types';
import { isAcquisitionPlaneNormal } from './isAcquisitionPlaneNormal';
import { getViewportContentMode } from './viewportCapabilities';

/** The members that answer for the acquisition plane, where a viewport has them. */
type AcquisitionPlaneViewport = {
  isInAcquisitionPlane?: () => boolean;
  getVolumeId?: () => string | undefined;
};

/**
 * Whether a viewport shows its data in the plane it was acquired in.
 *
 * - A viewport with its own `isInAcquisitionPlane` (a legacy viewport, a
 *   legacy adapter) answers itself.
 * - A viewport that shows a stack, a video or a whole slide image shows one
 *   image plane: true.
 * - A viewport that shows a volume: true when its view plane normal shows
 *   the acquisition plane of the volume, by `isAcquisitionPlaneNormal`, the
 *   rule the planar viewport draws the acquired frames by.
 * - A viewport with nothing mounted, or with other content: false.
 *
 * @param viewport - The viewport
 * @returns Whether the view is in the acquisition plane
 */
function isInAcquisitionPlane(viewport: IViewport | IGenericViewport): boolean {
  const planeViewport = viewport as AcquisitionPlaneViewport;

  if (typeof planeViewport.isInAcquisitionPlane === 'function') {
    return planeViewport.isInAcquisitionPlane();
  }

  const contentMode = getViewportContentMode(viewport);

  if (contentMode !== 'volume') {
    return (
      contentMode === 'stack' ||
      contentMode === 'video' ||
      contentMode === 'wholeSlide'
    );
  }

  const volumeId = planeViewport.getVolumeId?.();
  const volume = volumeId ? cache.getVolume(volumeId) : undefined;
  const viewPlaneNormal = viewport.getViewReference?.()?.viewPlaneNormal;

  return Boolean(
    volume &&
      viewPlaneNormal &&
      isAcquisitionPlaneNormal(volume, viewPlaneNormal)
  );
}

export { isInAcquisitionPlane as default, isInAcquisitionPlane };
