import type { IViewport } from '../types';
import { getViewportContentMode } from './viewportCapabilities';

/** The member that answers for the acquisition plane, where a viewport has it. */
type AcquisitionPlaneViewport = {
  isInAcquisitionPlane?: () => boolean;
};

/**
 * Whether a viewport shows its data in the plane it was acquired in.
 *
 * - A planar viewport answers with `PlanarViewport.isInAcquisitionPlane()`:
 *   true for a stack, and for a volume when its view plane normal shows the
 *   acquisition plane of the source volume.
 * - A viewport that shows a video or a whole slide image shows one image
 *   plane: true.
 * - A 3D viewport has no plane of its own, an ECG viewport shows no image,
 *   and a viewport with nothing mounted shows nothing: false.
 *
 * @param viewport - The viewport
 * @returns Whether the view is in the acquisition plane
 */
function isInAcquisitionPlane(viewport: IViewport): boolean {
  const planeViewport = viewport as AcquisitionPlaneViewport;

  if (typeof planeViewport.isInAcquisitionPlane === 'function') {
    return planeViewport.isInAcquisitionPlane();
  }

  const contentMode = getViewportContentMode(viewport);

  return contentMode === 'video' || contentMode === 'wholeSlide';
}

export { isInAcquisitionPlane as default, isInAcquisitionPlane };
