import { vec3 } from 'gl-matrix';
import canvasToPixel from '../../helpers/cpuFallback/rendering/canvasToPixel';
import pixelToCanvas from '../../helpers/cpuFallback/rendering/pixelToCanvas';
export {
  canvasToWorldContextPool,
  worldToCanvasContextPool,
} from '../../helpers/vtkCanvasCoordinateTransforms';
import { getImageDataMetadata } from '../../../utilities/getImageDataMetadata';
import type {
  CPUFallbackEnabledElement,
  ICamera,
  IImage,
  Point2,
  Point3,
} from '../../../types';
import {
  getPlanarScaleRatio,
  type PlanarScaleInput,
} from './planarCameraScale';

type PlanarResolvedView = Pick<
  Required<ICamera>,
  'focalPoint' | 'parallelScale' | 'viewPlaneNormal' | 'viewUp'
> & {
  presentationScale?: PlanarScaleInput;
};

function getPlanarViewStateBasis(camera: PlanarResolvedView) {
  const viewUp = vec3.normalize(
    vec3.create(),
    camera.viewUp as unknown as vec3
  ) as Point3;
  const viewPlaneNormal = vec3.normalize(
    vec3.create(),
    camera.viewPlaneNormal as unknown as vec3
  ) as Point3;
  let right = vec3.cross(
    vec3.create(),
    viewUp as unknown as vec3,
    viewPlaneNormal as unknown as vec3
  );

  if (!vec3.length(right)) {
    right = vec3.fromValues(1, 0, 0);
  }

  return {
    right: vec3.normalize(vec3.create(), right) as Point3,
    viewPlaneNormal,
    viewUp,
  };
}

export function canvasToWorldPlanarViewState(args: {
  camera: PlanarResolvedView;
  canvasWidth: number;
  canvasHeight: number;
  canvasPos: Point2;
}): Point3 {
  const { camera, canvasWidth, canvasHeight, canvasPos } = args;
  const safeCanvasWidth = Math.max(canvasWidth, 1);
  const safeCanvasHeight = Math.max(canvasHeight, 1);
  const { right, viewUp } = getPlanarViewStateBasis(camera);
  const worldHeight = Math.max(camera.parallelScale, 0.001) * 2;
  const worldWidth =
    worldHeight *
    (safeCanvasWidth / safeCanvasHeight) *
    (1 / getPlanarScaleRatio(camera.presentationScale));
  const xOffset = (canvasPos[0] / safeCanvasWidth - 0.5) * worldWidth;
  const yOffset = (0.5 - canvasPos[1] / safeCanvasHeight) * worldHeight;
  const worldPos = [...camera.focalPoint] as Point3;

  vec3.scaleAndAdd(
    worldPos as unknown as vec3,
    worldPos as unknown as vec3,
    right as unknown as vec3,
    xOffset
  );
  vec3.scaleAndAdd(
    worldPos as unknown as vec3,
    worldPos as unknown as vec3,
    viewUp as unknown as vec3,
    yOffset
  );

  return worldPos;
}

export function worldToCanvasPlanarViewState(args: {
  camera: PlanarResolvedView;
  canvasWidth: number;
  canvasHeight: number;
  worldPos: Point3;
}): Point2 {
  const { camera, canvasWidth, canvasHeight, worldPos } = args;
  const safeCanvasWidth = Math.max(canvasWidth, 1);
  const safeCanvasHeight = Math.max(canvasHeight, 1);
  const { right, viewUp } = getPlanarViewStateBasis(camera);
  const worldHeight = Math.max(camera.parallelScale, 0.001) * 2;
  const worldWidth =
    worldHeight *
    (safeCanvasWidth / safeCanvasHeight) *
    (1 / getPlanarScaleRatio(camera.presentationScale));
  const delta = vec3.subtract(
    vec3.create(),
    worldPos as unknown as vec3,
    camera.focalPoint as unknown as vec3
  );
  const xOffset = vec3.dot(delta, right as unknown as vec3);
  const yOffset = vec3.dot(delta, viewUp as unknown as vec3);

  return [
    (xOffset / worldWidth + 0.5) * safeCanvasWidth,
    (0.5 - yOffset / worldHeight) * safeCanvasHeight,
  ];
}

export function getCanvasCssDimensions(canvas: HTMLCanvasElement): {
  canvasWidth: number;
  canvasHeight: number;
} {
  const devicePixelRatio =
    typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;

  return {
    canvasWidth: canvas.width / devicePixelRatio,
    canvasHeight: canvas.height / devicePixelRatio,
  };
}

