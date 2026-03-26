import {
  BaseVolumeViewport,
  StackViewport,
  Enums,
  type Types,
} from '@cornerstonejs/core';

export type ViewportLabelmapRenderMode = 'image' | 'volume' | 'unsupported';

export default function getViewportLabelmapRenderMode(
  viewport: Types.IViewport
): ViewportLabelmapRenderMode {
  const compatibilityViewport = viewport as Types.IViewport & {
    getCurrentImageId?: () => string;
    getDefaultActor?: () => Types.ActorEntry | undefined;
    getVolumeId?: () => string | undefined;
    type?: string;
  };

  if (viewport instanceof BaseVolumeViewport) {
    return 'volume';
  }

  if (viewport instanceof StackViewport) {
    return 'image';
  }

  const defaultActor =
    typeof compatibilityViewport.getDefaultActor === 'function'
      ? compatibilityViewport.getDefaultActor()
      : undefined;
  const actorMapper = defaultActor?.actorMapper as
    | {
        renderMode?: string;
      }
    | undefined;
  const renderMode = actorMapper?.renderMode;

  if (renderMode === 'vtkVolume' || renderMode === 'vtkVolumeSlice') {
    return 'volume';
  }

  if (renderMode === 'cpuVolume') {
    return 'volume';
  }

  if (renderMode === 'vtkImage' || renderMode === 'cpu2d') {
    return 'image';
  }

  const actorClassName =
    typeof defaultActor?.actor?.getClassName === 'function'
      ? defaultActor.actor.getClassName()
      : undefined;

  if (actorClassName === 'vtkVolume') {
    return 'volume';
  }

  if (actorClassName === 'vtkImageSlice') {
    return 'image';
  }

  if (actorClassName === 'CanvasActor') {
    const defaultActorRenderMode = actorMapper?.renderMode;

    if (defaultActorRenderMode === 'cpuVolume') {
      return 'volume';
    }

    return 'image';
  }

  if (compatibilityViewport.type === Enums.ViewportType.PLANAR_V2) {
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
