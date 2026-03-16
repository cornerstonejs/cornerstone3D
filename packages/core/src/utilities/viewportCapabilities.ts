import type {
  ActorEntry,
  IStackViewport,
  IViewport,
  IVolumeViewport,
} from '../types';

export type ImageSliceViewport = IViewport &
  Pick<
    IStackViewport,
    | 'getCurrentImageId'
    | 'getCurrentImageIdIndex'
    | 'getImageIds'
    | 'hasImageURI'
  >;

export type StackCompatibilityViewport = ImageSliceViewport &
  Pick<IStackViewport, 'setStack'>;

export type StackCalibrationViewport = ImageSliceViewport & {
  calibrateSpacing(imageId: string): void;
};

export type VolumeCompatibilityViewport = IViewport &
  Pick<IVolumeViewport, 'addVolumes' | 'setVolumes'>;

export type VolumeIdViewport = IViewport & Pick<IVolumeViewport, 'hasVolumeId'>;

export type VolumeURIViewport = IViewport &
  Pick<IVolumeViewport, 'hasVolumeURI'>;

export type VolumeActorViewport = VolumeIdViewport & {
  getActors(): ActorEntry[];
};

function viewportHasMethod<TMethod extends string>(
  viewport: unknown,
  method: TMethod
): viewport is Record<TMethod, (...args: unknown[]) => unknown> {
  return (
    typeof (viewport as Record<TMethod, unknown> | undefined)?.[method] ===
    'function'
  );
}

export function viewportSupportsImageSlices(
  viewport: unknown
): viewport is ImageSliceViewport {
  return (
    viewportHasMethod(viewport, 'getCurrentImageId') &&
    viewportHasMethod(viewport, 'getCurrentImageIdIndex') &&
    viewportHasMethod(viewport, 'getImageIds') &&
    viewportHasMethod(viewport, 'hasImageURI')
  );
}

export function viewportSupportsStackCompatibility(
  viewport: unknown
): viewport is StackCompatibilityViewport {
  return (
    viewportSupportsImageSlices(viewport) &&
    viewportHasMethod(viewport, 'setStack')
  );
}

export function viewportSupportsStackCalibration(
  viewport: unknown
): viewport is StackCalibrationViewport {
  return (
    viewportSupportsImageSlices(viewport) &&
    viewportHasMethod(viewport, 'calibrateSpacing')
  );
}

export function viewportSupportsVolumeCompatibility(
  viewport: unknown
): viewport is VolumeCompatibilityViewport {
  return (
    viewportHasMethod(viewport, 'addVolumes') &&
    viewportHasMethod(viewport, 'setVolumes')
  );
}

export function viewportSupportsVolumeId(
  viewport: unknown
): viewport is VolumeIdViewport {
  return viewportHasMethod(viewport, 'hasVolumeId');
}

export function viewportSupportsVolumeURI(
  viewport: unknown
): viewport is VolumeURIViewport {
  return viewportHasMethod(viewport, 'hasVolumeURI');
}

export function viewportSupportsVolumeActors(
  viewport: unknown
): viewport is VolumeActorViewport {
  return (
    viewportSupportsVolumeId(viewport) &&
    viewportHasMethod(viewport, 'getActors')
  );
}
