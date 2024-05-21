import { glMatrix, mat4, vec3 } from 'gl-matrix';
import { IVolumeViewport, Point3 } from '../types';
import { transformIJKToCanvas } from './transformIJKToCanvas';
import { transformCanvasToIJK } from './transformCanvasToIJK';

/**
 * Get the image data for the current slice rendered on the viewport. The image
 * data returned is the full slice and not only the region that is visible on
 * the viewport. It does not work for oblique views.
 * @param viewport - Volume viewport
 * @returns Slice image dataand  matrices to convert from volume
 *   to slice and vice-versa
 */
function getCurrentVolumeViewportSlice(viewport: IVolumeViewport) {
  const { dimensions, scalarData } = viewport.getImageData();
  const { width: canvasWidth, height: canvasHeight } = viewport.getCanvas();

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
    throw new Error('Livewire is not available for rotate/oblique viewports');
  }

  const [sx, sy, sz] = dimensions;

  // All eight volume corners in index space
  // prettier-ignore
  const ijkCorners: Point3[] = [
    [     0,        0,        0], // top-left-front
    [sx - 1,        0,        0], // top-right-front
    [     0,   sy - 1,        0], // bottom-left-front
    [sx - 1,   sy - 1,        0], // bottom-right-front
    [     0,        0,   sz - 1], // top-left-back
    [sx - 1,        0,   sz - 1], // top-right-back
    [     0,   sy - 1,   sz - 1], // bottom-left-back
    [sx - 1,   sy - 1,   sz - 1], // bottom-right-back
  ];

  // Project the volume corners onto the canvas
  const canvasCorners = ijkCorners.map((ijkCorner) =>
    transformIJKToCanvas(viewport, ijkCorner)
  );

  // Calculate the AABB from the corners project onto the canvas
  const canvasAABB = canvasCorners.reduce(
    (aabb, canvasPoint) => {
      aabb.minX = Math.min(aabb.minX, canvasPoint[0]);
      aabb.minY = Math.min(aabb.minY, canvasPoint[1]);
      aabb.maxX = Math.max(aabb.maxX, canvasPoint[0]);
      aabb.maxY = Math.max(aabb.maxY, canvasPoint[1]);

      return aabb;
    },
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );

  // Get the top-left, bottom-right and the diagonal vector of
  // the slice in index space
  const ijkTopLeft = transformCanvasToIJK(viewport, [
    canvasAABB.minX,
    canvasAABB.minY,
  ]);
  const ijkBottomRight = transformCanvasToIJK(viewport, [
    canvasAABB.maxX,
    canvasAABB.maxY,
  ]);
  const ijkDiagonal = vec3.sub(vec3.create(), ijkBottomRight, ijkTopLeft);

  // prettier-ignore
  const sliceToIndexMatrix = mat4.fromValues(
      ijkRowVec[0],   ijkRowVec[1],   ijkRowVec[2],  0,
      ijkColVec[0],   ijkColVec[1],   ijkColVec[2],  0,
    ijkSliceVec[0], ijkSliceVec[1], ijkSliceVec[2],  0,
     ijkTopLeft[0],  ijkTopLeft[1],  ijkTopLeft[2],  1
  );

  const indexToSliceMatrix = mat4.invert(mat4.create(), sliceToIndexMatrix);

  // Dot the diagonal with row/column to find the image width/height
  const sliceWidth = vec3.dot(ijkRowVec, ijkDiagonal) + 1;
  const sliceHeight = vec3.dot(ijkColVec, ijkDiagonal) + 1;

  // Create a TypedArray with same type from the original scalarData
  const TypedArray = (scalarData as any).constructor;
  const sliceData = new TypedArray(sliceWidth * sliceHeight);

  // We need to know how many pixels to jump for every change in Z direction
  const pixelsPerSlice = dimensions[0] * dimensions[1];

  // Create two vectors to keep track of each row/column it is, reducing
  // the amount of vec3 instances created and simplifying the math.
  const ijkPixelRow = vec3.clone(ijkTopLeft);
  const ijkPixelCol = vec3.create();

  // Use an independent index to avoid multiple (x,y) to index conversions
  let slicePixelIndex = 0;

  for (let y = 0; y < sliceHeight; y++) {
    vec3.copy(ijkPixelCol, ijkPixelRow);

    for (let x = 0; x < sliceWidth; x++) {
      const volumePixelIndex =
        ijkPixelCol[2] * pixelsPerSlice +
        ijkPixelCol[1] * dimensions[0] +
        ijkPixelCol[0];

      // It may never throw any "out of bounds" error but just to be safe
      if (volumePixelIndex < scalarData.length) {
        sliceData[slicePixelIndex] = scalarData[volumePixelIndex];
      }

      // Move to next slice pixel
      slicePixelIndex++;

      // Move to the next voxel
      vec3.add(ijkPixelCol, ijkPixelCol, ijkRowVec);
    }

    // Move to the next row
    vec3.add(ijkPixelRow, ijkPixelRow, ijkColVec);
  }

  return {
    width: sliceWidth,
    height: sliceHeight,
    scalarData: sliceData,
    sliceToIndexMatrix,
    indexToSliceMatrix,
  };
}

export {
  getCurrentVolumeViewportSlice as default,
  getCurrentVolumeViewportSlice,
};
