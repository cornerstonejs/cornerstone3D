import {
  type Types,
  addVolumesToViewports,
  Enums,
  cache,
  volumeLoader,
  utilities,
} from '@cornerstonejs/core';
import type { ViewportLabelmapRenderMode } from '../../../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode';
import type {
  LabelmapSegmentationData,
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../../../types/LabelmapTypes';
import type {
  LabelmapRenderingConfig,
  Segmentation,
} from '../../../../types/SegmentationStateTypes';
import {
  triggerSegmentationDataModified,
  triggerSegmentationModified,
} from '../../../../stateManagement/segmentation/triggerSegmentationEvents';
import { getLabelmaps } from '../../../../stateManagement/segmentation/helpers/labelmapSegmentationState';
import { addVolumesAsIndependentComponents } from '../addVolumesAsIndependentComponents';
import { createLabelmapRepresentationUID } from '../labelmapRepresentationUID';
import { createLabelmapRenderPlan } from './createLabelmapRenderPlan';
import {
  addLabelmapToPlanarNextViewport,
  isPlanarNextVolumeViewport,
} from './planarNextVolumeLabelmap';
import type {
  LabelmapRenderPlan,
  LabelmapRenderPlanMountResult,
} from './types';

const { uuidv4 } = utilities;

function createLegacyVolumeLabelmapPlan({
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
    mount: ({ labelMapData }) =>
      mountLegacyVolumeLabelmap({
        config,
        labelMapData,
        segmentation,
        segmentationId,
        viewport,
      }),
  });
}

function getExpectedVolumeLabelmapRepresentationUIDs(
  segmentation: Segmentation,
  segmentationId: string
): string[] {
  return getLabelmaps(segmentation)
    .filter((layer) => !!layer.volumeId)
    .map((layer) =>
      createLabelmapRepresentationUID({
        segmentationId,
        referencedId: layer.labelmapId,
      })
    );
}

async function mountLegacyVolumeLabelmap({
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
  const { id: viewportId } = viewport;

  // Default to true since we are setting a new segmentation, however,
  // in the event listener, we will make other segmentations visible/invisible
  // based on the config
  const visibility = true;
  const immediateRender = false;
  const suppressEvents = true;
  const volumeCompatibleViewport = viewport as Types.IVolumeViewport & {
    getVolumeId?: () => string;
  };
  const labelmapLayers = getLabelmaps(segmentation).filter(
    (layer) => !!layer.volumeId
  );

  if (!labelmapLayers.length) {
    const volumeLabelMapData = labelMapData as LabelmapSegmentationDataVolume;
    const volumeId = ensureVolumeHasVolumeId(volumeLabelMapData, segmentation);

    if (!cache.getVolume(volumeId)) {
      await handleMissingVolume(labelMapData);
    }

    labelmapLayers.push({
      labelmapId: volumeId,
      type: 'volume',
      volumeId,
      imageIds: cache.getVolume(volumeId)?.imageIds,
    });
  }

  let blendMode = config?.blendMode ?? Enums.BlendModes.MAXIMUM_INTENSITY_BLEND;

  let useIndependentComponents =
    blendMode === Enums.BlendModes.LABELMAP_EDGE_PROJECTION_BLEND;

  // Add dimension check before deciding to use independent components
  if (useIndependentComponents) {
    const referenceVolumeId = volumeCompatibleViewport.getVolumeId?.();
    const baseVolume = cache.getVolume(referenceVolumeId);
    const segVolume = cache.getVolume(labelmapLayers[0]?.volumeId);

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
      console.debug(
        'Dimensions mismatch - falling back to regular volume addition'
      );
    }
  }

  const volumeInputs: Types.IVolumeInput[] = labelmapLayers.map((layer) => ({
    volumeId: layer.volumeId,
    visibility,
    representationUID: createLabelmapRepresentationUID({
      segmentationId,
      referencedId: layer.labelmapId,
    }),
    useIndependentComponents,
    blendMode,
  }));

  if (isPlanarNextVolumeViewport(viewport)) {
    return addLabelmapToPlanarNextViewport({
      blendMode,
      labelmapLayers,
      segmentationId,
      viewport,
      visibility,
    });
  }

  /*
   * Having independent components for the segmentation data means that we are
   * adding the segmentation as a separate component (e.g., component 2) to the
   * volume data (component 1, index 0). If the base data is color data, which
   * is an independent component itself, this approach will not work. I'm unsure what
   * a Maximum Intensity Projection (MIP) of color data would be, but it's not
   * the same as the MIP of grayscale data.
   * Another limitation is that if we have multiple segmentation volumes, we
   * cannot add them as independent components to the volume data since the current
   * logic is limited to one. The shader code needs to be updated to handle
   * multiple independent components.
   * Todo: add a check here to identify if the base data is color data and fallback
   * to the default behavior.
   */
  if (!volumeInputs[0].useIndependentComponents) {
    await addVolumesToViewports(
      viewport.getRenderingEngine(),
      volumeInputs,
      [viewportId],
      immediateRender,
      suppressEvents
    );
    triggerSegmentationDataModified(segmentationId);
    return;
  }

  return addVolumesAsIndependentComponents({
    viewport: volumeCompatibleViewport,
    volumeInputs,
    segmentationId,
  });
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

export { createLegacyVolumeLabelmapPlan };
