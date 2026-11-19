import type {
  ActorEntry,
  IViewport,
  ViewportContentMode,
  VOIRange,
} from '../types';

/**
 * A viewport that shows the images of a list of image ids: a planar, video,
 * whole slide or ECG viewport.
 */
export type ImageSliceViewport = IViewport & {
  getCurrentImageId(): string | undefined;
  getCurrentImageIdIndex(): number;
  getImageIds(): string[];
};

export type StackCalibrationViewport = ImageSliceViewport & {
  calibrateSpacing(imageId: string): void;
};

/** A viewport that can say whether it shows a volume: planar or 3D. */
export type VolumeIdViewport = IViewport & {
  hasVolumeId(volumeId: string): boolean;
};

/** A viewport that can say whether it shows the volume of a URI. */
export type VolumeURIViewport = IViewport & {
  hasVolumeURI(volumeURI: string): boolean;
};

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
    viewportHasMethod(viewport, 'getImageIds')
  );
}

/**
 * Whether the viewport has the image of this URI, on the slice that it shows
 * or on another one. A viewport with `hasImageURI` answers with it. A
 * viewport without that member answers through its view references: the
 * image is viewable after navigation.
 */
export function viewportHasImageURI(
  viewport: IViewport,
  imageURI: string
): boolean {
  if (viewportHasMethod(viewport, 'hasImageURI')) {
    return Boolean(viewport.hasImageURI(imageURI));
  }

  return viewport.isReferenceViewable(
    { referencedImageURI: imageURI },
    { withNavigation: true }
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

function viewportHasDisplaySetApi(viewport: unknown): viewport is IViewport {
  return (
    viewportHasMethod(viewport, 'setDisplaySets') &&
    viewportHasMethod(viewport, 'setDisplaySetPresentation') &&
    viewportHasMethod(viewport, 'setViewState')
  );
}

/**
 * Whether the value is a viewport. Since 6.0 every viewport is one of the
 * families of `GenericViewport`, so this is true for every viewport and
 * false for a value that is not a viewport.
 *
 * @deprecated Every viewport has the members of `Types.IViewport` in 6.0, so
 * a viewport needs no narrowing. To narrow to a family, use
 * `viewportSupportsDisplaySetPresentation`, `getViewportContentMode` or the
 * class of the family.
 */
export function isGenericViewport(viewport: unknown): viewport is IViewport {
  return viewportHasDisplaySetApi(viewport);
}

/**
 * A viewport that also exposes the per-display-set source/VOI accessors.
 * These live only on the `PlanarViewport` family (not video / WSI / ECG /
 * 3D), so they are gated by a focused guard rather than declared on
 * `IViewport`; narrowing to this lets the VOI-region / livewire tools read
 * the bound dataId and its default VOI without an inline cast.
 *
 * `getCurrentImageId` is a member of the planar family too. The guard does
 * not test for it.
 */
export type DisplaySetPresentationViewport = IViewport & {
  getSourceDataId(): string | undefined;
  getDefaultVOIRange(dataId?: string): VOIRange | undefined;
  getCurrentImageId(): string | undefined;
};

export function viewportSupportsDisplaySetPresentation(
  viewport: unknown
): viewport is DisplaySetPresentationViewport {
  return (
    viewportHasDisplaySetApi(viewport) &&
    viewportHasMethod(viewport, 'getSourceDataId') &&
    viewportHasMethod(viewport, 'getDefaultVOIRange')
  );
}

/**
 * Viewport type narrowed to the waveform (ECG) surface:
 * `getWaveformData` + `getImageData`.
 */
export type WaveformViewport = IViewport & {
  getWaveformData(): unknown;
  getImageData(): unknown;
};

/**
 * Returns `true` when the viewport exposes a waveform (ECG) API.
 *
 * Use this instead of `instanceof ECGGenericViewport`: it works without
 * importing the class.
 */
export function viewportSupportsWaveform(
  viewport: unknown
): viewport is WaveformViewport {
  return (
    viewportHasMethod(viewport, 'getWaveformData') &&
    viewportHasMethod(viewport, 'getImageData')
  );
}

/**
 * Returns the content-true mode of the viewport's bound source data.
 *
 * Every viewport answers for itself through `getCurrentMode`. A viewport
 * without it gives `undefined`; its `type` gives no mode.
 *
 * Unlike the capability guards above (which test method presence), this reports
 * what the viewport is actually showing. A planar viewport cannot
 * answer that through `viewportSupportsImageSlices` /
 * `viewportSupportsVolumeId` alone, since it supports both regardless of
 * content. See {@link ViewportContentMode}.
 */
export function getViewportContentMode(
  viewport: unknown
): ViewportContentMode | undefined {
  if (viewportHasMethod(viewport, 'getCurrentMode')) {
    return (viewport as IViewport).getCurrentMode();
  }

  return undefined;
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
