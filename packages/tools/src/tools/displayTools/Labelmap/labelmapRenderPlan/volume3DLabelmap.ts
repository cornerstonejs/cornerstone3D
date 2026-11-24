import {
  type Types,
  Enums,
  cache,
  displaySetRegistry,
} from '@cornerstonejs/core';
import { createLabelmapRepresentationUID } from '../labelmapRepresentationUID';
import type { LabelmapRenderPlanMountResult } from './types';

type Volume3DViewport = Types.IViewport & {
  addDisplaySet: (
    displaySetId: string,
    options: {
      renderMode: 'vtkVolume3d';
      role: 'source' | 'overlay';
    }
  ) => Promise<void>;
  getActors: () => Types.ActorEntry[];
  render: () => void;
  setDisplaySetAppearance: (
    displaySetId: string,
    props: {
      blendMode?: Enums.BlendModes;
      visible?: boolean;
    }
  ) => void;
  type: string;
};

/** Whether the viewport is a next 3D viewport, direct or through its adapter. */
function isVolume3DViewport(
  viewport: Types.IViewport
): viewport is Volume3DViewport {
  const nextViewport = viewport as Partial<Volume3DViewport>;

  return (
    nextViewport.type === Enums.ViewportType.VOLUME_3D &&
    typeof nextViewport.addDisplaySet === 'function' &&
    typeof nextViewport.setDisplaySetAppearance === 'function'
  );
}

/**
 * Mounts the labelmap volumes of a segmentation on a next 3D viewport as
 * overlay display sets, as the legacy 3D viewport adds them as volumes: each
 * with the blend mode of the labelmap and the representation UID on its
 * actor entry, so that the labelmap style finds and colours it.
 */
async function addLabelmapToVolume3DViewport(args: {
  blendMode: Enums.BlendModes;
  labelmapLayers: Array<{
    imageIds?: string[];
    labelmapId: string;
    volumeId?: string;
  }>;
  segmentationId: string;
  viewport: Volume3DViewport;
  visibility: boolean;
}): Promise<LabelmapRenderPlanMountResult> {
  const { blendMode, labelmapLayers, segmentationId, viewport, visibility } =
    args;
  let firstActorEntry: Types.ActorEntry | undefined;

  for (const layer of labelmapLayers) {
    const volume = layer.volumeId ? cache.getVolume(layer.volumeId) : undefined;

    if (!volume) {
      continue;
    }

    const representationUID = createLabelmapRepresentationUID({
      segmentationId,
      referencedId: layer.labelmapId,
    });

    displaySetRegistry.add(representationUID, {
      imageIds: volume.imageIds,
      volumeId: volume.volumeId,
      reference: {
        kind: 'segmentation',
        segmentationId,
        representationUID,
        labelmapId: layer.labelmapId,
      },
    });
    await viewport.addDisplaySet(representationUID, {
      renderMode: 'vtkVolume3d',
      role: 'overlay',
    });
    viewport.setDisplaySetAppearance(representationUID, {
      blendMode,
      visible: visibility,
    });

    firstActorEntry ||= viewport
      .getActors()
      .find((actorEntry) => actorEntry.representationUID === representationUID);
  }

  viewport.render();

  if (firstActorEntry) {
    return {
      uid: firstActorEntry.uid,
      actor: firstActorEntry.actor,
    };
  }
}

export { addLabelmapToVolume3DViewport, isVolume3DViewport };
