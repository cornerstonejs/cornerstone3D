import { vec3 } from 'gl-matrix';
import cache from '../cache/cache';
import { MetadataModules } from '../enums';
import * as metaData from '../metaData';
import type { ICamera, IGenericViewport, IViewport, Point3 } from '../types';
import {
  getSliceClippingPlanePair,
  getVolumeSlicesClippingPlanes,
  type SliceClippingPlanes,
} from './getVolumeSlicesClippingPlanes';
import { getViewportContentMode } from './viewportCapabilities';

/** The members that give the slices of a viewport, where it has them. */
type SliceViewport = {
  getImageIds?: () => string[];
  getVolumeId?: () => string | undefined;
  getResolvedView?: () => { toICamera(): ICamera } | undefined;
};

/**
 * The pair of clipping planes around each image of a stack, with the index
 * of the image. The planes lie around the plane of the image, by its
 * position and its row and column directions in the image plane metadata. An
 * image without them lies at the world origin along the patient axes, as the
 * stack viewport shows it. The first normal is the view plane normal of the
 * image, which looks against the cross product of its rows and columns.
 */
function getStackSlicesClippingPlanes(
  imageIds: string[]
): SliceClippingPlanes[] {
  return imageIds.map((imageId, sliceIndex) => {
    const {
      imagePositionPatient = [0, 0, 0],
      rowCosines = [1, 0, 0],
      columnCosines = [0, 1, 0],
    } = metaData.get(MetadataModules.IMAGE_PLANE, imageId) ?? {};
    const viewPlaneNormal = vec3.cross(
      vec3.create(),
      columnCosines as Point3,
      rowCosines as Point3
    ) as Point3;

    return {
      sliceIndex,
      planes: getSliceClippingPlanePair(
        imagePositionPatient as Point3,
        viewPlaneNormal
      ),
    };
  });
}

/**
 * The pair of clipping planes around each slice of a viewport, with the
 * index of the slice. A surface cut by one pair is the contour of that
 * slice. It answers for a viewport that shows a volume and for one that
 * shows a stack.
 *
 * - A viewport that shows a volume gives one entry for each slice along its
 *   view, from the volume and the camera of its resolved view. The index
 *   counts along the view direction, as `getCurrentImageIdIndex` does.
 * - A viewport that shows a stack gives one entry for each image, with the
 *   index of the image in the stack.
 * - A viewport with nothing mounted, or with other content, gives an empty
 *   list.
 *
 * The two planes of an entry lie 0.05 mm
 * (`RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS`) behind and in front of the
 * slice. The normal of the first is the view plane normal, the normal of the
 * second is its opposite.
 *
 * @param viewport - The viewport
 * @returns The planes of each slice, with the index of the slice
 */
function getSlicesClippingPlanes(
  viewport: IViewport | IGenericViewport
): SliceClippingPlanes[] {
  const sliceViewport = viewport as SliceViewport;

  const contentMode = getViewportContentMode(viewport);

  if (contentMode === 'stack') {
    return getStackSlicesClippingPlanes(sliceViewport.getImageIds?.() ?? []);
  }

  if (contentMode !== 'volume') {
    return [];
  }

  const volumeId = sliceViewport.getVolumeId?.();
  const volume = volumeId ? cache.getVolume(volumeId) : undefined;
  const camera = sliceViewport.getResolvedView?.()?.toICamera();

  if (!volume || !camera?.viewPlaneNormal) {
    return [];
  }

  return getVolumeSlicesClippingPlanes(volume, {
    focalPoint: camera.focalPoint,
    position: camera.position,
    viewPlaneNormal: camera.viewPlaneNormal,
  });
}

export { getSlicesClippingPlanes as default, getSlicesClippingPlanes };
