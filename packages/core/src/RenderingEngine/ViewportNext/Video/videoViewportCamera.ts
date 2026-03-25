import type { ViewAnchor } from '../ViewportCameraTypes';
import type { VideoCamera, VideoProperties } from './VideoViewportNextTypes';

export interface VideoCameraLayout {
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
  worldToCanvasRatio: number;
}

interface VideoCameraMetrics {
  containerWidth: number;
  containerHeight: number;
  intrinsicWidth: number;
  intrinsicHeight: number;
  objectFit?: VideoProperties['objectFit'];
}

export function createDefaultVideoCamera(): VideoCamera {
  return {
    currentTimeSeconds: 0,
    anchorCanvas: [0.5, 0.5],
    scale: 1,
    scaleMode: 'fit',
    rotation: 0,
  };
}

export function normalizeVideoCamera(camera: VideoCamera): VideoCamera {
  return {
    ...(camera.currentTimeSeconds !== undefined
      ? { currentTimeSeconds: Math.max(0, camera.currentTimeSeconds) }
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

export function getVideoLayout(
  metrics: VideoCameraMetrics & {
    camera?: VideoCamera;
  }
): VideoCameraLayout | undefined {
  const {
    containerWidth,
    containerHeight,
    intrinsicWidth,
    intrinsicHeight,
    objectFit = 'contain',
    camera,
  } = metrics;

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
  const anchorCanvas = cloneAnchorCanvas(camera?.anchorCanvas ?? [0.5, 0.5]);
  const anchorWorld =
    cloneAnchorWorld(camera?.anchorWorld) ??
    ([intrinsicWidth / 2, intrinsicHeight / 2] as [number, number]);
  const left =
    containerWidth * anchorCanvas[0] - anchorWorld[0] * worldToCanvasRatio;
  const top =
    containerHeight * anchorCanvas[1] - anchorWorld[1] * worldToCanvasRatio;

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
  };
}

export function getPanForVideoLayout(
  layout: VideoCameraLayout
): [number, number] {
  return [
    layout.left / layout.worldToCanvasRatio,
    layout.top / layout.worldToCanvasRatio,
  ];
}

export function getAnchorWorldForPan(
  pan: [number, number],
  layout: VideoCameraLayout
): [number, number] {
  return [
    (layout.containerWidth * layout.anchorCanvas[0]) /
      layout.worldToCanvasRatio -
      pan[0],
    (layout.containerHeight * layout.anchorCanvas[1]) /
      layout.worldToCanvasRatio -
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
