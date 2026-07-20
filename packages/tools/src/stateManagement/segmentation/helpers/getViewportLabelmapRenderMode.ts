import {
  ActorRenderMode,
  BaseVolumeViewport,
  StackViewport,
  Enums,
  isImageRenderMode,
  isVolumeRenderMode,
  type Types,
} from '@cornerstonejs/core';
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
        renderMode?: Types.ActorRenderMode;
      }
    | undefined;
  const renderMode = actorMapper?.renderMode;

  // Registered render modes (including extension backends such as the webgpu
  // image mode) resolve through the render-backend registry; the literal
  // checks below remain for legacy modes the registry does not know about.
  if (renderMode && isVolumeRenderMode(renderMode)) {
    return 'volume';
  }

  if (renderMode && isImageRenderMode(renderMode)) {
    return 'image';
  }

  if (
    renderMode === ActorRenderMode.VTK_VOLUME ||
    renderMode === ActorRenderMode.VTK_VOLUME_SLICE
  ) {
    return 'volume';
  }

  if (renderMode === ActorRenderMode.CPU_VOLUME) {
    return 'volume';
  }

  if (
    renderMode === ActorRenderMode.VTK_IMAGE ||
    renderMode === ActorRenderMode.CPU_IMAGE
  ) {
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

    if (defaultActorRenderMode === ActorRenderMode.CPU_VOLUME) {
      return 'volume';
    }

    return 'image';
  }

  if (compatibilityViewport.type === Enums.ViewportType.PLANAR_NEXT) {
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
