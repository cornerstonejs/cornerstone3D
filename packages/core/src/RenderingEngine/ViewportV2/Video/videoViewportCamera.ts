import type { ViewAnchor } from '../ViewportCameraTypes';
import type { VideoCamera, VideoProperties } from './VideoViewportV2Types';

export interface VideoCameraLayout {
  left: number;
  top: number;
  width: number;
  height: number;
  containerWidth: number;
  containerHeight: number;
  intrinsicWidth: number;
  intrinsicHeight: number;
  anchorPoint: [number, number];
  anchorView: ViewAnchor;
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
    frame: {
      anchorView: [0.5, 0.5],
      scale: 1,
      scaleMode: 'fit',
      rotation: 0,
    },
  };
}

export function normalizeVideoCamera(camera: VideoCamera): VideoCamera {
  return {
    ...(camera.currentTimeSeconds !== undefined
      ? { currentTimeSeconds: Math.max(0, camera.currentTimeSeconds) }
      : {}),
    frame: {
      anchorView: cloneAnchorView(camera.frame?.anchorView ?? [0.5, 0.5]),
      scale: Math.max(camera.frame?.scale ?? 1, 0.001),
      scaleMode: 'fit',
      rotation: camera.frame?.rotation ?? 0,
      ...(camera.frame?.anchorPoint
        ? {
            anchorPoint: cloneAnchorPoint(camera.frame.anchorPoint),
          }
        : {}),
    },
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

  const zoom = Math.max(camera?.frame?.scale ?? 1, 0.001);
  width *= zoom;
  height *= zoom;

  const worldToCanvasRatio = width / intrinsicWidth;
  const anchorView = cloneAnchorView(camera?.frame?.anchorView ?? [0.5, 0.5]);
  const anchorPoint =
    cloneAnchorPoint(camera?.frame?.anchorPoint) ??
    ([intrinsicWidth / 2, intrinsicHeight / 2] as [number, number]);
  const left =
    containerWidth * anchorView[0] - anchorPoint[0] * worldToCanvasRatio;
  const top =
    containerHeight * anchorView[1] - anchorPoint[1] * worldToCanvasRatio;

  return {
    left,
    top,
    width,
    height,
    containerWidth,
    containerHeight,
    intrinsicWidth,
    intrinsicHeight,
    anchorPoint,
    anchorView,
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

export function getAnchorPointForPan(
  pan: [number, number],
  layout: VideoCameraLayout
): [number, number] {
  return [
    (layout.containerWidth * layout.anchorView[0]) / layout.worldToCanvasRatio -
      pan[0],
    (layout.containerHeight * layout.anchorView[1]) /
      layout.worldToCanvasRatio -
      pan[1],
  ];
}

function cloneAnchorPoint(
  anchorPoint?: [number, number]
): [number, number] | undefined {
  return anchorPoint ? [anchorPoint[0], anchorPoint[1]] : undefined;
}

function cloneAnchorView(anchorView: ViewAnchor): ViewAnchor {
  return [anchorView[0], anchorView[1]];
}
