import type { Types } from '@cornerstonejs/core';
import { getRenderingEngine } from '@cornerstonejs/core';

type SyncedAppearance = {
  voiRange?: Types.VOIRange;
  invert?: boolean;
  colormap?: Types.ColormapPublic;
};

type SyncedKey = keyof SyncedAppearance;

type AppearanceViewport = Types.IViewport & {
  getDisplaySetIdForVolumeId?: (volumeId: string) => string | undefined;
  getDisplaySets(): Array<{ displaySetId: string }>;
  getSourceDisplaySetId?: () => string | undefined;
  setDisplaySetAppearance(
    displaySetId: string,
    props: Partial<SyncedAppearance>
  ): void;
  resetDisplaySetAppearance(
    displaySetId?: string,
    keys?: ReadonlyArray<SyncedKey>
  ): void;
};

/**
 * The keys of the appearance that the synchronizer copies: the window, the
 * invert with `syncInvertState`, the colormap with `syncColormap`.
 */
function getSyncedKeys(options?: {
  syncInvertState?: boolean;
  syncColormap?: boolean;
}): SyncedKey[] {
  return [
    'voiRange',
    ...(options?.syncInvertState ? (['invert'] as const) : []),
    ...(options?.syncColormap ? (['colormap'] as const) : []),
  ];
}

/**
 * The display set of a next viewport that shows this volume, found through
 * its display sets and its view references, for a viewport without
 * `getDisplaySetIdForVolumeId`.
 */
function getDisplaySetIdOfVolume(
  viewport: AppearanceViewport,
  volumeId: string
): string | undefined {
  if (typeof viewport.getDisplaySetIdForVolumeId === 'function') {
    return viewport.getDisplaySetIdForVolumeId(volumeId);
  }

  return viewport
    .getDisplaySets()
    .map(({ displaySetId }) => displaySetId)
    .find((displaySetId) =>
      viewport.isReferenceViewable({ displaySetId, volumeId })
    );
}

/**
 * The display set of the target that takes the change: the same display
 * set when the target shows it; else the display set that shows the same
 * volume; else, for a change of the source of a stack, the source of the
 * target, as two stacks of two series are synchronised. Undefined when the
 * change names a volume that the target does not show, as a fusion overlay
 * that is not mounted there yet: its own mount gives it its appearance.
 */
function getTargetDisplaySetId(
  viewport: AppearanceViewport,
  detail: Types.EventTypes.DisplaySetAppearanceChangedEventDetail
): string | undefined {
  const { displaySetId, volumeId, role } = detail;
  const mounted = viewport
    .getDisplaySets()
    .some((entry) => entry.displaySetId === displaySetId);

  if (mounted) {
    return displaySetId;
  }

  if (volumeId) {
    return getDisplaySetIdOfVolume(viewport, volumeId);
  }

  if (role === 'source') {
    return (
      viewport.getSourceDisplaySetId?.() ??
      viewport.getDisplaySets()[0]?.displaySetId
    );
  }

  return undefined;
}

/**
 * Synchronizer callback that gives the target viewport the window, and with
 * the options the invert and the colormap, of a display set of the source
 * viewport.
 *
 * It acts only on what a caller did: an `'edit'` (a call of
 * `setDisplaySetAppearance`) and a `'reset'` (a call of
 * `resetDisplaySetAppearance`). A `'mount'` and a `'default'` (a scroll to
 * an image with another default window) are not copied: they carry no
 * override, and writing their window into the target would turn a default
 * into an explicit override there.
 *
 * - An `'edit'` copies the overrides of the synced keys that changed; a key
 *   whose override the edit removed is reset in the target.
 * - A `'reset'` resets the same keys in the target, so the target goes back
 *   to its own defaults. It does not copy the effective values of the
 *   source, which are defaults of the source.
 *
 * @param synchronizerInstance - The Instance of the Synchronizer
 * @param sourceViewport - The list of IDs defining the source viewport.
 * @param targetViewport - The list of IDs defining the target viewport.
 * @param modifiedEvent - The DISPLAY_SET_APPEARANCE_CHANGED event.
 * @param options - Options for the synchronizer.
 */
export default function voiSyncCallback(
  synchronizerInstance,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId,
  modifiedEvent: Types.EventTypes.DisplaySetAppearanceChangedEvent,
  options?: { syncInvertState?: boolean; syncColormap?: boolean }
): void {
  const detail = modifiedEvent.detail;
  const { cause, changedKeys, overrides } = detail;

  if (cause !== 'edit' && cause !== 'reset') {
    return;
  }

  const keys = getSyncedKeys(options).filter((key) =>
    changedKeys.includes(key)
  );

  if (!keys.length) {
    return;
  }

  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineId);
  if (!renderingEngine) {
    throw new Error(
      `Rendering Engine does not exist: ${targetViewport.renderingEngineId}`
    );
  }

  const tViewport = renderingEngine.getViewport(
    targetViewport.viewportId
  ) as AppearanceViewport;
  const displaySetId = getTargetDisplaySetId(tViewport, detail);

  if (!displaySetId) {
    return;
  }

  const copied = keys.filter((key) => cause === 'edit' && key in overrides);
  const removed = keys.filter((key) => !copied.includes(key));

  if (removed.length) {
    tViewport.resetDisplaySetAppearance(displaySetId, removed);
  }

  if (copied.length) {
    tViewport.setDisplaySetAppearance(
      displaySetId,
      Object.fromEntries(copied.map((key) => [key, overrides[key]]))
    );
  }

  tViewport.render();
}
