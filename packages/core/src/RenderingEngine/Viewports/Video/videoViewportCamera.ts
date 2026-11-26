import { SpeedUnit } from '../../../enums/VideoEnums';
import type { ViewAnchor } from '../ViewportCameraTypes';
import type { VideoViewState, VideoProperties } from './VideoViewportTypes';

export interface VideoCanvasMapping {
  left: number;
  top: number;
  width: number;
  height: number;
  containerWidth: number;
  containerHeight: number;
  intrinsicWidth: number;
  intrinsicHeight: number;
  anchorWorld: [number, number];
  anchorCanvas: ViewAnchor;
  /** The canvas pixels of one media pixel along the width. */
  worldToCanvasRatio: number;
  /**
   * The canvas pixels of one media pixel along the height. It equals
   * `worldToCanvasRatio` for every object fit but `fill`, which stretches the
   * video to the pane on each axis.
   */
  worldToCanvasRatioY: number;
}

interface VideoCanvasMappingInput {
  containerWidth: number;
  containerHeight: number;
  intrinsicWidth: number;
  intrinsicHeight: number;
  objectFit?: VideoProperties['objectFit'];
}

export function createDefaultVideoViewState(): VideoViewState {
  return {
    currentTimeSeconds: 0,
    anchorCanvas: [0.5, 0.5],
    scale: 1,
    scaleMode: 'fit',
    rotation: 0,
  };
}

/**
 * Whether a value is a frame range of a video view state: two different
 * frame numbers.
 */
function isVideoFrameRange(
  frameRange: unknown
): frameRange is [number, number] {
  return (
    Array.isArray(frameRange) &&
    frameRange.length === 2 &&
    typeof frameRange[0] === 'number' &&
    typeof frameRange[1] === 'number' &&
    frameRange[0] !== frameRange[1]
  );
}

/**
 * Whether a value is a scroll step of a video view state: a number of frames
 * or of seconds above 0.
 */
function isVideoScrollStep(
  scrollStep: unknown
): scrollStep is VideoViewState['scrollStep'] {
  const step = scrollStep as VideoViewState['scrollStep'] | undefined;

  return (
    typeof step?.value === 'number' &&
    Number.isFinite(step.value) &&
    step.value > 0 &&
    (step.unit === SpeedUnit.FRAME || step.unit === SpeedUnit.SECOND)
  );
}

/**
 * The number of frames of one scroll step of a video view state at a frame
 * rate: one frame when the view state has no step.
 */
export function getVideoScrollStepFrames(
  viewState: VideoViewState,
  fps: number
): number {
  const { scrollStep } = viewState;

  if (!scrollStep) {
    return 1;
  }

  const frames =
    scrollStep.unit === SpeedUnit.SECOND
      ? scrollStep.value * fps
      : scrollStep.value;

  return frames > 0 ? frames : 1;
}

export function normalizeVideoViewState(
  camera: VideoViewState
): VideoViewState {
  return {
    ...(camera.currentTimeSeconds !== undefined
      ? { currentTimeSeconds: Math.max(0, camera.currentTimeSeconds) }
      : {}),
    ...(isVideoFrameRange(camera.frameRange)
      ? { frameRange: [camera.frameRange[0], camera.frameRange[1]] }
      : {}),
    ...(isVideoScrollStep(camera.scrollStep)
      ? {
          scrollStep: {
            value: camera.scrollStep.value,
            unit: camera.scrollStep.unit,
          },
        }
      : {}),
    anchorCanvas: cloneAnchorCanvas(camera.anchorCanvas ?? [0.5, 0.5]),
    scale: Math.max(camera.scale ?? 1, 0.001),
    scaleMode: 'fit',
    rotation: camera.rotation ?? 0,
    ...(camera.anchorWorld
      ? {
          anchorWorld: cloneAnchorWorld(camera.anchorWorld),
        }
      : {}),
  };
}

