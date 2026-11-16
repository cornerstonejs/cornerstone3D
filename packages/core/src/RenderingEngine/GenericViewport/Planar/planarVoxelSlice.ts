import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { vec3 } from 'gl-matrix';
import type { IImageVolume, Point3 } from '../../../types';

type VolumeGeometry = Pick<
  IImageVolume,
  'direction' | 'dimensions' | 'spacing'
>;

/**
 * The two volume axes in the plane normal to `axis`, in the order of the
 * values of `voxelManager.getSliceData({ slicePlane: axis })`.
 */
function inPlaneAxes(axis: number): [number, number] {
  return axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
}

function axisVector(direction: VolumeGeometry['direction'], axis: number) {
  return [
    direction[axis * 3],
    direction[axis * 3 + 1],
    direction[axis * 3 + 2],
  ] as Point3;
}

/**
 * The volume axis (0, 1 or 2) that a unit view plane normal follows, or
 * `undefined` for an oblique plane.
 *
 * The rule is the rule of `isAcquisitionPlaneNormal`, for each axis: the tilt
 * of the plane moves it by less than half a voxel along the axis across the
 * extent of the volume in the plane. A plane that follows an axis then crosses
 * one voxel slice of that axis everywhere in the volume.
 */
export function alignedVolumeAxis(
  volume: VolumeGeometry,
  viewPlaneNormal: Point3
): number | undefined {
  const { direction, dimensions, spacing } = volume;

  for (let axis = 0; axis < 3; axis++) {
    const cos = Math.abs(
      vec3.dot(
        axisVector(direction, axis) as unknown as vec3,
        viewPlaneNormal as unknown as vec3
      )
    );
    const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
    const [a, b] = inPlaneAxes(axis);
    const halfDiagonal =
      Math.hypot(dimensions[a] * spacing[a], dimensions[b] * spacing[b]) / 2;

    if (sin * halfDiagonal < spacing[axis] / 2) {
      return axis;
    }
  }
}

/**
 * The full-resolution voxel slice `sliceIndex` of `axis` as a 2D image, in
 * world coordinates, for a `vtkImageMapper`. The values are those of the voxel
 * manager, so the image is exact: no texture reduction and no resampling.
 *
 * `target` is the image of the previous call. When it has the same size and
 * type, the call writes into it, so the mapper keeps its texture.
 *
 * @returns the image, or `undefined` for a volume of more than one component
 */
export function voxelSliceImageData(
  volume: IImageVolume,
  axis: number,
  sliceIndex: number,
  target?: vtkImageData
): vtkImageData | undefined {
  const { voxelManager, dimensions, spacing, direction, imageData } = volume;

  if (!voxelManager || voxelManager.numberOfComponents > 1) {
    return;
  }

  const [a, b] = inPlaneAxes(axis);
  const values = voxelManager.getSliceData({ sliceIndex, slicePlane: axis });

  if (values.length !== dimensions[a] * dimensions[b]) {
    return;
  }

  const scalars = target?.getPointData().getScalars();
  const [width, height] = target?.getDimensions() ?? [];
  const reuse =
    scalars &&
    width === dimensions[a] &&
    height === dimensions[b] &&
    scalars.getDataType() === values.constructor.name;
  const slice = reuse ? target : vtkImageData.newInstance();

  if (reuse) {
    scalars.setData(values, 1);
  } else {
    slice.setDimensions(dimensions[a], dimensions[b], 1);
    slice.getPointData().setScalars(
      vtkDataArray.newInstance({
        name: 'Pixels',
        numberOfComponents: 1,
        values,
      })
    );
  }

  const row = axisVector(direction, a);
  const column = axisVector(direction, b);
  const normal = vec3.cross(
    vec3.create(),
    row as unknown as vec3,
    column as unknown as vec3
  );
  const originIndex: Point3 = [0, 0, 0];

  originIndex[axis] = sliceIndex;
  slice.setSpacing([spacing[a], spacing[b], 1]);
  slice.setDirection([...row, ...column, normal[0], normal[1], normal[2]]);
  slice.setOrigin(imageData.indexToWorld(originIndex) as Point3);
  slice.modified();

  return slice;
}
