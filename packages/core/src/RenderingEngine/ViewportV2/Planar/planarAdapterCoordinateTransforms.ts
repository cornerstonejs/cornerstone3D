import { vec3 } from 'gl-matrix';
import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import canvasToPixel from '../../helpers/cpuFallback/rendering/canvasToPixel';
import pixelToCanvas from '../../helpers/cpuFallback/rendering/pixelToCanvas';
import { getImageDataMetadata } from '../../../utilities/getImageDataMetadata';
import type {
  CPUFallbackEnabledElement,
  IImage,
  Point2,
  Point3,
} from '../../../types';
import type { PlanarCamera } from './PlanarViewportV2Types';

interface PlanarBaseCameraState {
  focalPoint: Point3;
  parallelScale: number;
  position: Point3;
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

export function canvasToWorldContextPool(args: {
  canvas: HTMLCanvasElement;
  renderer: vtkRenderer;
  canvasPos: Point2;
}): Point3 {
  const { canvas, renderer, canvasPos } = args;
  const vtkCamera = renderer.getActiveCamera() as {
    getClippingRange(): [number, number];
    getDistance(): number;
    setClippingRange(near: number, far: number): void;
    setIsPerformingCoordinateTransformation?(flag: boolean): void;
  };
  const restoreCamera = prepareCameraForCoordinateTransforms(vtkCamera);
  const devicePixelRatio = window.devicePixelRatio || 1;
  const { width, height } = canvas;
  const aspectRatio = width / height;
  const canvasPosWithDPR = [
    canvasPos[0] * devicePixelRatio,
    canvasPos[1] * devicePixelRatio,
  ];
  const [xStart, yStart, xEnd, yEnd] =
    renderer.getViewport() as unknown as number[];
  const viewportWidth = xEnd - xStart;
  const viewportHeight = yEnd - yStart;
  const normalizedDisplay = [
    xStart + (canvasPosWithDPR[0] / width) * viewportWidth,
    yStart + (1 - canvasPosWithDPR[1] / height) * viewportHeight,
    0,
  ];
  const projCoords = renderer.normalizedDisplayToProjection(
    normalizedDisplay[0],
    normalizedDisplay[1],
    normalizedDisplay[2]
  );
  const viewCoords = renderer.projectionToView(
    projCoords[0],
    projCoords[1],
    projCoords[2],
    aspectRatio
  );
  const worldCoord = renderer.viewToWorld(
    viewCoords[0],
    viewCoords[1],
    viewCoords[2]
  );

  restoreCamera();

  return [worldCoord[0], worldCoord[1], worldCoord[2]];
}

export function worldToCanvasContextPool(args: {
  canvas: HTMLCanvasElement;
  renderer: vtkRenderer;
  worldPos: Point3;
}): Point2 {
  const { canvas, renderer, worldPos } = args;
  const vtkCamera = renderer.getActiveCamera() as {
    getClippingRange(): [number, number];
    getDistance(): number;
    setClippingRange(near: number, far: number): void;
    setIsPerformingCoordinateTransformation?(flag: boolean): void;
  };
  const restoreCamera = prepareCameraForCoordinateTransforms(vtkCamera);
  const devicePixelRatio = window.devicePixelRatio || 1;
  const { width, height } = canvas;
  const aspectRatio = width / height;
  const viewCoords = renderer.worldToView(
    worldPos[0],
    worldPos[1],
    worldPos[2]
  );
  const projCoords = renderer.viewToProjection(
    viewCoords[0],
    viewCoords[1],
    viewCoords[2],
    aspectRatio
  );
  const normalizedDisplay = renderer.projectionToNormalizedDisplay(
    projCoords[0],
    projCoords[1],
    projCoords[2]
  );
  const [xStart, yStart, xEnd, yEnd] =
    renderer.getViewport() as unknown as number[];
  const viewportWidth = xEnd - xStart;
  const viewportHeight = yEnd - yStart;
  const canvasX = ((normalizedDisplay[0] - xStart) / viewportWidth) * width;
  const canvasY =
    (1 - (normalizedDisplay[1] - yStart) / viewportHeight) * height;

  restoreCamera();

  return [canvasX / devicePixelRatio, canvasY / devicePixelRatio];
}

export function applyPlanarCanvasCameraViewState(args: {
  canvas: HTMLCanvasElement;
  renderer: vtkRenderer;
  baseCamera: PlanarBaseCameraState;
  viewState?: Pick<PlanarCamera, 'pan' | 'zoom'>;
}): void {
  const { canvas, renderer, baseCamera, viewState } = args;
  const camera = renderer.getActiveCamera();
  const zoom = Math.max(viewState?.zoom ?? 1, 0.001);
  const [panX, panY] = viewState?.pan ?? [0, 0];

  camera.setParallelProjection(true);
  camera.setParallelScale(baseCamera.parallelScale / zoom);
  camera.setFocalPoint(...baseCamera.focalPoint);
  camera.setPosition(...baseCamera.position);

  if (!panX && !panY) {
    return;
  }

  const zeroWorld = canvasToWorldContextPool({
    canvas,
    renderer,
    canvasPos: [0, 0],
  });
  const pannedWorld = canvasToWorldContextPool({
    canvas,
    renderer,
    canvasPos: [panX, panY],
  });
  const deltaWorld = vec3.subtract(vec3.create(), pannedWorld, zeroWorld);
  const focalPoint = vec3.subtract(
    vec3.create(),
    baseCamera.focalPoint,
    deltaWorld
  ) as Point3;
  const position = vec3.subtract(
    vec3.create(),
    baseCamera.position,
    deltaWorld
  ) as Point3;

  camera.setFocalPoint(...focalPoint);
  camera.setPosition(...position);
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

function prepareCameraForCoordinateTransforms(vtkCamera: {
  getClippingRange(): [number, number];
  getDistance(): number;
  setClippingRange(near: number, far: number): void;
  setIsPerformingCoordinateTransformation?(flag: boolean): void;
}): () => void {
  if (vtkCamera.setIsPerformingCoordinateTransformation) {
    vtkCamera.setIsPerformingCoordinateTransformation(true);

    return () => {
      vtkCamera.setIsPerformingCoordinateTransformation?.(false);
    };
  }

  const clippingRange = vtkCamera.getClippingRange();
  const distance = vtkCamera.getDistance();

  vtkCamera.setClippingRange(distance, distance + 0.1);

  return () => {
    vtkCamera.setClippingRange(clippingRange[0], clippingRange[1]);
  };
}
