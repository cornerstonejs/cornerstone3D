import type { Point2 } from '../../../types';
import type { ViewAnchor } from '../ViewportCameraTypes';
import type { ECGCamera, RenderWindowMetrics } from './ECGViewportV2Types';

export interface ECGCameraLayout {
  anchorPoint: [number, number];
  anchorView: ViewAnchor;
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
    frame: {
      anchorView: [0.5, 0.5],
      scale: 1,
      scaleMode: 'fit',
      rotation: 0,
    },
  };
}

export function normalizeECGCamera(camera: ECGCamera): ECGCamera {
  return {
    timeRange: [...camera.timeRange] as [number, number],
    valueRange: [...camera.valueRange] as [number, number],
    ...(camera.scrollOffset !== undefined
      ? { scrollOffset: camera.scrollOffset }
      : {}),
    frame: {
      anchorView: cloneAnchorView(camera.frame?.anchorView ?? [0.5, 0.5]),
      scale: Math.max(camera.frame?.scale ?? 1, 0.001),
      scaleMode: 'fit',
      rotation: 0,
      ...(camera.frame?.anchorPoint
        ? {
            anchorPoint: clonePoint(camera.frame.anchorPoint),
          }
        : {}),
    },
  };
}

export function getECGCameraLayout(args: {
  metrics: RenderWindowMetrics;
  camera?: ECGCamera;
  canvas: HTMLCanvasElement;
}): ECGCameraLayout {
  const { metrics, camera, canvas } = args;
  const scale = Math.max(camera?.frame?.scale ?? 1, 0.001);
  const effectiveRatio = metrics.worldToCanvasRatio * scale;
  const drawWidth = metrics.ecgWidth * effectiveRatio;
  const drawHeight = metrics.ecgHeight * effectiveRatio;
  const centeredXOffset = (canvas.clientWidth - drawWidth) / 2;
  const centeredYOffset = (canvas.clientHeight - drawHeight) / 2;
  const anchorView = cloneAnchorView(camera?.frame?.anchorView ?? [0.5, 0.5]);
  const anchorPoint =
    clonePoint(camera?.frame?.anchorPoint) ??
    ([metrics.ecgWidth / 2, metrics.ecgHeight / 2] as [number, number]);
  const xOffset =
    canvas.clientWidth * anchorView[0] - anchorPoint[0] * effectiveRatio;
  const yOffset =
    canvas.clientHeight * anchorView[1] - anchorPoint[1] * effectiveRatio;

  return {
    anchorPoint,
    anchorView,
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

export function getAnchorPointForPan(
  pan: Point2,
  layout: ECGCameraLayout
): [number, number] {
  return [
    (layout.canvasWidth * layout.anchorView[0] -
      (layout.centeredXOffset + pan[0])) /
      layout.effectiveRatio,
    (layout.canvasHeight * layout.anchorView[1] -
      (layout.centeredYOffset + pan[1])) /
      layout.effectiveRatio,
  ];
}

export function getAnchorPointForCanvasPoint(
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

function cloneAnchorView(anchorView: ViewAnchor): ViewAnchor {
  return [anchorView[0], anchorView[1]];
}
