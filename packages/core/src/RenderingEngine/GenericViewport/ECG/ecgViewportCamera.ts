import type { Point2 } from '../../../types';
import type { ViewAnchor } from '../ViewportCameraTypes';
import type { ECGViewState } from './ECGViewportTypes';
import type { ECGRenderMetrics } from './ecgGeometry';

export interface ECGCanvasMapping {
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

/** View state fields that select the layout, and not the navigation. */
export type ECGLayoutOptions = Pick<
  ECGViewState,
  | 'sweepSpeed'
  | 'sensitivityMmMv'
  | 'amplitudeScale'
  | 'visibleChannels'
  | 'traceLayout'
>;

const ECG_LAYOUT_OPTION_KEYS: (keyof ECGLayoutOptions)[] = [
  'sweepSpeed',
  'sensitivityMmMv',
  'amplitudeScale',
  'visibleChannels',
  'traceLayout',
];

/** Returns the layout options that `viewState` defines. */
export function getECGLayoutOptions(viewState: ECGViewState): ECGLayoutOptions {
  const options: ECGLayoutOptions = {};

  ECG_LAYOUT_OPTION_KEYS.forEach((key) => {
    if (viewState[key] !== undefined) {
      (options as Record<string, unknown>)[key] = viewState[key];
    }
  });

  return options;
}

export function createDefaultECGViewState(
  args: {
    timeRange: [number, number];
    valueRange: [number, number];
  } & ECGLayoutOptions
): ECGViewState {
  return {
    ...getECGLayoutOptions(args as ECGViewState),
    timeRange: [...args.timeRange] as [number, number],
    valueRange: [...args.valueRange] as [number, number],
    scrollOffset: 0,
    anchorCanvas: [0.5, 0.5],
    scale: 1,
    scaleMode: 'fit',
    rotation: 0,
  };
}

export function normalizeECGViewState(camera: ECGViewState): ECGViewState {
  return {
    ...getECGLayoutOptions(camera),
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

export function resolveECGCanvasMapping(args: {
  metrics: ECGRenderMetrics;
  camera?: ECGViewState;
  canvas: HTMLCanvasElement;
}): ECGCanvasMapping {
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

export function getPanForECGCanvasMapping(mapping: ECGCanvasMapping): Point2 {
  return [
    mapping.xOffset - mapping.centeredXOffset,
    mapping.yOffset - mapping.centeredYOffset,
  ];
}

export function getAnchorWorldForPan(
  pan: Point2,
  mapping: ECGCanvasMapping
): [number, number] {
  return [
    (mapping.canvasWidth * mapping.anchorCanvas[0] -
      (mapping.centeredXOffset + pan[0])) /
      mapping.effectiveRatio,
    (mapping.canvasHeight * mapping.anchorCanvas[1] -
      (mapping.centeredYOffset + pan[1])) /
      mapping.effectiveRatio,
  ];
}

export function getAnchorWorldForCanvasPoint(
  canvasPoint: Point2,
  mapping: ECGCanvasMapping
): [number, number] {
  return [
    (canvasPoint[0] - mapping.xOffset) / mapping.effectiveRatio,
    (canvasPoint[1] - mapping.yOffset) / mapping.effectiveRatio,
  ];
}

function clonePoint(point?: [number, number]): [number, number] | undefined {
  return point ? [point[0], point[1]] : undefined;
}

function cloneAnchorCanvas(anchorCanvas: ViewAnchor): ViewAnchor {
  return [anchorCanvas[0], anchorCanvas[1]];
}
