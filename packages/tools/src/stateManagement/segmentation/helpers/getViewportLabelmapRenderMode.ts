import { Enums, type Types } from '@cornerstonejs/core';
import {
  canRenderVolumeViewportLabelmapAsImage,
  isSliceRenderingEnabled,
} from './labelmapImageMapperSupport';

export type ViewportLabelmapRenderMode = 'image' | 'volume' | 'unsupported';

export default function getViewportLabelmapRenderMode(
  viewport: Types.IViewport,
  options?: {
    useSliceRendering?: boolean;
  }
): ViewportLabelmapRenderMode {
  const compatibilityViewport = viewport as Types.IViewport & {
    getCurrentImageId?: () => string;
    getDefaultActor?: () => Types.ActorEntry | undefined;
    getVolumeId?: () => string | undefined;
    type?: string;
  };
  const useSliceRendering = isSliceRenderingEnabled(options);

  if (useSliceRendering && canRenderVolumeViewportLabelmapAsImage(viewport)) {
    return 'image';
  }

  const contentMode = viewport.getCurrentMode?.();

  if (contentMode === 'volume') {
    return 'volume';
  }

  if (contentMode === 'stack') {
    return 'image';
  }

  const defaultActor =
    typeof compatibilityViewport.getDefaultActor === 'function'
      ? compatibilityViewport.getDefaultActor()
      : undefined;
  const actorClassName =
    typeof defaultActor?.actor?.getClassName === 'function'
      ? defaultActor.actor.getClassName()
      : undefined;

  if (actorClassName === 'vtkVolume') {
    return 'volume';
  }

  if (actorClassName === 'vtkImageSlice' || actorClassName === 'CanvasActor') {
    return 'image';
  }

  if (compatibilityViewport.type === Enums.ViewportType.PLANAR) {
    if (compatibilityViewport.getVolumeId?.()) {
      return 'volume';
    }

    return typeof compatibilityViewport.getCurrentImageId === 'function'
      ? 'image'
      : 'unsupported';
  }

  return typeof compatibilityViewport.getCurrentImageId === 'function'
    ? 'image'
    : 'unsupported';
}
