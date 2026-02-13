import {
  cache,
  Enums,
  convertMapperToNotSharedMapper,
  volumeLoader,
  eventTarget,
  createVolumeActor,
  type Types,
} from '@cornerstonejs/core';
import { Events, SegmentationRepresentations } from '../../../enums';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import type { BlendMode } from '@kitware/vtk.js/Rendering/Core/VolumeMapper/Constants';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import type { LabelmapSegmentationDataVolume } from '../../../types/LabelmapTypes';

const internalCache = new Map() as Map<
  string,
  {
    added: boolean;
    segmentationRepresentationUID: string;
    originalBlendMode: Enums.BlendModes;
  }
>;

const load = ({ cfun, ofun, actor }) => {
  actor.getProperty().setRGBTransferFunction(1, cfun);
  actor.getProperty().setScalarOpacity(1, ofun);
};

/**
 * Adds segmentation data as an independent component to the volume data.
 *
 * @param options - The options for adding independent components.
 * @param options.viewport - The viewport object.
 * @param options.volumeInputs - An array of volume input objects.
 * @returns - An object containing the UID, actor, and load function.
 */
export async function addVolumesAsIndependentComponents({
  viewport,
  volumeInputs,
  segmentationId,
}: {
  viewport: Types.IVolumeViewport;
  volumeInputs: Types.IVolumeInput[];
  segmentationId: string;
}) {
  // if we are adding the segmentation as independent component we basically
  // need to remove the old actor/mapper and convert it to a new one
  // which the segmentation data is added as a second component to the volume data
  const defaultActor = viewport.getDefaultActor();
  const { actor } = defaultActor as { actor: vtkVolume };
  const { uid } = defaultActor;

  const referenceVolumeId = viewport.getVolumeId();

  if (internalCache.get(uid)?.added) {
    return {
      uid,
      actor,
    };
  }
  const volumeInputArray = volumeInputs;
  const firstImageVolume = cache.getVolume(volumeInputArray[0].volumeId);

  if (!firstImageVolume) {
    throw new Error(
      `imageVolume with id: ${firstImageVolume.volumeId} does not exist`
    );
  }

  const { volumeId } = volumeInputArray[0];

  const segImageVolume = await volumeLoader.loadVolume(volumeId);

  if (!segImageVolume) {
    throw new Error(
      `segImageVolume with id: ${segImageVolume.volumeId} does not exist`
    );
  }

  const segVoxelManager = segImageVolume.voxelManager;
  const segData = segVoxelManager.getCompleteScalarDataArray();

  const { imageData: segImageData } = segImageVolume;
  const baseVolume = cache.getVolume(referenceVolumeId);

  const volumeTexture = baseVolume.vtkOpenGLTexture;
  const hasPendingFrames = volumeTexture.hasUpdatedFrames();
  if (hasPendingFrames) {
    // We do not change the actor if there are pending frames (i.e. the viewport is still rendering).
    // If we did proceed to change the actor, the viewport would be blanked out.
    return;
  }

  const baseVoxelManager = baseVolume.voxelManager;
  const baseData = baseVoxelManager.getCompleteScalarDataArray();

  const newComp = 2;
  const cubeData = new Float32Array(
    newComp * baseVolume.voxelManager.getScalarDataLength()
  );
  const dims = segImageData.getDimensions();
  for (let z = 0; z < dims[2]; ++z) {
    for (let y = 0; y < dims[1]; ++y) {
      for (let x = 0; x < dims[0]; ++x) {
        const iTuple = x + dims[0] * (y + dims[1] * z);
        cubeData[iTuple * newComp + 0] = baseData[iTuple];
        cubeData[iTuple * newComp + 1] = segData[iTuple];
      }
    }
  }

  viewport.removeActors([uid]);
  const oldMapper = actor.getMapper();
  const mapper = convertMapperToNotSharedMapper(oldMapper as vtkVolumeMapper);
  actor.setMapper(mapper);

  mapper.setBlendMode(
    Enums.BlendModes.LABELMAP_EDGE_PROJECTION_BLEND as unknown as BlendMode
  );

  const arrayAgain = mapper.getInputData().getPointData().getArray(0);

  arrayAgain.setData(cubeData);
  arrayAgain.setNumberOfComponents(2);

  const oldColorMixPreset = actor.getProperty().getColorMixPreset();
  actor.getProperty().setColorMixPreset(1);

  const oldForceNearestInterpolation = actor
    .getProperty()
    .getForceNearestInterpolation(1);
  actor.getProperty().setForceNearestInterpolation(1, true);
  const oldIndependentComponents = actor
    .getProperty()
    .getIndependentComponents();
  actor.getProperty().setIndependentComponents(true);

  viewport.addActor({
    ...defaultActor,
    representationUID: `${segmentationId}-${SegmentationRepresentations.Labelmap}`,
  });

  internalCache.set(uid, {
    added: true,
    segmentationRepresentationUID: `${segmentationId}`,
    originalBlendMode: viewport.getBlendMode(),
  });

  const oldPreLoad = actor.get('preLoad');
  actor.set({
    preLoad: load,
  });

  function onSegmentationDataModified(evt) {
    // update the second component of the array with the new segmentation data
    const { segmentationId } = evt.detail;
    const { representationData } = getSegmentation(segmentationId);
    const { volumeId: segVolumeId } =
      representationData.Labelmap as LabelmapSegmentationDataVolume;

    if (segVolumeId !== segImageVolume.volumeId) {
      return;
    }

    const segmentationVolume = cache.getVolume(segVolumeId);
    const segVoxelManager = segmentationVolume.voxelManager;

    const imageData = mapper.getInputData();
    const array = imageData.getPointData().getArray(0);
    const baseData = array.getData();
    const newComp = 2;
    const dims = segImageData.getDimensions();

    const slices = Array.from({ length: dims[2] }, (_, i) => i);

    for (const z of slices) {
      for (let y = 0; y < dims[1]; ++y) {
        for (let x = 0; x < dims[0]; ++x) {
          const iTuple = x + dims[0] * (y + dims[1] * z);
          baseData[iTuple * newComp + 1] = segVoxelManager.getAtIndex(
            iTuple
          ) as number;
        }
      }
    }

    array.setData(baseData);

    imageData.modified();
    viewport.render();
  }

  eventTarget.addEventListenerDebounced(
    Events.SEGMENTATION_DATA_MODIFIED,
    onSegmentationDataModified,
    200
  );

  function onSegmentationRepresentationRemoved(evt) {
    if (evt.detail.viewportId !== viewport.id) {
      return;
    }

    eventTarget.removeEventListener(
      Events.SEGMENTATION_DATA_MODIFIED,
      onSegmentationDataModified
    );
    eventTarget.removeEventListener(
      Events.SEGMENTATION_REPRESENTATION_REMOVED,
      onSegmentationRepresentationRemoved
    );

    const actorEntry = viewport.getActor(uid);

    if (actorEntry) {
      viewport.removeActors([uid]);
    }

    internalCache.delete(uid);

    if (viewport.isDisabled) {
      return;
    }

    // Restore the original actor and add it back to the viewport.
    actor.setMapper(oldMapper);
    actor.getProperty().setColorMixPreset(oldColorMixPreset);
    actor
      .getProperty()
      .setForceNearestInterpolation(1, oldForceNearestInterpolation);
    actor.getProperty().setIndependentComponents(oldIndependentComponents);

    viewport.addActor({
      ...defaultActor,
    });

    actor.set(oldPreLoad);

    viewport.render();
  }

  eventTarget.addEventListener(
    Events.SEGMENTATION_REPRESENTATION_REMOVED,
    onSegmentationRepresentationRemoved
  );

  return {
    uid,
    actor,
  };
}
