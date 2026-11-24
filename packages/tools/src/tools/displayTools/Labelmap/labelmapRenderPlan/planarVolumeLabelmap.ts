import {
  type Types,
  Enums,
  cache,
  displaySetRegistry,
} from '@cornerstonejs/core';
import { createLabelmapRepresentationUID } from '../labelmapRepresentationUID';
import type { LabelmapRenderPlanMountResult } from './types';

type PlanarVolumeViewport = Types.IViewport<
  { orientation?: unknown },
  { blendMode?: Enums.BlendModes; slabThickness?: number }
> & {
  getCurrentImageIdIndex?: () => number;
  getVolumeId: () => string | undefined;
  getViewReference: (
    specifier?: Types.ViewReferenceSpecifier
  ) => Types.ViewReference;
  getViewState: () => {
    orientation?: unknown;
  };
  getActors?: () => Types.ActorEntry[];
  render?: () => void;
  addDisplaySet: (
    displaySetId: string,
    options: {
      orientation?: unknown;
      role?: 'source' | 'overlay';
    }
  ) => Promise<void>;
  getSourceDisplaySetId?: () => string | undefined;
  getDisplaySetAppearance?: (displaySetId: string) =>
    | {
        blendMode?: Enums.BlendModes;
        slabThickness?: number;
      }
    | undefined;
  setDisplaySetAppearance: (
    displaySetId: string,
    props: {
      blendMode?: Enums.BlendModes;
      slabThickness?: number;
      visible?: boolean;
    }
  ) => void;
  setViewReference: (viewReference: Types.ViewReference) => void;
  type: string;
};

function isPlanarVolumeViewport(
  viewport: Types.IViewport
): viewport is PlanarVolumeViewport {
  const candidate = viewport as Partial<PlanarVolumeViewport>;

  return (
    candidate.type === Enums.ViewportType.PLANAR &&
    typeof candidate.getVolumeId === 'function' &&
    typeof candidate.getViewReference === 'function' &&
    typeof candidate.getViewState === 'function' &&
    typeof candidate.addDisplaySet === 'function' &&
    typeof candidate.setDisplaySetAppearance === 'function' &&
    typeof candidate.setViewReference === 'function'
  );
}

async function addLabelmapToPlanarVolumeViewport(args: {
  blendMode: Enums.BlendModes;
  labelmapLayers: Array<{
    imageIds?: string[];
    labelmapId: string;
    volumeId?: string;
  }>;
  segmentationId: string;
  viewport: PlanarVolumeViewport;
  visibility: boolean;
}): Promise<LabelmapRenderPlanMountResult> {
  const { blendMode, labelmapLayers, segmentationId, viewport, visibility } =
    args;
  if (viewport.getCurrentMode() !== 'volume') {
    return;
  }

  const sourceVolumeId = viewport.getVolumeId();
  const sourceViewReference = sourceVolumeId
    ? viewport.getViewReference({ volumeId: sourceVolumeId })
    : viewport.getViewReference();
  const requestedOrientation = viewport.getViewState().orientation;
  // A slab-projected source (e.g. MIP) shows structures from the whole slab, so
  // the labelmap must project across the same slab or its labels will only
  // reflect the current slice and misalign with what the user sees.
  const sourceDisplaySetId = viewport.getSourceDisplaySetId?.();
  const sourceSlabThickness = sourceDisplaySetId
    ? viewport.getDisplaySetAppearance?.(sourceDisplaySetId)?.slabThickness
    : undefined;
  const currentImageIdIndex = Math.max(
    0,
    viewport.getCurrentImageIdIndex?.() ?? 0
  );
  let firstActorEntry: Types.ActorEntry | undefined;

  for (const layer of labelmapLayers) {
    if (!layer.volumeId) {
      continue;
    }

    const volume = cache.getVolume(layer.volumeId);

    if (!volume) {
      throw new Error(
        `imageVolume with id: ${layer.volumeId} does not exist, you need to create/allocate the volume first`
      );
    }

    const representationUID = createLabelmapRepresentationUID({
      segmentationId,
      referencedId: layer.labelmapId,
    });
    const displaySetId = representationUID;

    displaySetRegistry.add(displaySetId, {
      imageIds: volume.imageIds,
      initialImageIdIndex: Math.min(
        currentImageIdIndex,
        Math.max(volume.imageIds.length - 1, 0)
      ),
      reference: {
        kind: 'segmentation',
        segmentationId,
        representationUID,
        labelmapId: layer.labelmapId,
      },
      volumeId: layer.volumeId,
    });

    await viewport.addDisplaySet(displaySetId, {
      orientation: requestedOrientation,
      role: 'overlay',
    });
    viewport.setDisplaySetAppearance(displaySetId, {
      blendMode,
      visible: visibility,
      ...(sourceSlabThickness !== undefined
        ? { slabThickness: sourceSlabThickness }
        : {}),
    });

    firstActorEntry ||= viewport
      .getActors?.()
      .find((actorEntry) => actorEntry.representationUID === representationUID);
  }

  viewport.setViewReference(sourceViewReference);
  viewport.render?.();

  if (firstActorEntry) {
    return {
      uid: firstActorEntry.uid,
      actor: firstActorEntry.actor,
    };
  }
}

export {
  addLabelmapToPlanarVolumeViewport,
  isPlanarVolumeViewport,
  type PlanarVolumeViewport,
};
