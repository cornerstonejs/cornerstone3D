import {
  Enums,
  getEffectiveRenderBackend,
  type PlanarViewport,
  type Types,
} from '@cornerstonejs/core';
import { getConfig } from '../../../config';

/**
 * Whether the planar viewports draw on the CPU by default: on a device without
 * WebGL, or with `rendering.planar.renderBackend: 'cpu'`.
 */
function drawsOnCpuByDefault(): boolean {
  return getEffectiveRenderBackend() === Enums.RenderBackends.CPU;
}

function getDefaultActor(viewport: Types.IViewport) {
  try {
    return (
      viewport as Partial<Pick<PlanarViewport, 'getDefaultActor'>>
    ).getDefaultActor?.();
  } catch {
    return;
  }
}

/**
 * Whether the render plan of a planar viewport draws its source layer on the
 * CPU. A viewport without a render plan gives false.
 */
function drawsSourceOnCpu(viewport: Types.IViewport): boolean {
  const plan = (
    viewport as Partial<Pick<PlanarViewport, 'getRenderPlan'>>
  ).getRenderPlan?.();

  return plan?.[0]?.draw === 'cpu';
}

export function isCPUViewport(viewport?: Types.IViewport): boolean {
  if (!viewport) {
    return drawsOnCpuByDefault();
  }

  if (drawsSourceOnCpu(viewport)) {
    return true;
  }

  const defaultActor = getDefaultActor(viewport);
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