export function canvasToWorldCPUImage(
  enabledElement: CPUFallbackEnabledElement,
  image: IImage,
  canvasPos: Point2
): Point3 {
  const [px, py] = canvasToPixel(enabledElement, canvasPos);
  const { origin, spacing, direction } = getImageDataMetadata(image);
  const iVector = direction.slice(0, 3) as Point3;
  const jVector = direction.slice(3, 6) as Point3;
  const worldPos = [...origin] as Point3;

  vec3.scaleAndAdd(worldPos, origin, iVector, px * spacing[0]);
  vec3.scaleAndAdd(worldPos, worldPos, jVector, py * spacing[1]);

  return worldPos;
}

export function worldToCanvasCPUImage(
  enabledElement: CPUFallbackEnabledElement,
  image: IImage,
  worldPos: Point3
): Point2 {
  const { spacing, direction, origin } = getImageDataMetadata(image);
  const iVector = direction.slice(0, 3) as Point3;
  const jVector = direction.slice(3, 6) as Point3;
  const diff = vec3.subtract(vec3.create(), worldPos, origin);
  const indexPoint: Point2 = [
    vec3.dot(diff, iVector) / spacing[0],
    vec3.dot(diff, jVector) / spacing[1],
  ];

  return pixelToCanvas(enabledElement, indexPoint);
}

export function getCpuEquivalentParallelScale(args: {
  canvasHeight: number;
  canvasWidth: number;
  columnPixelSpacing: number;
  columns: number;
  rowPixelSpacing: number;
  rows: number;
}): number {
  const {
    canvasHeight,
    canvasWidth,
    columnPixelSpacing,
    columns,
    rowPixelSpacing,
    rows,
  } = args;
  const safeHeight = Math.max(canvasHeight, 1);
  const safeWidth = Math.max(canvasWidth, 1);
  const physicalHeight = Math.max(rows, 1) * (rowPixelSpacing || 1);
  const physicalWidth = Math.max(columns, 1) * (columnPixelSpacing || 1);
  const aspectRatio = safeWidth / safeHeight;

  return Math.max(physicalHeight, physicalWidth / aspectRatio) * 0.5;
}

export function getOrthogonalVolumeSliceGeometry(args: {
  dimensions: Point3;
  direction: number[] | ArrayLike<number>;
  spacing: Point3;
  viewPlaneNormal: Point3;
  viewUp: Point3;
}):
  | {
      columnPixelSpacing: number;
      columns: number;
      rowPixelSpacing: number;
      rows: number;
    }
  | undefined {
  const { dimensions, direction, spacing, viewPlaneNormal, viewUp } = args;
  const directionArray = Array.from(direction);
  const rowAxis = directionArray.slice(0, 3) as Point3;
  const colAxis = directionArray.slice(3, 6) as Point3;
  const scanAxis = directionArray.slice(6, 9) as Point3;
  const normalizedViewUp = vec3.normalize(
    vec3.create(),
    viewUp as unknown as vec3
  ) as Point3;
  const normalizedViewPlaneNormal = vec3.normalize(
    vec3.create(),
    viewPlaneNormal as unknown as vec3
  ) as Point3;
  const right = vec3.normalize(
    vec3.create(),
    vec3.cross(
      vec3.create(),
      normalizedViewUp as unknown as vec3,
      normalizedViewPlaneNormal as unknown as vec3
    )
  ) as Point3;
  const basis = [rowAxis, colAxis, scanAxis];

  const columnAxisIndex = getMajorAxisIndex(right, basis);
  const rowAxisIndex = getMajorAxisIndex(
    vec3.negate(vec3.create(), normalizedViewUp as unknown as vec3) as Point3,
    basis
  );

  if (
    columnAxisIndex === undefined ||
    rowAxisIndex === undefined ||
    columnAxisIndex === rowAxisIndex
  ) {
    return;
  }

  return {
    columns: dimensions[columnAxisIndex],
    rows: dimensions[rowAxisIndex],
    columnPixelSpacing: spacing[columnAxisIndex],
    rowPixelSpacing: spacing[rowAxisIndex],
  };
}

function getMajorAxisIndex(
  vector: Point3,
  basis: Point3[]
): 0 | 1 | 2 | undefined {
  const scores = basis.map((axis) => Math.abs(vec3.dot(vector, axis)));
  const maxScore = Math.max(...scores);

  if (maxScore < 0.995) {
    return;
  }

  return scores.indexOf(maxScore) as 0 | 1 | 2;
}
