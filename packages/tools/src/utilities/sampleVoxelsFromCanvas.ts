import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { Types } from '@cornerstonejs/core';
import { utilities } from '@cornerstonejs/core';

function getIJKDistance(a: Types.Point3, b: Types.Point3): number {
  const di = a[0] - b[0];
  const dj = a[1] - b[1];
  const dk = a[2] - b[2];
  return Math.sqrt(di * di + dj * dj + dk * dk);
}

/**
 * Returns the canvas step size needed so that adjacent sample points are at most
 * one voxel apart in index space. Returns 1 when zoomed in enough that each canvas
 * pixel already spans less than one voxel.
 */
export function getCanvasVoxelSamplingStep(
  viewport: Types.IViewport,
  imageData: vtkImageData | Types.CPUImageData
): number {
  const canvas = viewport.getCanvas();
  const refX = (canvas?.clientWidth ?? 1) / 2;
  const refY = (canvas?.clientHeight ?? 1) / 2;

  const indexAtRef = utilities.transformWorldToIndex(
    imageData,
    viewport.canvasToWorld([refX, refY])
  ) as Types.Point3;
  const indexAtRefPlusX = utilities.transformWorldToIndex(
    imageData,
    viewport.canvasToWorld([refX + 1, refY])
  ) as Types.Point3;
  const indexAtRefPlusY = utilities.transformWorldToIndex(
    imageData,
    viewport.canvasToWorld([refX, refY + 1])
  ) as Types.Point3;

  const maxDist = Math.max(
    getIJKDistance(indexAtRef, indexAtRefPlusX),
    getIJKDistance(indexAtRef, indexAtRefPlusY)
  );

  if (maxDist <= 1) {
    return 1;
  }

  return 1 / Math.ceil(maxDist);
}

type statsCallback = ({
  value,
  pointLPS,
  pointIJK,
}: {
  value: number | Types.RGB;
  pointLPS?: Types.Point3 | null;
  pointIJK?: Types.Point3 | null;
}) => void;

/**
 * Takes 2D canvas pixels, projects them into 3D medical image space,
 * and samples the underlying voxels to compute statistical metrics (mean, min, max, etc.).
 * @param options.iterator - A generator yielding `[cx, cy]` canvas coordinates to evaluate.
 * @param options.viewport - The active Cornerstone3D viewport context.
 * @param options.imageData - The underlying VTK or CPU image volume data.
 * @param options.voxelManager - voxelManager instance for accessing voxel values at IJK coordinates.
 * @param options.statsCallback - A callback invoked once per unique IJK voxel sampled.
 * @returns An array of unique sampled voxels, each containing the voxel value, LPS coordinates, and IJK coordinates.
 */
export function sampleVoxelsFromCanvas({
  iterator,
  viewport,
  imageData,
  voxelManager,
  statsCallback,
}: {
  iterator: Generator<number[], void, unknown>;
  viewport: Types.IViewport;
  imageData: vtkImageData | Types.CPUImageData;
  voxelManager: Types.VoxelManager<number>;
  statsCallback: statsCallback;
}): {
  value: number;
  pointLPS: Types.Point3;
  pointIJK: Types.Point3;
}[] {
  const dimensions = imageData.getDimensions();
  const pointsInShape = [];
  const visitedIJK = new Set<string>();

  for (const [cx, cy] of iterator) {
    const canvasPoint: Types.Point2 = [cx, cy];
    const worldPoint = viewport.canvasToWorld(canvasPoint);
    const indexPoint = utilities.transformWorldToIndex(imageData, worldPoint);

    // Nearest-neighbor: round to closest voxel
    const ijkPoint: Types.Point3 = [
      Math.round(indexPoint[0]),
      Math.round(indexPoint[1]),
      Math.round(indexPoint[2]),
    ];

    // Bounds check
    if (!isInBound(ijkPoint, dimensions)) {
      continue;
    }

    const value = voxelManager.getAtIJKPoint(ijkPoint);

    if (value === undefined || value === null) {
      continue;
    }

    const sample = {
      value: value as number,
      pointLPS: worldPoint as Types.Point3,
      pointIJK: ijkPoint,
    };

    const ijkKey = `${ijkPoint[0]},${ijkPoint[1]},${ijkPoint[2]}`;
    if (visitedIJK.has(ijkKey)) {
      continue;
    }
    visitedIJK.add(ijkKey);

    pointsInShape.push(sample);
    statsCallback(sample);
  }
  return pointsInShape;
}

function isInBound(ijkPoint: Types.Point3, dimensions) {
  return !(
    ijkPoint[0] < 0 ||
    ijkPoint[0] >= dimensions[0] ||
    ijkPoint[1] < 0 ||
    ijkPoint[1] >= dimensions[1] ||
    ijkPoint[2] < 0 ||
    ijkPoint[2] >= dimensions[2]
  );
}
