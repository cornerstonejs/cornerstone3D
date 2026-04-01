import {
  type Types,
  getEnabledElement,
  addVolumesToViewports,
  Enums,
  cache,
  volumeLoader,
  utilities,
} from '@cornerstonejs/core';
import type {
  LabelmapSegmentationData,
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../../types/LabelmapTypes';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import {
  triggerSegmentationDataModified,
  triggerSegmentationModified,
} from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import { SegmentationRepresentations } from '../../../enums';
import { addVolumesAsIndependentComponents } from './addVolumesAsIndependentComponents';
import type { LabelmapRenderingConfig } from '../../../types/SegmentationStateTypes';
import getViewportLabelmapRenderMode from '../../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode';
import {
  canRenderVolumeViewportLabelmapAsImage,
  shouldUseSliceRendering,
} from '../../../stateManagement/segmentation/helpers/labelmapImageMapperSupport';
import { getLabelmaps } from '../../../stateManagement/segmentation/helpers/labelmapSegmentationState';
import { addVolumeLabelmapImageMapperActors } from './volumeLabelmapImageMapper';
import { syncStackLabelmapActors } from './syncStackLabelmapActors';

const { uuidv4 } = utilities;

type PlanarNextVolumeViewport = Types.IViewport & {
  getCamera: () => Types.ICamera;
  getCurrentImageIdIndex?: () => number;
  getDefaultActor?: () =>
    | (Types.ActorEntry & {
        actorMapper?: {
          renderMode?: string;
        };
      })
    | undefined;
  getVolumeId: () => string | undefined;
  getViewReference: (
    specifier?: Types.ViewReferenceSpecifier
  ) => Types.ViewReference;
  getActor?: (actorUID: string) => Types.ActorEntry | undefined;
  render?: () => void;
  setData: (
    dataId: string,
    options: {
      orientation?: unknown;
      renderMode: 'cpuVolume' | 'vtkVolumeSlice';
    }
  ) => Promise<string>;
  setDataPresentation: (
    dataId: string,
    props: {
      blendMode?: Enums.BlendModes;
      visible?: boolean;
    }
  ) => void;
  setViewReference: (viewReference: Types.ViewReference) => void;
  type: string;
};

/**
 * It adds a labelmap segmentation representation of the viewport's HTML Element.
 * NOTE: This function should not be called directly.
 *
 * @param element - The element that will be rendered.
 * @param labelMapData - The labelmap segmentation data.
 * @param segmentationId - The segmentation id of the labelmap.
 *
 * @internal
 */
async function addLabelmapToElement(
  element: HTMLDivElement,
  labelMapData: LabelmapSegmentationData,
  segmentationId: string,
  config: LabelmapRenderingConfig
): Promise<void | { uid: string; actor }> {
  const enabledElement = getEnabledElement(element);
  const { renderingEngine, viewport } = enabledElement;
  const { id: viewportId } = viewport;

  // Default to true since we are setting a new segmentation, however,
  // in the event listener, we will make other segmentations visible/invisible
  // based on the config
  const visibility = true;
  const immediateRender = false;
  const suppressEvents = true;
  const segmentation = getSegmentation(segmentationId);
  const useSliceRendering = shouldUseSliceRendering(segmentation, config);
  const renderMode = getViewportLabelmapRenderMode(viewport, {
    useSliceRendering,
  });

  if (renderMode === 'volume') {
    const volumeCompatibleViewport = viewport as Types.IVolumeViewport & {
      getVolumeId?: () => string;
    };
    const labelmapLayers = getLabelmaps(segmentation).filter(
      (layer) => !!layer.volumeId
    );

    if (!labelmapLayers.length) {
      const volumeLabelMapData = labelMapData as LabelmapSegmentationDataVolume;
      const volumeId = _ensureVolumeHasVolumeId(
        volumeLabelMapData,
        segmentationId
      );

      if (!cache.getVolume(volumeId)) {
        await _handleMissingVolume(labelMapData);
      }

      labelmapLayers.push({
        labelmapId: volumeId,
        type: 'volume',
        volumeId,
        imageIds: cache.getVolume(volumeId)?.imageIds,
      });
    }

    let blendMode =
      config?.blendMode ?? Enums.BlendModes.MAXIMUM_INTENSITY_BLEND;

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
      representationUID: `${segmentationId}-${SegmentationRepresentations.Labelmap}-${layer.labelmapId}`,
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
     * dding the segmentation as a separate component (e.g., component 2) to the
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
        renderingEngine,
        volumeInputs,
        [viewportId],
        immediateRender,
        suppressEvents
      );
    } else {
      const result = await addVolumesAsIndependentComponents({
        viewport: volumeCompatibleViewport,
        volumeInputs,
        segmentationId,
      });

      return result;
    }
  } else if (renderMode === 'image') {
    if (useSliceRendering && canRenderVolumeViewportLabelmapAsImage(viewport)) {
      addVolumeLabelmapImageMapperActors({
        viewport,
        segmentation,
        segmentationId,
      });
    } else {
      syncStackLabelmapActors(viewport as Types.IStackViewport, segmentationId);
    }
  } else {
    return;
  }

  // Just to make sure if the segmentation data had value before, it gets updated too
  triggerSegmentationDataModified(segmentationId);
}

