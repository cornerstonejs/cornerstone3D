import type {
  Types,
  PlanarViewport,
  VolumeViewport3D,
} from '@cornerstonejs/core';
import { Enums } from '@cornerstonejs/core';

const { ViewportType } = Enums;

function legacyType(viewport: unknown): Enums.ViewportType | undefined {
  return (viewport as { type?: Enums.ViewportType }).type;
}

export function isOrthographic(
  viewport: unknown
): viewport is PlanarViewport {
  return legacyType(viewport) === ViewportType.ORTHOGRAPHIC;
}

export function is3D(viewport: unknown): viewport is Types.IVolumeViewport {
  return legacyType(viewport) === ViewportType.VOLUME_3D;
}

export function isVolume(
  viewport: unknown
): viewport is Types.IBaseVolumeViewport {
  const type = legacyType(viewport);
  return type === ViewportType.ORTHOGRAPHIC || type === ViewportType.VOLUME_3D;
}

export const is3DArrow = (
  viewport: unknown
): viewport is Types.IVolumeViewport =>
  legacyType(viewport) === ViewportType.VOLUME_3D;

export function mock3D(base: object) {
  return {
    ...base,
    type: ViewportType.VOLUME_3D,
  } as unknown as VolumeViewport3D;
}

export function mockOrthographic(base: object) {
  return {
    ...base,
    type: Enums.ViewportType.ORTHOGRAPHIC,
  } as unknown as PlanarViewport;
}

export function mockOverridden(base: object) {
  return {
    type: ViewportType.VOLUME_3D,
    ...base,
  } as unknown as Types.IVolumeViewport;
}
