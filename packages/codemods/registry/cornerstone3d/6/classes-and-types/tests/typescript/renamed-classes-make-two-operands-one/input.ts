/* eslint-disable no-duplicate-case */
import {
  GenericVolumeViewport3D,
  VolumeViewport3D,
  LegacyVolumeViewport3D,
  VideoViewport,
  VideoGenericViewport,
  ECGViewport,
  ECGGenericViewport,
  WSIViewport,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

export function is3D(viewport: Types.IViewport) {
  return (
    viewport instanceof VolumeViewport3D ||
    viewport instanceof GenericVolumeViewport3D
  );
}

export function isNotVideo(viewport: Types.IViewport) {
  return (
    !(viewport instanceof VideoGenericViewport) &&
    !(viewport instanceof VideoViewport)
  );
}

const SIGNAL_CLASSES = [ECGViewport, ECGGenericViewport];

export function isSignal(viewport: Types.IViewport) {
  return SIGNAL_CLASSES.includes(viewport.constructor);
}

export function laneOf(viewport: Types.IViewport) {
  switch (viewport.constructor) {
    case VideoViewport:
      return 'legacy';
    case VideoGenericViewport:
      return 'next';
    default:
      return 'other';
  }
}

export const classesToRegister = [VideoViewport, VideoGenericViewport];

export function isVideoOrSlide(viewport: Types.IViewport) {
  return (
    viewport instanceof VideoGenericViewport || viewport instanceof WSIViewport
  );
}

export function twoCastsOfOneValue(viewport: Types.IViewport) {
  return (
    (viewport as Types.IStackViewport).id ||
    (viewport as Types.IVolumeViewport).id
  );
}

export function isLegacy3D(viewport: Types.IViewport) {
  return (
    viewport instanceof LegacyVolumeViewport3D &&
    !(viewport instanceof GenericVolumeViewport3D)
  );
}
