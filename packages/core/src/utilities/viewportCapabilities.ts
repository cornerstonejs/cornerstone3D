import type {
  ActorEntry,
  IGenericViewport,
  IStackViewport,
  IViewport,
  IVolumeViewport,
  ViewportContentMode,
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

/**
 * Narrows a viewport to the direct Generic ("next") viewport surface
 * (`setDisplaySets` / `setDisplaySetPresentation` / `setViewState` and the
 * related data/view-state APIs).
 *
 * Use this instead of `instanceof PlanarViewport` (or a `viewport.type` check)
 * when code needs the native-next API rather than the legacy stack/volume
 * method surface. A viewport created with a legacy compatibility adapter is
 * intentionally NOT matched: it exposes the legacy methods, not the direct
 * Generic surface.
 */
export function isGenericViewport(
  viewport: unknown
): viewport is IGenericViewport {
  return (
    viewportHasMethod(viewport, 'setDisplaySets') &&
    viewportHasMethod(viewport, 'setDisplaySetPresentation') &&
    viewportHasMethod(viewport, 'setViewState')
  );
}

/**
 * Returns the content-true mode of the viewport's bound source data when the
 * viewport can classify it (i.e. exposes `getCurrentMode`), otherwise
 * `undefined`.
 *
 * Unlike the capability guards above (which test method presence), this reports
 * what the viewport is actually showing — the question a `PLANAR_NEXT` viewport
 * cannot answer through `viewportSupportsImageSlices` /
 * `viewportSupportsVolumeId` alone, since it supports both regardless of
 * content. See {@link ViewportContentMode}.
 */
export function getViewportContentMode(
  viewport: unknown
): ViewportContentMode | undefined {
  return viewportHasMethod(viewport, 'getCurrentMode')
    ? (viewport as IGenericViewport).getCurrentMode()
    : undefined;
}

/**
 * Returns `true` when the viewport is currently rendering volume-backed content
 * (a volume slice or a 3D volume). Content-true; see {@link getViewportContentMode}.
 */
export function viewportIsInVolumeMode(viewport: unknown): boolean {
  const mode = getViewportContentMode(viewport);
  return mode === 'volume' || mode === 'volume3d';
}

/**
 * Returns `true` when the viewport is currently rendering image-id stack
 * content. Content-true; see {@link getViewportContentMode}.
 */
export function viewportIsInStackMode(viewport: unknown): boolean {
  return getViewportContentMode(viewport) === 'stack';
}
