import { OrientationAxis, ViewportType } from '../../../enums';
import { getShouldUseCPURendering } from '../../../init';
import { ActorRenderMode } from '../../../types';
import type {
  PlanarEffectiveRenderMode,
  PlanarOrientation,
} from './PlanarViewportTypes';

const PLANAR_EFFECTIVE_RENDER_MODES: PlanarEffectiveRenderMode[] = [
  ActorRenderMode.CPU_IMAGE,
  ActorRenderMode.CPU_VOLUME,
  ActorRenderMode.VTK_IMAGE,
  ActorRenderMode.VTK_VOLUME_SLICE,
];

export function isPlanarEffectiveRenderMode(
  value: unknown
): value is PlanarEffectiveRenderMode {
  return PLANAR_EFFECTIVE_RENDER_MODES.includes(
    value as PlanarEffectiveRenderMode
  );
}

export function resolvePlanarViewportRenderMode(args: {
  requestedType?: ViewportType;
  orientation?: PlanarOrientation | null;
  renderMode?: unknown;
}): PlanarEffectiveRenderMode {
  const { requestedType, orientation, renderMode } = args;

  if (renderMode !== undefined) {
    if (isPlanarEffectiveRenderMode(renderMode)) {
      return renderMode;
    }

    throw new Error(
      `[PlanarViewport] Invalid planar viewport renderMode "${String(renderMode)}"`
    );
  }

  const preferVolumeMode =
    requestedType === ViewportType.ORTHOGRAPHIC
      ? true
      : requestedType === ViewportType.STACK
        ? false
        : Boolean(orientation && orientation !== OrientationAxis.ACQUISITION);
  const useCPURendering = getShouldUseCPURendering();

  if (preferVolumeMode) {
    return useCPURendering
      ? ActorRenderMode.CPU_VOLUME
      : ActorRenderMode.VTK_VOLUME_SLICE;
  }

  return useCPURendering
    ? ActorRenderMode.CPU_IMAGE
    : ActorRenderMode.VTK_IMAGE;
}
