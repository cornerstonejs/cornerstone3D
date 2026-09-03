import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type { Point2, Point3 } from '../../types';

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
