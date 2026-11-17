import ViewportType from '../enums/ViewportType';
import type {
  ActorEntry,
  IGenericViewport,
  IStackViewport,
  IViewport,
  IVolumeViewport,
  ViewportContentMode,
  VOIRange,
} from '../types';

export type ImageSliceViewport = IViewport &
  Pick<
    IStackViewport,
    'getCurrentImageId' | 'getCurrentImageIdIndex' | 'getImageIds'
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
    viewportHasMethod(viewport, 'getImageIds')
  );
}

/**
 * Whether the viewport has the image of this URI, on the slice that it shows
 * or on another one. A legacy viewport and a legacy adapter answer with
 * `hasImageURI`. A next viewport without that member answers through its
 * view references: the image is viewable after navigation.
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
 * method surface. A legacy compatibility adapter is matched too: it extends
 * the next class, so it has the next API as well as the legacy methods. A
 * legacy viewport class is not matched.
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
 * A Generic ("next") viewport that also exposes the per-display-set source/VOI
 * accessors. These live only on the `PlanarViewport` family (not video / WSI /
 * ECG / 3D), so they are gated by a focused guard rather than declared on
 * `IGenericViewport` — narrowing to this lets the VOI-region / livewire tools
 * read the bound dataId and its default VOI without an inline cast.
 */
export type DisplaySetPresentationViewport = IGenericViewport & {
  getSourceDataId(): string | undefined;
  getDefaultVOIRange(dataId?: string): VOIRange | undefined;
};

export function viewportSupportsDisplaySetPresentation(
  viewport: unknown
): viewport is DisplaySetPresentationViewport {
  return (
    isGenericViewport(viewport) &&
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
 * Use this instead of `instanceof ECGViewport` or
 * `instanceof ECGGenericViewport` — it works for both the legacy and the
 * new Generic viewport family without importing concrete classes.
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
 * The content mode that each legacy viewport type means. A legacy viewport
 * class has no `getCurrentMode`, and it shows one kind of content from the
 * start, so its type gives its mode.
 */
const legacyViewportTypeContentModes: Record<string, ViewportContentMode> = {
  [ViewportType.STACK]: 'stack',
  [ViewportType.ORTHOGRAPHIC]: 'volume',
  [ViewportType.PERSPECTIVE]: 'volume',
  [ViewportType.VOLUME_3D]: 'volume3d',
  [ViewportType.VIDEO]: 'video',
  [ViewportType.WHOLE_SLIDE]: 'wholeSlide',
  [ViewportType.ECG]: 'ecg',
};

/**
 * Returns the content-true mode of the viewport's bound source data.
 *
 * A viewport with `getCurrentMode` answers for itself. A legacy viewport
 * without it gets the mode its legacy `type` means: `stack` for STACK,
 * `volume` for ORTHOGRAPHIC and PERSPECTIVE, `volume3d` for VOLUME_3D,
 * `video`, `wholeSlide` and `ecg` for VIDEO, WHOLE_SLIDE and ECG. Any other
 * viewport gives `undefined`.
 *
 * Unlike the capability guards above (which test method presence), this reports
 * what the viewport is actually showing. A `PLANAR_NEXT` viewport cannot
 * answer that through `viewportSupportsImageSlices` /
 * `viewportSupportsVolumeId` alone, since it supports both regardless of
 * content. See {@link ViewportContentMode}.
 */
export function getViewportContentMode(
  viewport: unknown
): ViewportContentMode | undefined {
  if (viewportHasMethod(viewport, 'getCurrentMode')) {
    return (viewport as IGenericViewport).getCurrentMode();
  }
  const type = (viewport as { type?: unknown } | null | undefined)?.type;

  return typeof type === 'string' &&
    Object.prototype.hasOwnProperty.call(legacyViewportTypeContentModes, type)
    ? legacyViewportTypeContentModes[type]
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
