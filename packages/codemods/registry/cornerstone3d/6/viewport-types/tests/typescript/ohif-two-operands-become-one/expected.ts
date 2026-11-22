/* eslint-disable no-duplicate-case */
import { Enums as csEnums, RenderingEngine } from '@cornerstonejs/core';

const { ViewportType } = csEnums;

type ViewportLike = {
  requestedType?: csEnums.ViewportType;
  type?: csEnums.ViewportType;
};

export function getLegacyViewportType(viewport: unknown): csEnums.ViewportType | undefined {
  const vp = viewport as ViewportLike | null | undefined;
  return vp?.requestedType ?? vp?.type;
}

export function isVolume3DViewportType(viewport: unknown): boolean {
  const legacyType = getLegacyViewportType(viewport);
  return legacyType === ViewportType.VOLUME_3D || legacyType === ViewportType.VOLUME_3D;
}

export function isNotVideo(type: string) {
  return type !== ViewportType.VIDEO && type !== ViewportType.VIDEO;
}

export function isSignalOrSlide(type: string) {
  return (
    (type === ViewportType.ECG) ||
    type === ViewportType.WHOLE_SLIDE ||
    (type === ViewportType.ECG)
  );
}

export function laneOf(type: string) {
  switch (type) {
    case ViewportType.ECG:
      return 'legacy';
    case ViewportType.ECG:
      return 'next';
    case ViewportType.PLANAR:
    case ViewportType.VOLUME_3D:
      return 'next';
    default:
      return 'other';
  }
}

export function isVideo(type: csEnums.ViewportType) {
  return [ViewportType.VIDEO, ViewportType.VIDEO].includes(type);
}

const THREE_D_TYPES = [
  ViewportType.VOLUME_3D,
  ViewportType.VOLUME_3D,
] as const;

export function is3D(type: csEnums.ViewportType) {
  return THREE_D_TYPES.includes(type);
}

export const typesToEnable = [ViewportType.VIDEO, ViewportType.VIDEO];

export function differentTests(type: string, other: string) {
  return (
    type === ViewportType.VIDEO ||
    type === ViewportType.ECG ||
    other === ViewportType.VIDEO
  );
}

export function sameTestTwiceBefore(type: string) {
  return (
    type === ViewportType.VOLUME_3D || type === ViewportType.VOLUME_3D
  );
}

export function innerChain(type: string, ready: boolean) {
  return (
    type === ViewportType.VOLUME_3D ||
    (ready && type === ViewportType.VOLUME_3D)
  );
}

export function stackOrVolume(type: string) {
  return type === ViewportType.STACK || type === ViewportType.ORTHOGRAPHIC;
}

export async function memberAndString(
  engine: RenderingEngine,
  imageIds: string[]
) {
  const viewport = engine.getViewport('stack');

  await viewport.setStack(imageIds);

  return viewport.getCurrentMode() === 'stack' || viewport.getCurrentMode() === 'stack';
}

export function castOperand(type: string) {
  return (
    type === ViewportType.WHOLE_SLIDE ||
    type === (ViewportType.WHOLE_SLIDE as string)
  );
}
