import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type { Point2, Point3 } from '../../types';

/**
 * The normalized display coordinates of vtk.js for a point of the canvas of a
 * viewport, with a depth of 0. They go from 0 to 1 across the render window,
 * from its bottom left corner. The renderer of the viewport covers a part of
 * the render window (`renderer.getViewport()`), and the canvas shows that
 * part, so the point is placed inside it.
 *
 * @param args.canvas - The canvas of the viewport, in device pixels.
 * @param args.renderer - The vtk.js renderer of the viewport.
 * @param args.canvasPos - The point in CSS pixels, from the top left corner of the canvas.
 * @returns The normalized display coordinates.
 */
export function canvasToNormalizedDisplay(args: {
  canvas: HTMLCanvasElement;
  renderer: vtkRenderer;
  canvasPos: Point2;
}): Point3 {
  const { canvas, renderer, canvasPos } = args;
  const devicePixelRatio = window.devicePixelRatio || 1;
  const { width, height } = canvas;
  const [xStart, yStart, xEnd, yEnd] =
    renderer.getViewport() as unknown as number[];

  return [
    xStart + ((canvasPos[0] * devicePixelRatio) / width) * (xEnd - xStart),
    yStart + (1 - (canvasPos[1] * devicePixelRatio) / height) * (yEnd - yStart),
    0,
  ];
}

export function canvasToWorldContextPool(args: {
  canvas: HTMLCanvasElement;
  renderer: vtkRenderer;
  canvasPos: Point2;
}): Point3 {
  const { canvas, renderer } = args;
  const vtkCamera = renderer.getActiveCamera() as {
    getClippingRange(): [number, number];
    getDistance(): number;
    setClippingRange(near: number, far: number): void;
    setIsPerformingCoordinateTransformation?(flag: boolean): void;
  };
  const restoreCamera = prepareCameraForCoordinateTransforms(vtkCamera);
  const { width, height } = canvas;
  const aspectRatio = width / height;
  const normalizedDisplay = canvasToNormalizedDisplay(args);
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
