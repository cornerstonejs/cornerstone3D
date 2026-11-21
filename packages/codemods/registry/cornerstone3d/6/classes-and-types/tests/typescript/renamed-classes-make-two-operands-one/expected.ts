/* eslint-disable no-duplicate-case */
import {
  VolumeViewport3D,
  VideoViewport,
  ECGViewport,
  WSIViewport,
} from '@cornerstonejs/core';
import type { Types, PlanarViewport } from '@cornerstonejs/core';

export function is3D(viewport: Types.IViewport) {
  return (
    viewport instanceof VolumeViewport3D ||
    viewport instanceof VolumeViewport3D
  );
}

export function isNotVideo(viewport: Types.IViewport) {
  return (
    !(viewport instanceof VideoViewport) &&
    !(viewport instanceof VideoViewport)
  );
}

const SIGNAL_CLASSES = [ECGViewport, ECGViewport];

export function isSignal(viewport: Types.IViewport) {
  return SIGNAL_CLASSES.includes(viewport.constructor);
}

export function laneOf(viewport: Types.IViewport) {
  switch (viewport.constructor) {
    case VideoViewport:
      return 'legacy';
    case VideoViewport:
      return 'next';
    default:
      return 'other';
  }
}

export const classesToRegister = [VideoViewport, VideoViewport];

export function isVideoOrSlide(viewport: Types.IViewport) {
  return (
    viewport instanceof VideoViewport || viewport instanceof WSIViewport
  );
}

export function twoCastsOfOneValue(viewport: Types.IViewport) {
  return (
    (viewport as PlanarViewport).id ||
    (viewport as PlanarViewport).id
  );
}

export function isLegacy3D(viewport: Types.IViewport) {
  return (
    viewport instanceof VolumeViewport3D &&
    !(viewport instanceof VolumeViewport3D)
  );
}
