import {
  cache,
  Enums,
  convertMapperToNotSharedMapper,
  volumeLoader,
  eventTarget,
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
  // convertMapperToNotSharedMapper reuses the old mapper's vtkImageData and
  // replaces its point-data scalars with a CPU array, which this function then
  // rewrites as a 2-component (base + seg) array. The shared streaming mapper
  // renders from the GPU texture and misconfigures its shader if that injected
  // array is still active, so capture the original scalars (usually none) to
  // undo the mutation on restore.
  const sharedImageData = (oldMapper as vtkVolumeMapper).getInputData();
  const originalScalars = sharedImageData.getPointData().getScalars() ?? null;
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

  // While the segmentation is mounted, setLabelmapColorAndOpacity treats this
  // combined actor as the labelmap actor and enables the label-outline shader
  // path on its property. Capture the pre-mount outline state so the restore
  // can undo it - otherwise the plain base volume keeps rendering through the
  // label-outline shader after the representation is removed.
  const oldUseLabelOutline = actor.getProperty().getUseLabelOutline();
  // @ts-ignore - fix type in vtk
  const oldLabelOutlineOpacity = actor.getProperty().getLabelOutlineOpacity();
  const oldLabelOutlineThickness = actor
    .getProperty()
    .getLabelOutlineThickness();

  // Reuse the representationUID computed by the render plan (which includes
  // the labelmapId suffix). The plan's reconcile step compares actor UIDs
  // against that format; a mismatch makes it tear down this combined actor —
  // which is also the viewport's base volume actor — on the next render.
  const representationUID =
    (volumeInputArray[0].representationUID as string) ??
    `${segmentationId}-${SegmentationRepresentations.Labelmap}`;

  viewport.addActor({
    ...defaultActor,
    representationUID,
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
    const { segmentationId, modifiedSlicesToUse } = evt.detail;
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
    const combinedData = array.getData();
    const newComp = 2;
    const dims = segImageData.getDimensions();
    const sliceSize = dims[0] * dims[1];

    // Brush strokes report which slices they touched; merging only those
    // keeps the CPU cost proportional to the edit instead of the volume.
    const slices: number[] = modifiedSlicesToUse?.length
      ? modifiedSlicesToUse
      : Array.from({ length: dims[2] }, (_, i) => i);

    for (const z of slices) {
      const sliceStart = z * sliceSize;
      const sliceImage = cache.getImage(segmentationVolume.imageIds?.[z]);
      const sliceData = sliceImage?.voxelManager?.getScalarData?.();

      if (sliceData?.length === sliceSize) {
        for (let i = 0; i < sliceSize; ++i) {
          combinedData[(sliceStart + i) * newComp + 1] = sliceData[i];
        }
      } else {
        for (let i = 0; i < sliceSize; ++i) {
          const iTuple = sliceStart + i;
          combinedData[iTuple * newComp + 1] = segVoxelManager.getAtIndex(
            iTuple
          ) as number;
        }
      }
    }

    array.setData(combinedData);

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

    // The data-modified handler was registered debounced; the plain
    // removeEventListener would leave the debounce wrapper attached forever,
    // still merging into this detached imageData on every edit.
    eventTarget.removeEventListenerDebounced(
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

    const pointData = sharedImageData.getPointData();

    if (originalScalars) {
      pointData.setScalars(originalScalars);
    } else {
      pointData.removeArray('Pixels');
    }
    sharedImageData.modified();

    actor.getProperty().setColorMixPreset(oldColorMixPreset);
    actor
      .getProperty()
      .setForceNearestInterpolation(1, oldForceNearestInterpolation);
    actor.getProperty().setIndependentComponents(oldIndependentComponents);
    actor.getProperty().setUseLabelOutline(oldUseLabelOutline);
    // @ts-ignore - fix type in vtk
    actor.getProperty().setLabelOutlineOpacity(oldLabelOutlineOpacity);
    actor.getProperty().setLabelOutlineThickness(oldLabelOutlineThickness);

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
