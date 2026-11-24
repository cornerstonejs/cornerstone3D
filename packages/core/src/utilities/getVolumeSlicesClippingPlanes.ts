import { vec3 } from 'gl-matrix';
import { RENDERING_DEFAULTS } from '../constants';
import type { IImageVolume, Point3 } from '../types';
import { getPlanarVolumeSliceRange } from '../RenderingEngine/Viewports/Planar/planarSliceBasis';
import {
  getPlanarVolumeSliceNavigationState,
  getPlanarVolumeSlicePoint,
} from '../RenderingEngine/helpers/planarVolumeRendering';

/** The camera fields that place the slices of a volume along a view. */
type SliceCamera = {
  focalPoint: Point3;
  position: Point3;
  viewPlaneNormal: Point3;
};

/**
 * The point of each slice of a volume along the view normal of a camera,
 * with the index of the slice.
 */
function getVolumeSlicePoints(
  imageVolume: IImageVolume,
  camera: SliceCamera
): { sliceIndex: number; point: Point3 }[] {
  const { focalPoint, viewPlaneNormal } = camera;
  const { currentSliceIndex, sliceRange, spacingInNormalDirection } =
    getPlanarVolumeSliceNavigationState({
      camera,
      imageVolume,
      sliceRange: getPlanarVolumeSliceRange(
        imageVolume,
        viewPlaneNormal,
        focalPoint
      ),
    });
  const numSlicesBackward = Math.round(
    (sliceRange.current - sliceRange.min) / spacingInNormalDirection
  );
  const numSlicesForward = Math.round(
    (sliceRange.max - sliceRange.current) / spacingInNormalDirection
  );
  const slicePoints: { sliceIndex: number; point: Point3 }[] = [];

  for (let delta = -numSlicesBackward; delta <= numSlicesForward; delta++) {
    const { newFocalPoint } = getPlanarVolumeSlicePoint({
      camera,
      delta,
      sliceRange,
      spacingInNormalDirection,
    });

    slicePoints.push({
      sliceIndex: currentSliceIndex + delta,
      point: newFocalPoint,
    });
  }

  return slicePoints;
}

/** The pair of clipping planes around one slice, with the index of the slice. */
type SliceClippingPlanes = {
  sliceIndex: number;
  planes: { normal: Point3; origin: Point3 }[];
};

/**
 * The pair of clipping planes around the slice through a point: one plane
 * behind the point with the view plane normal, one in front of it with the
 * opposite normal, each `RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS` from the
 * point, as the legacy volume viewport places them.
 */
function getSliceClippingPlanePair(
  point: Point3,
  viewPlaneNormal: Point3
): SliceClippingPlanes['planes'] {
  const offset = vec3.scale(
    vec3.create(),
    viewPlaneNormal,
    RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS
  );

  return [
    {
      normal: [...viewPlaneNormal] as Point3,
      origin: vec3.sub(vec3.create(), point, offset) as Point3,
    },
    {
      normal: vec3.negate(vec3.create(), viewPlaneNormal) as Point3,
      origin: vec3.add(vec3.create(), point, offset) as Point3,
    },
  ];
}

/**
 * The pair of clipping planes around each slice of a volume along the view
 * normal of a camera, as the legacy volume viewport gives them in
 * `getSlicesClippingPlanes`. A surface cut by one pair is the contour of that
 * slice.
 *
 * @param imageVolume - The volume
 * @param camera - The focal point, the position and the view plane normal
 * @returns The planes of each slice, with the index of the slice
 */
function getVolumeSlicesClippingPlanes(
  imageVolume: IImageVolume,
  camera: SliceCamera
): SliceClippingPlanes[] {
  return getVolumeSlicePoints(imageVolume, camera).map(
    ({ sliceIndex, point }) => ({
      sliceIndex,
      planes: getSliceClippingPlanePair(point, camera.viewPlaneNormal),
    })
  );
}

export { getSliceClippingPlanePair, getVolumeSlicesClippingPlanes };
export type { SliceClippingPlanes };
