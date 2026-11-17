import { glMatrix, vec3 } from 'gl-matrix';
import type {
  IStackViewport,
  IViewport,
  IVolumeViewport,
  PixelDataTypedArray,
  Point3,
} from '../types';
import { getStackSliceViewInfo } from './getStackSliceViewInfo';
import {
  getVolumeSliceViewInfo,
  type SliceViewInfo,
} from './getVolumeSliceViewInfo';
import { transformCanvasToIJK } from './transformCanvasToIJK';
import { getViewportContentMode } from './viewportCapabilities';

/**
 * The slice view info of a viewport. A viewport that shows a stack gets the
 * info of its image on display, whether it is a next viewport, a legacy
 * adapter or a legacy stack viewport, whose own member throws. A viewport
 * that shows a volume answers with its own member when it has one (a legacy
 * viewport, an adapter), else the info comes from the resolved view of the
 * next viewport.
 */
function getSliceViewInfo(viewport: IViewport): SliceViewInfo {
  if (getViewportContentMode(viewport) === 'stack') {
    return getStackSliceViewInfo(viewport as IStackViewport);
  }

  if (typeof viewport.getSliceViewInfo === 'function') {
    return viewport.getSliceViewInfo();
  }

  const nextViewport = viewport as unknown as {
    getResolvedView(): { toICamera(): { viewPlaneNormal: Point3 } };
    getSliceIndex(): number;
  };

  return getVolumeSliceViewInfo(
    viewport as IVolumeViewport,
    nextViewport.getResolvedView().toICamera().viewPlaneNormal,
    nextViewport.getSliceIndex()
  );
}

/**
 * The pixels of the slice on display, in the order of the image data. For a
 * stack they are the pixel data of the image itself, not a copy. For a
 * volume they are a copy of the slice that the slice to index matrix names,
 * along the slice plane. This is not `sliceIndex` of the slice view info,
 * which counts along the view direction and is the mirror of that slice when
 * the view looks against the axis of the volume.
 */
function getSliceScalarData(
  viewport: IViewport,
  { slicePlane, sliceToIndexMatrix }: SliceViewInfo
): PixelDataTypedArray {
  const viewportImageData = viewport.getImageData();

  if (getViewportContentMode(viewport) === 'stack') {
    return viewportImageData.scalarData;
  }

  const { voxelManager, dimensions } = viewportImageData;

  return voxelManager.getSliceData({
    sliceIndex: Math.min(
      Math.max(0, Math.round(sliceToIndexMatrix[12 + slicePlane])),
      dimensions[slicePlane] - 1
    ),
    slicePlane,
  });
}

/**
 * Get the image data for the current slice rendered on the viewport. The image
 * data returned is the full slice and not only the region that is visible on
 * the viewport. It does not work for oblique views.
 *
 * It answers for a viewport that shows a volume and for one that shows a
 * stack, where the slice is the image on display. The pixels are in the
 * order of the image data. A slice pixel `[x, y, 0]` times
 * `sliceToIndexMatrix` is its index in the image data of the viewport, as
 * long as the view is not flipped and not rotated: the matrices follow the
 * view, the pixels do not.
 *
 * @param viewport - A viewport that shows a volume or a stack
 * @returns Slice image data and  matrices to convert from volume
 *   to slice and vice-versa
 */
function getCurrentVolumeViewportSlice(viewport: IViewport) {
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

  return {
    width: sliceViewInfo.width,
    height: sliceViewInfo.height,
    scalarData: getSliceScalarData(viewport, sliceViewInfo),
    sliceToIndexMatrix,
    indexToSliceMatrix,
  };
}

export {
  getCurrentVolumeViewportSlice as default,
  getCurrentVolumeViewportSlice,
};
