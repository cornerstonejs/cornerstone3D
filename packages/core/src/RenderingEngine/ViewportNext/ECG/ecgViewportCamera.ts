import type { Point2 } from '../../../types';
import type { ViewAnchor } from '../ViewportCameraTypes';
import type { ECGCamera, RenderWindowMetrics } from './ECGViewportNextTypes';

export interface ECGCameraLayout {
  anchorWorld: [number, number];
  anchorCanvas: ViewAnchor;
  canvasHeight: number;
  canvasWidth: number;
  centeredXOffset: number;
  centeredYOffset: number;
  effectiveRatio: number;
  xOffset: number;
  yOffset: number;
}

export function createDefaultECGCamera(args: {
  timeRange: [number, number];
  valueRange: [number, number];
}): ECGCamera {
  return {
    timeRange: [...args.timeRange] as [number, number],
    valueRange: [...args.valueRange] as [number, number],
    scrollOffset: 0,
    anchorCanvas: [0.5, 0.5],
    scale: 1,
    scaleMode: 'fit',
    rotation: 0,
  };
}

export function normalizeECGCamera(camera: ECGCamera): ECGCamera {
  return {
    timeRange: [...camera.timeRange] as [number, number],
    valueRange: [...camera.valueRange] as [number, number],
    ...(camera.scrollOffset !== undefined
      ? { scrollOffset: camera.scrollOffset }
      : {}),
    anchorCanvas: cloneAnchorCanvas(camera.anchorCanvas ?? [0.5, 0.5]),
    scale: Math.max(camera.scale ?? 1, 0.001),
    scaleMode: 'fit',
    rotation: 0,
    ...(camera.anchorWorld
      ? {
          anchorWorld: clonePoint(camera.anchorWorld),
        }
      : {}),
  };
}

export function getECGCameraLayout(args: {
  metrics: RenderWindowMetrics;
  camera?: ECGCamera;
  canvas: HTMLCanvasElement;
}): ECGCameraLayout {
  const { metrics, camera, canvas } = args;
  const scale = Math.max(camera?.scale ?? 1, 0.001);
  const effectiveRatio = metrics.worldToCanvasRatio * scale;
  const drawWidth = metrics.ecgWidth * effectiveRatio;
  const drawHeight = metrics.ecgHeight * effectiveRatio;
  const centeredXOffset = (canvas.clientWidth - drawWidth) / 2;
  const centeredYOffset = (canvas.clientHeight - drawHeight) / 2;
  const anchorCanvas = cloneAnchorCanvas(camera?.anchorCanvas ?? [0.5, 0.5]);
  const anchorWorld =
    clonePoint(camera?.anchorWorld) ??
    ([metrics.ecgWidth / 2, metrics.ecgHeight / 2] as [number, number]);
  const xOffset =
    canvas.clientWidth * anchorCanvas[0] - anchorWorld[0] * effectiveRatio;
  const yOffset =
    canvas.clientHeight * anchorCanvas[1] - anchorWorld[1] * effectiveRatio;

  return {
    anchorWorld,
    anchorCanvas,
    canvasHeight: canvas.clientHeight,
    canvasWidth: canvas.clientWidth,
    centeredXOffset,
    centeredYOffset,
    effectiveRatio,
    xOffset,
    yOffset,
  };
}

export function getPanForECGLayout(layout: ECGCameraLayout): Point2 {
  return [
    layout.xOffset - layout.centeredXOffset,
    layout.yOffset - layout.centeredYOffset,
  ];
}

export function getAnchorWorldForPan(
  pan: Point2,
  layout: ECGCameraLayout
): [number, number] {
  return [
    (layout.canvasWidth * layout.anchorCanvas[0] -
      (layout.centeredXOffset + pan[0])) /
      layout.effectiveRatio,
    (layout.canvasHeight * layout.anchorCanvas[1] -
      (layout.centeredYOffset + pan[1])) /
      layout.effectiveRatio,
  ];
}

export function getAnchorWorldForCanvasPoint(
  canvasPoint: Point2,
  layout: ECGCameraLayout
): [number, number] {
  return [
    (canvasPoint[0] - layout.xOffset) / layout.effectiveRatio,
    (canvasPoint[1] - layout.yOffset) / layout.effectiveRatio,
  ];
}

function clonePoint(point?: [number, number]): [number, number] | undefined {
  return point ? [point[0], point[1]] : undefined;
}

function cloneAnchorCanvas(anchorCanvas: ViewAnchor): ViewAnchor {
  return [anchorCanvas[0], anchorCanvas[1]];
}
