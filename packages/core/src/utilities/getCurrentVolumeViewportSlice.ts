import { glMatrix, vec3 } from 'gl-matrix';
import type { IVolumeViewport, Point3 } from '../types';
import { getVolumeSliceViewInfo } from './getVolumeSliceViewInfo';
import { transformCanvasToIJK } from './transformCanvasToIJK';

/**
 * The slice view info of a viewport: its own answer on a legacy viewport,
 * else computed from the resolved view of a next viewport.
 */
function getSliceViewInfo(
  viewport: IVolumeViewport
): ReturnType<IVolumeViewport['getSliceViewInfo']> {
  if (typeof viewport.getSliceViewInfo === 'function') {
    return viewport.getSliceViewInfo();
  }

  const nextViewport = viewport as unknown as {
    getResolvedView(): { toICamera(): { viewPlaneNormal: Point3 } };
    getSliceIndex(): number;
  };

  return getVolumeSliceViewInfo(
    viewport,
    nextViewport.getResolvedView().toICamera().viewPlaneNormal,
    nextViewport.getSliceIndex()
  );
}

/**
 * Get the image data for the current slice rendered on the viewport. The image
 * data returned is the full slice and not only the region that is visible on
 * the viewport. It does not work for oblique views.
 * @param viewport - Volume viewport
 * @returns Slice image data and  matrices to convert from volume
 *   to slice and vice-versa
 */
function getCurrentVolumeViewportSlice(viewport: IVolumeViewport) {
  const { width: canvasWidth, height: canvasHeight } = viewport.getCanvas();

  const sliceViewInfo = getSliceViewInfo(viewport);
  const { sliceToIndexMatrix, indexToSliceMatrix } = sliceViewInfo;
  // Get three points from the canvas to help us identify the orientation of
  // the slice. Using canvas width/height to get point far away for each other
  // because points such as (0,0), (1,0) and (0,1) may be converted to the same
  // ijk index when the image is zoomed in.
  const ijkOriginPoint = transformCanvasToIJK(viewport, [0, 0]);
  const ijkRowPoint = transformCanvasToIJK(viewport, [canvasWidth - 1, 0]);
  const ijkColPoint = transformCanvasToIJK(viewport, [0, canvasHeight - 1]);

  // Subtract the points to get the row and column vectors in index space
  const ijkRowVec = vec3.sub(vec3.create(), ijkRowPoint, ijkOriginPoint);
  const ijkColVec = vec3.sub(vec3.create(), ijkColPoint, ijkOriginPoint);
  const ijkSliceVec = vec3.cross(vec3.create(), ijkRowVec, ijkColVec);

  vec3.normalize(ijkRowVec, ijkRowVec);
  vec3.normalize(ijkColVec, ijkColVec);
  vec3.normalize(ijkSliceVec, ijkSliceVec);

  // Any unit vector parallel to IJK have one component equal to 1 and
  // the other two components equal to 0. If two of them are parallel
  // the third one is also parallel
  const maxIJKRowVec = Math.max(
    Math.abs(ijkRowVec[0]),
    Math.abs(ijkRowVec[1]),
    Math.abs(ijkRowVec[2])
  );
  const maxIJKColVec = Math.max(
    Math.abs(ijkColVec[0]),
    Math.abs(ijkColVec[1]),
    Math.abs(ijkColVec[2])
  );

  // Using glMatrix.equals() because the number may be not exactly equal to
  // 1 due to rounding issues
  if (!glMatrix.equals(1, maxIJKRowVec) || !glMatrix.equals(1, maxIJKColVec)) {
    throw new Error(
      'getCurrentVolumeViewportSlice is not available for rotate/oblique viewports'
    );
  }

  const { voxelManager } = viewport.getImageData();

  const scalarData = voxelManager.getSliceData(sliceViewInfo);

  return {
    width: sliceViewInfo.width,
    height: sliceViewInfo.height,
    scalarData,
    sliceToIndexMatrix,
    indexToSliceMatrix,
  };
}

export {
  getCurrentVolumeViewportSlice as default,
  getCurrentVolumeViewportSlice,
};