export function resolveVideoCanvasMapping(
  input: VideoCanvasMappingInput & {
    camera?: VideoViewState;
  }
): VideoCanvasMapping | undefined {
  const {
    containerWidth,
    containerHeight,
    intrinsicWidth,
    intrinsicHeight,
    objectFit = 'contain',
    camera,
  } = input;

  if (
    !containerWidth ||
    !containerHeight ||
    !intrinsicWidth ||
    !intrinsicHeight
  ) {
    return;
  }

  const containScale = Math.min(
    containerWidth / intrinsicWidth,
    containerHeight / intrinsicHeight
  );
  const coverScale = Math.max(
    containerWidth / intrinsicWidth,
    containerHeight / intrinsicHeight
  );
  let width = intrinsicWidth * containScale;
  let height = intrinsicHeight * containScale;

  switch (objectFit) {
    case 'cover':
      width = intrinsicWidth * coverScale;
      height = intrinsicHeight * coverScale;
      break;
    case 'fill':
      width = containerWidth;
      height = containerHeight;
      break;
    case 'none':
      width = intrinsicWidth;
      height = intrinsicHeight;
      break;
    case 'scale-down': {
      const scaleDown = Math.min(1, containScale);
      width = intrinsicWidth * scaleDown;
      height = intrinsicHeight * scaleDown;
      break;
    }
    case 'contain':
    default:
      break;
  }

  const zoom = Math.max(camera?.scale ?? 1, 0.001);
  width *= zoom;
  height *= zoom;

  const worldToCanvasRatio = width / intrinsicWidth;
  const worldToCanvasRatioY =
    objectFit === 'fill' ? height / intrinsicHeight : worldToCanvasRatio;
  const anchorCanvas = cloneAnchorCanvas(camera?.anchorCanvas ?? [0.5, 0.5]);
  const anchorWorld =
    cloneAnchorWorld(camera?.anchorWorld) ??
    ([intrinsicWidth / 2, intrinsicHeight / 2] as [number, number]);
  const left =
    containerWidth * anchorCanvas[0] - anchorWorld[0] * worldToCanvasRatio;
  const top =
    containerHeight * anchorCanvas[1] - anchorWorld[1] * worldToCanvasRatioY;

  return {
    left,
    top,
    width,
    height,
    containerWidth,
    containerHeight,
    intrinsicWidth,
    intrinsicHeight,
    anchorWorld,
    anchorCanvas,
    worldToCanvasRatio,
    worldToCanvasRatioY,
  };
}

/**
 * The canvas point of the video after a turn by the rotation in degrees,
 * clockwise on screen, about the anchor canvas point of the mapping.
 */
export function rotateVideoCanvasPoint(
  canvasPoint: [number, number],
  mapping: VideoCanvasMapping,
  rotation: number
): [number, number] {
  if (!rotation) {
    return [canvasPoint[0], canvasPoint[1]];
  }

  const [pivotX, pivotY] = getVideoRotationPivot(mapping);
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = canvasPoint[0] - pivotX;
  const dy = canvasPoint[1] - pivotY;

  return [pivotX + dx * cos - dy * sin, pivotY + dx * sin + dy * cos];
}

/**
 * The canvas point that the video turns about: the anchor canvas point of
 * the mapping, which stays on the anchor world point.
 */
export function getVideoRotationPivot(
  mapping: VideoCanvasMapping
): [number, number] {
  return [
    mapping.containerWidth * mapping.anchorCanvas[0],
    mapping.containerHeight * mapping.anchorCanvas[1],
  ];
}

export function getPanForVideoCanvasMapping(
  mapping: VideoCanvasMapping
): [number, number] {
  return [
    mapping.left / mapping.worldToCanvasRatio,
    mapping.top / mapping.worldToCanvasRatioY,
  ];
}

export function getAnchorWorldForPan(
  pan: [number, number],
  mapping: VideoCanvasMapping
): [number, number] {
  return [
    (mapping.containerWidth * mapping.anchorCanvas[0]) /
      mapping.worldToCanvasRatio -
      pan[0],
    (mapping.containerHeight * mapping.anchorCanvas[1]) /
      mapping.worldToCanvasRatioY -
      pan[1],
  ];
}

function cloneAnchorWorld(
  anchorWorld?: [number, number]
): [number, number] | undefined {
  return anchorWorld ? [anchorWorld[0], anchorWorld[1]] : undefined;
}

function cloneAnchorCanvas(anchorCanvas: ViewAnchor): ViewAnchor {
  return [anchorCanvas[0], anchorCanvas[1]];
}