function isPlanarNextVolumeViewport(
  viewport: Types.IViewport
): viewport is PlanarNextVolumeViewport {
  const nextViewport = viewport as Partial<PlanarNextVolumeViewport>;

  return (
    nextViewport.type === Enums.ViewportType.PLANAR_V2 &&
    typeof nextViewport.getCamera === 'function' &&
    typeof nextViewport.getVolumeId === 'function' &&
    typeof nextViewport.getViewReference === 'function' &&
    typeof nextViewport.setData === 'function' &&
    typeof nextViewport.setDataPresentation === 'function' &&
    typeof nextViewport.setViewReference === 'function'
  );
}

function getPlanarNextVolumeRenderMode(
  viewport: PlanarNextVolumeViewport
): 'cpuVolume' | 'vtkVolumeSlice' | undefined {
  const renderMode = viewport.getDefaultActor?.()?.actorMapper?.renderMode;

  if (renderMode === 'cpuVolume' || renderMode === 'vtkVolumeSlice') {
    return renderMode;
  }
}

async function addLabelmapToPlanarNextViewport(args: {
  blendMode: Enums.BlendModes;
  labelmapLayers: Array<{
    imageIds?: string[];
    labelmapId: string;
    volumeId?: string;
  }>;
  segmentationId: string;
  viewport: PlanarNextVolumeViewport;
  visibility: boolean;
}): Promise<void | { uid: string; actor }> {
  const { blendMode, labelmapLayers, segmentationId, viewport, visibility } =
    args;
  const renderMode = getPlanarNextVolumeRenderMode(viewport);

  if (!renderMode) {
    return;
  }

  const sourceVolumeId = viewport.getVolumeId();
  const sourceViewReference = sourceVolumeId
    ? viewport.getViewReference({ volumeId: sourceVolumeId })
    : viewport.getViewReference();
  const requestedOrientation = (
    viewport.getCamera() as {
      orientation?: unknown;
    }
  ).orientation;
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

    const representationUID = `${segmentationId}-${SegmentationRepresentations.Labelmap}-${layer.labelmapId}`;
    const dataId = representationUID;

    utilities.viewportNextDataSetMetadataProvider.add(dataId, {
      kind: 'planar',
      imageIds: volume.imageIds,
      initialImageIdIndex: Math.min(
        currentImageIdIndex,
        Math.max(volume.imageIds.length - 1, 0)
      ),
      referencedId: layer.volumeId,
      representationUID,
      volumeId: layer.volumeId,
    });

    await viewport.setData(dataId, {
      orientation: requestedOrientation,
      renderMode,
    });
    viewport.setDataPresentation(dataId, {
      blendMode,
      visible: visibility,
    });

    firstActorEntry ||= viewport.getActor?.(representationUID);
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

/**
 * Ensures that the volume has a volumeId, generating one if necessary.
 * @param labelMapData - The labelmap segmentation data.
 * @param segmentationId - The segmentation id.
 * @returns The ensured volumeId.
 */
function _ensureVolumeHasVolumeId(
  labelMapData: LabelmapSegmentationDataVolume,
  segmentationId: string
): string {
  let { volumeId } = labelMapData;
  if (!volumeId) {
    volumeId = uuidv4();

    const segmentation = getSegmentation(segmentationId);
    segmentation.representationData.Labelmap = {
      ...segmentation.representationData.Labelmap,
      volumeId,
    };

    labelMapData.volumeId = volumeId;
    triggerSegmentationModified(segmentationId);
  }
  return volumeId;
}

async function _handleMissingVolume(labelMapData: LabelmapSegmentationData) {
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

export default addLabelmapToElement;
