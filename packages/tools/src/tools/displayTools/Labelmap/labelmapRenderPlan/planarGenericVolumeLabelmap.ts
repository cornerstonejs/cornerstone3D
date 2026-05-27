import {
  ActorRenderMode,
  type Types,
  Enums,
  cache,
  utilities,
} from '@cornerstonejs/core';
import { createLabelmapRepresentationUID } from '../labelmapRepresentationUID';
import type { LabelmapRenderPlanMountResult } from './types';

type PlanarNextVolumeViewport = Types.IViewport & {
  getCurrentImageIdIndex?: () => number;
  getDefaultActor?: () =>
    | (Types.ActorEntry & {
        actorMapper?: {
          renderMode?: Types.ActorRenderMode;
        };
      })
    | undefined;
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
  setDisplaySetPresentation: (
    dataId: string,
    props: {
      blendMode?: Enums.BlendModes;
      visible?: boolean;
    }
  ) => void;
  setViewReference: (viewReference: Types.ViewReference) => void;
  type: string;
};

function isPlanarNextVolumeViewport(
  viewport: Types.IViewport
): viewport is PlanarNextVolumeViewport {
  const genericViewport = viewport as Partial<PlanarNextVolumeViewport>;

  return (
    genericViewport.type === Enums.ViewportType.PLANAR_NEXT &&
    typeof genericViewport.getVolumeId === 'function' &&
    typeof genericViewport.getViewReference === 'function' &&
    typeof genericViewport.getViewState === 'function' &&
    typeof genericViewport.addDisplaySet === 'function' &&
    typeof genericViewport.setDisplaySetPresentation === 'function' &&
    typeof genericViewport.setViewReference === 'function'
  );
}

async function addLabelmapToPlanarGenericViewport(args: {
  blendMode: Enums.BlendModes;
  labelmapLayers: Array<{
    imageIds?: string[];
    labelmapId: string;
    volumeId?: string;
  }>;
  segmentationId: string;
  viewport: PlanarNextVolumeViewport;
  visibility: boolean;
}): Promise<LabelmapRenderPlanMountResult> {
  const { blendMode, labelmapLayers, segmentationId, viewport, visibility } =
    args;
  const sourceVolumeRenderMode = getPlanarNextVolumeRenderMode(viewport);

  if (!sourceVolumeRenderMode) {
    return;
  }

  const sourceVolumeId = viewport.getVolumeId();
  const sourceViewReference = sourceVolumeId
    ? viewport.getViewReference({ volumeId: sourceVolumeId })
    : viewport.getViewReference();
  const requestedOrientation = viewport.getViewState().orientation;
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
    const dataId = representationUID;

    utilities.genericViewportDataSetMetadataProvider.add(dataId, {
      kind: 'planar',
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

    await viewport.addDisplaySet(dataId, {
      orientation: requestedOrientation,
      role: 'overlay',
    });
    viewport.setDisplaySetPresentation(dataId, {
      blendMode,
      visible: visibility,
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

function getPlanarNextVolumeRenderMode(
  viewport: PlanarNextVolumeViewport
):
  | Types.ActorRenderMode.CPU_VOLUME
  | Types.ActorRenderMode.VTK_VOLUME_SLICE
  | undefined {
  const renderMode = viewport.getDefaultActor?.()?.actorMapper?.renderMode;

  if (
    renderMode === ActorRenderMode.CPU_VOLUME ||
    renderMode === ActorRenderMode.VTK_VOLUME_SLICE
  ) {
    return renderMode;
  }
}

export {
  addLabelmapToPlanarGenericViewport,
  isPlanarNextVolumeViewport,
  type PlanarNextVolumeViewport,
};
