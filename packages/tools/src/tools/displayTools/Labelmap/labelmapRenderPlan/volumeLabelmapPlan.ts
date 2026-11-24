import {
  type Types,
  ActorRenderMode,
  Enums,
  cache,
  gpuSettingsForRender,
  gridLimitsOfGpuSettings,
  volumeLoader,
  utilities,
} from '@cornerstonejs/core';
import type { ViewportLabelmapRenderMode } from '../../../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode';
import type {
  LabelmapSegmentationData,
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
  LabelmapLayer,
} from '../../../../types/LabelmapTypes';
import type {
  LabelmapRenderingConfig,
  Segmentation,
} from '../../../../types/SegmentationStateTypes';
import { triggerSegmentationModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';
import {
  getLabelmaps,
  getOrCreateLabelmapVolume,
} from '../../../../stateManagement/segmentation/helpers/labelmapSegmentationState';
import { tagLabelmapVolume } from '../../../../stateManagement/segmentation/labelmapModel/labelmapLayerStore';
import { createLabelmapRepresentationUID } from '../labelmapRepresentationUID';
import {
  createLabelmapRenderPlan,
  getActorEntryRenderMode,
} from './createLabelmapRenderPlan';
import {
  addLabelmapToPlanarVolumeViewport,
  isPlanarVolumeViewport,
} from './planarVolumeLabelmap';
import type {
  LabelmapRenderPlan,
  LabelmapRenderPlanMountResult,
} from './types';
import {
  addLabelmapToVolume3DViewport,
  isVolume3DViewport,
} from './volume3DLabelmap';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';

const cs3dLogger = cornerstoneUtilities.logger.toolsLog.getLogger(
  'tools.displayTools.Labelmap.labelmapRenderPlan.volumeLabelmapPlan'
);

const { uuidv4 } = utilities;

/**
 * The render plan of a labelmap on a viewport that shows a volume: a planar
 * viewport in volume mode, or a 3D viewport. The labelmap volumes are mounted
 * as overlay display sets of the viewport.
 */
function createVolumeLabelmapPlan({
  config,
  isVolumeImageMapper,
  renderMode,
  segmentation,
  segmentationId,
  useSliceRendering,
  viewport,
}: {
  config: LabelmapRenderingConfig;
  isVolumeImageMapper: boolean;
  renderMode: ViewportLabelmapRenderMode;
  segmentation: Segmentation;
  segmentationId: string;
  useSliceRendering: boolean;
  viewport: Types.IViewport;
}): LabelmapRenderPlan {
  return createLabelmapRenderPlan({
    isVolumeImageMapper,
    kind: 'legacy-volume',
    renderMode,
    segmentationId,
    useSliceRendering,
    viewport,
    getExpectedRepresentationUIDs: () =>
      getExpectedVolumeLabelmapRepresentationUIDs(segmentation, segmentationId),
    // An actor surviving from a per-slice image-mapper mount (e.g. after a
    // live render-backend switch remounted it in place) shares this plan's
    // representation UID but not its shape; force a remount through the
    // volume path.
    isActorEntryCompatible: (actorEntry) =>
      !isImageMountedActorEntry(actorEntry),
    mount: ({ labelMapData }) =>
      mountVolumeLabelmap({
        config,
        labelMapData,
        segmentation,
        segmentationId,
        viewport,
      }),
  });
}

function isImageMountedActorEntry(actorEntry: Types.ActorEntry): boolean {
  const renderMode = getActorEntryRenderMode(actorEntry);

  return (
    renderMode === ActorRenderMode.VTK_IMAGE ||
    renderMode === ActorRenderMode.CPU_IMAGE
  );
}

function getExpectedVolumeLabelmapRepresentationUIDs(
  segmentation: Segmentation,
  segmentationId: string
): string[] {
  return getLabelmaps(segmentation)
    .filter(canResolveLayerAsVolume)
    .map((layer) =>
      createLabelmapRepresentationUID({
        segmentationId,
        referencedId: layer.labelmapId,
      })
    );
}

async function mountVolumeLabelmap({
  config,
  labelMapData,
  segmentation,
  segmentationId,
  viewport,
}: {
  config: LabelmapRenderingConfig;
  labelMapData: LabelmapSegmentationData;
  segmentation: Segmentation;
  segmentationId: string;
  viewport: Types.IViewport;
}): Promise<LabelmapRenderPlanMountResult> {
  // Default to true since we are setting a new segmentation, however,
  // in the event listener, we will make other segmentations visible/invisible
  // based on the config
  const visibility = true;
  const volumeCompatibleViewport = viewport as Types.IViewport & {
    getVolumeId?: () => string;
  };
  const labelmapLayers = getVolumeBackedLabelmapLayers(segmentation);

  if (!labelmapLayers.length) {
    const volumeLabelMapData = labelMapData as LabelmapSegmentationDataVolume;
    const volumeId = ensureVolumeHasVolumeId(volumeLabelMapData, segmentation);

    if (!cache.getVolume(volumeId)) {
      await handleMissingVolume(labelMapData);
    }

    labelmapLayers.push({
      labelmapId: volumeId,
      storageKind: 'volume',
      volumeId,
      imageIds: cache.getVolume(volumeId)?.imageIds,
    });
  }

  // Every labelmap reaches the GPU through here, whichever loader built its
  // volume, so the statistic is set before the actor provisions a texture.
  for (const layer of labelmapLayers) {
    tagLabelmapVolume(cache.getVolume(layer.volumeId));
  }

  let blendMode = config?.blendMode ?? Enums.BlendModes.MAXIMUM_INTENSITY_BLEND;

  let useIndependentComponents =
    blendMode === Enums.BlendModes.LABELMAP_EDGE_PROJECTION_BLEND;

  // Add dimension check before deciding to use independent components
  if (useIndependentComponents) {
    const referenceVolumeId = volumeCompatibleViewport.getVolumeId?.();
    const segLabelmapVolumeId = labelmapLayers[0]?.volumeId;
    // Independent-components (edge-projection) rendering requires BOTH the
    // viewport's base/reference volume and the segmentation volume to be present
    // and cached. On a freshly-mounted volume viewport the base actor may not be
    // added yet (getVolumeId() returns undefined), and the seg volume may not be
    // cached yet. Guard both lookups so we never call cache.getVolume(undefined)
    // (which throws "getVolume: volumeId must not be undefined"), falling back to
    // regular volume addition when either is absent.
    const baseVolume = referenceVolumeId
      ? cache.getVolume(referenceVolumeId)
      : undefined;
    const segVolume = segLabelmapVolumeId
      ? cache.getVolume(segLabelmapVolumeId)
      : undefined;

    if (!baseVolume || !segVolume) {
      useIndependentComponents = false;
      blendMode = Enums.BlendModes.MAXIMUM_INTENSITY_BLEND;
      cs3dLogger.debug(
        'Independent components unavailable (missing reference or segmentation volume) - falling back to regular volume addition'
      );
    } else {
      const segDims = segVolume.dimensions;
      const refDims = baseVolume.dimensions;

      if (
        segDims[0] !== refDims[0] ||
        segDims[1] !== refDims[1] ||
        segDims[2] !== refDims[2]
      ) {
        // If dimensions don't match, fallback to regular volume addition
        useIndependentComponents = false;
        blendMode = Enums.BlendModes.MAXIMUM_INTENSITY_BLEND;
        cs3dLogger.debug(
          'Dimensions mismatch - falling back to regular volume addition'
        );
      } else if (!combinedTextureFitsGpuSettings(baseVolume)) {
        useIndependentComponents = false;
        blendMode = Enums.BlendModes.MAXIMUM_INTENSITY_BLEND;
        cs3dLogger.warn(
          `The GPU settings cannot hold the full-resolution two-component texture of edge projection for ${baseVolume.volumeId}, so the labelmap uses a separate actor`
        );
      }
    }
  }

  if (isPlanarVolumeViewport(viewport)) {
    return addLabelmapToPlanarVolumeViewport({
      blendMode,
      labelmapLayers,
      segmentationId,
      viewport,
      visibility,
    });
  }

  if (isVolume3DViewport(viewport)) {
    return addLabelmapToVolume3DViewport({
      blendMode: useIndependentComponents
        ? Enums.BlendModes.MAXIMUM_INTENSITY_BLEND
        : blendMode,
      labelmapLayers,
      segmentationId,
      viewport,
      visibility,
    });
  }
}

/**
 * Whether the GPU settings of a render can hold the full grid of the base
 * volume with two Float32 components, the texture that edge projection was
 * built on. When they cannot, the labelmap takes the maximum intensity blend
 * mode.
 */
function combinedTextureFitsGpuSettings(baseVolume: Types.IImageVolume) {
  const gpuSettings = gpuSettingsForRender();

  return (
    !gpuSettings ||
    utilities.voxelGrid.voxelGridWithinLimits(
      baseVolume.voxelGrid,
      gridLimitsOfGpuSettings(gpuSettings, 2 * Float32Array.BYTES_PER_ELEMENT)
    )
  );
}

function canResolveLayerAsVolume(layer: LabelmapLayer): boolean {
  return Boolean(
    layer.volumeId || layer.geometryVolumeId || layer.imageIds?.length
  );
}

function getVolumeBackedLabelmapLayers(segmentation: Segmentation): Array<
  LabelmapLayer & {
    volumeId: string;
  }
> {
  return getLabelmaps(segmentation)
    .map((layer) => {
      if (layer.volumeId) {
        return layer as LabelmapLayer & { volumeId: string };
      }

      const volume = getOrCreateLabelmapVolume(layer);

      if (!volume?.volumeId) {
        return;
      }

      return {
        ...layer,
        volumeId: volume.volumeId,
      };
    })
    .filter((layer): layer is LabelmapLayer & { volumeId: string } =>
      Boolean(layer)
    );
}

/**
 * Ensures that the volume has a volumeId, generating one if necessary.
 * @param labelMapData - The labelmap segmentation data.
 * @param segmentation - The labelmap segmentation state.
 * @returns The ensured volumeId.
 */
function ensureVolumeHasVolumeId(
  labelMapData: LabelmapSegmentationDataVolume,
  segmentation: Segmentation
): string {
  let { volumeId } = labelMapData;
  if (!volumeId) {
    volumeId = uuidv4();

    segmentation.representationData.Labelmap = {
      ...segmentation.representationData.Labelmap,
      volumeId,
    };

    labelMapData.volumeId = volumeId;
    triggerSegmentationModified(segmentation.segmentationId);
  }
  return volumeId;
}

async function handleMissingVolume(labelMapData: LabelmapSegmentationData) {
  // since this is a labelmap which we don't have volume data for yet, we need
  // to see if there is imageIds and create one for it
  const stackData = labelMapData as LabelmapSegmentationDataStack;
  const hasImageIds = stackData.imageIds.length > 0;

  if (!hasImageIds) {
    throw new Error(
      'cannot create labelmap, no imageIds found for the volume labelmap'
    );
  }

  const volume = await volumeLoader.createAndCacheVolumeFromImages(
    (labelMapData as LabelmapSegmentationDataVolume).volumeId ?? uuidv4(),
    stackData.imageIds
  );

  return volume;
}

export { createVolumeLabelmapPlan };
