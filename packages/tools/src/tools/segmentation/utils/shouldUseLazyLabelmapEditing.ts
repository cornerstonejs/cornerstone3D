import {
  ActorRenderMode,
  Enums,
  getEffectiveRenderBackend,
  type Types,
} from '@cornerstonejs/core';
import { getConfig } from '../../../config';

type ViewportWithCPUFallback = Types.IViewport & {
  _cpuFallbackEnabledElement?: unknown;
  useCPURendering?: boolean;
};

const CPU_RENDER_MODES = new Set<Types.ActorRenderMode>([
  ActorRenderMode.CPU_IMAGE,
  ActorRenderMode.CPU_VOLUME,
]);

/**
 * Whether the planar viewports draw on the CPU by default: on a device without
 * WebGL, or with `rendering.planar.renderBackend: 'cpu'`.
 */
function drawsOnCpuByDefault(): boolean {
  return getEffectiveRenderBackend() === Enums.RenderBackends.CPU;
}

function getDefaultActor(viewport: Types.IViewport) {
  try {
    return viewport.getDefaultActor?.();
  } catch {
    return;
  }
}

export function isCPUViewport(viewport?: Types.IViewport): boolean {
  if (!viewport) {
    return drawsOnCpuByDefault();
  }

  const cpuViewport = viewport as ViewportWithCPUFallback;

  if (cpuViewport.useCPURendering === true) {
    return true;
  }

  if (cpuViewport._cpuFallbackEnabledElement) {
    return true;
  }

  const defaultActor = getDefaultActor(viewport);
  const renderMode = defaultActor?.actorMapper?.renderMode;

  if (renderMode && CPU_RENDER_MODES.has(renderMode)) {
    return true;
  }

  const actorClassName =
    typeof defaultActor?.actor?.getClassName === 'function'
      ? defaultActor.actor.getClassName()
      : undefined;

  if (actorClassName === 'CanvasActor') {
    return true;
  }

  return drawsOnCpuByDefault();
}

export function shouldUseLazyLabelmapEditing(
  viewport?: Types.IViewport
): boolean {
  return (
    getConfig().segmentation?.overwriteMode !== undefined ||
    isCPUViewport(viewport)
  );
}
