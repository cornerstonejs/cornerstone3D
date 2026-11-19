import { mat4, vec3 } from 'gl-matrix';
import { EPSILON } from '../constants';
import type { Point2, Point3 } from '../types';
import type PlanarViewport from '../RenderingEngine/GenericViewport/Planar/PlanarViewport';
import { transformCanvasToIJK } from './transformCanvasToIJK';
import { transformIJKToCanvas } from './transformIJKToCanvas';

/**
 * The slice view info of a planar viewport: the size of the slice, its index
 * along the slice plane, the axis of the slice plane in index space, and the
 * matrices between slice pixels and index space.
 */
export type SliceViewInfo = {
  width: number;
  height: number;
  sliceIndex: number;
  slicePlane: number;
  sliceToIndexMatrix: mat4;
  indexToSliceMatrix: mat4;
};

/**
 * The size and the matrices of the slice that a viewport shows, from its
 * public transforms and its image data, for a volume and for a stack image.
 * The row, column and slice directions in index space come from three canvas
 * points. The top left of the slice is the corner of the box around the
 * corners of the image data on the canvas.
 */
export function getSliceViewGeometry(
  viewport: PlanarViewport
): Pick<
  SliceViewInfo,
  'width' | 'height' | 'sliceToIndexMatrix' | 'indexToSliceMatrix'
> {
  const { width: canvasWidth, height: canvasHeight } = viewport.getCanvas();
  const ijkOriginPoint = transformCanvasToIJK(viewport, [0, 0]);
  const ijkRowPoint = transformCanvasToIJK(viewport, [canvasWidth - 1, 0]);
  const ijkColPoint = transformCanvasToIJK(viewport, [0, canvasHeight - 1]);
  const ijkRowVec = vec3.sub(vec3.create(), ijkRowPoint, ijkOriginPoint);
  const ijkColVec = vec3.sub(vec3.create(), ijkColPoint, ijkOriginPoint);
  const ijkSliceVec = vec3.cross(vec3.create(), ijkRowVec, ijkColVec);

  vec3.normalize(ijkRowVec, ijkRowVec);
  vec3.normalize(ijkColVec, ijkColVec);
  vec3.normalize(ijkSliceVec, ijkSliceVec);

  const [sx, sy, sz] = viewport.getImageData().dimensions;
  const canvasCorners: Point2[] = [];

  for (const k of [0, sz - 1]) {
    for (const j of [0, sy - 1]) {
      for (const i of [0, sx - 1]) {
        canvasCorners.push(transformIJKToCanvas(viewport, [i, j, k]));
      }
    }
  }

  const minX = Math.min(...canvasCorners.map((point) => point[0]));
  const minY = Math.min(...canvasCorners.map((point) => point[1]));
  const maxX = Math.max(...canvasCorners.map((point) => point[0]));
  const maxY = Math.max(...canvasCorners.map((point) => point[1]));
  const ijkTopLeft = transformCanvasToIJK(viewport, [minX, minY]);
  const ijkBottomRight = transformCanvasToIJK(viewport, [maxX, maxY]);
  const ijkDiagonal = vec3.sub(vec3.create(), ijkBottomRight, ijkTopLeft);
  const sliceToIndexMatrix = mat4.fromValues(
    ijkRowVec[0],
    ijkRowVec[1],
    ijkRowVec[2],
    0,
    ijkColVec[0],
    ijkColVec[1],
    ijkColVec[2],
    0,
    ijkSliceVec[0],
    ijkSliceVec[1],
    ijkSliceVec[2],
    0,
    ijkTopLeft[0],
    ijkTopLeft[1],
    ijkTopLeft[2],
    1
  );

  return {
    width: vec3.dot(ijkRowVec, ijkDiagonal) + 1,
    height: vec3.dot(ijkColVec, ijkDiagonal) + 1,
    sliceToIndexMatrix,
    indexToSliceMatrix: mat4.invert(mat4.create(), sliceToIndexMatrix),
  };
}

/**
 * The slice view info of a viewport that shows a volume, from its public
 * transforms and its image data, as the legacy volume viewport computes it in
 * `getSliceViewInfo` (see `getSliceViewGeometry`). The slice plane is the
 * axis of the view plane normal. Throws for an oblique view, as the legacy
 * viewport does.
 */
export function getVolumeSliceViewInfo(
  viewport: PlanarViewport,
  viewPlaneNormal: Point3,
  sliceIndex: number
): SliceViewInfo {
  const geometry = getSliceViewGeometry(viewport);

  if (
    viewPlaneNormal.filter((component) => Math.abs(component) > EPSILON)
      .length > 1
  ) {
    throw new Error('getSliceInfo is not supported for oblique views');
  }

  const slicePlane = viewPlaneNormal.findIndex(
    (component) => Math.abs(component) > 1 - EPSILON
  );

  if (slicePlane === -1) {
    throw new Error('Unable to determine slice axis');
  }

  return {
    sliceIndex,
    slicePlane,
    ...geometry,
  };
}
