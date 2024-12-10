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
  const { uid, callback } = defaultActor;

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

  const { imageData: segImageData } = segImageVolume;
  const segScalarData =
    segImageVolume.voxelManager.getCompleteScalarDataArray();

  // const { imageData: baseImageData } = viewport.getImageData();

  // const array = baseImageData.getPointData().getArray(0);
  // const baseData = array.getData();
  const baseVolume = cache.getVolume(referenceVolumeId);
  const baseData = baseVolume.voxelManager.getCompleteScalarDataArray();

  const newComp = 2;
  const cubeData = new Float32Array(newComp * baseData.length);
  const dims = segImageData.getDimensions();
  for (let z = 0; z < dims[2]; ++z) {
    for (let y = 0; y < dims[1]; ++y) {
      for (let x = 0; x < dims[0]; ++x) {
        const iTuple = x + dims[0] * (y + dims[1] * z);
        cubeData[iTuple * newComp + 0] = baseData[iTuple];
        cubeData[iTuple * newComp + 1] = segScalarData[iTuple];
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

  actor.getProperty().setColorMixPreset(1);

  actor.getProperty().setForceNearestInterpolation(1, true);
  actor.getProperty().setIndependentComponents(true);

  viewport.addActor({
    actor,
    uid,
    callback,
    referencedId: referenceVolumeId,
    representationUID: `${segmentationId}-${SegmentationRepresentations.Labelmap}`,
  });

  internalCache.set(uid, {
    added: true,
    segmentationRepresentationUID: `${segmentationId}`,
    originalBlendMode: viewport.getBlendMode(),
  });

  actor.set({
    preLoad: load,
  });

  return {
    uid,
    actor,
    load,
  };

  // function onSegmentationDataModified(evt) {
  //   // update the second component of the array with the new segmentation data
  //   const { segmentationId, modifiedSlicesToUse } = evt.detail;
  //   const { representationData } = getSegmentation(segmentationId);
  //   const { volumeId } = representationData.LABELMAP;

  //   if (volumeId !== segVolumeId) {
  //     return;
  //   }

  //   const { scalarData } = cache.getVolume(volumeId);

  //   const array = mapper.getInputData().getPointData().getArray(0);
  //   const baseData = array.getData();
  //   const newComp = 2;
  //   const dims = segImageData.getDimensions();

  //   const slices = modifiedSlicesToUse?.length
  //     ? modifiedSlicesToUse
  //     : Array.from({ length: dims[2] }, (_, i) => i);

  //   for (const z of slices) {
  //     for (let y = 0; y < dims[1]; ++y) {
  //       for (let x = 0; x < dims[0]; ++x) {
  //         const iTuple = x + dims[0] * (y + dims[1] * z);
  //         baseData[iTuple * newComp + 1] = scalarData[iTuple];
  //       }
  //     }
  //   }

  //   array.setData(baseData);
  //   const newMapper = viewport.getDefaultActor().actor.getMapper();
  //   newMapper.modified();
  // }

  // eventTarget.addEventListener(
  //   Events.SEGMENTATION_DATA_MODIFIED,
  //   onSegmentationDataModified
  // );

  // eventTarget.addEventListener(
  //   Events.SEGMENTATION_REPRESENTATION_REMOVED,
  //   async (evt) => {
  //     eventTarget.removeEventListener(
  //       Events.SEGMENTATION_DATA_MODIFIED,
  //       onSegmentationDataModified
  //     );

  //     const actorEntry = viewport.getActor(uid);
  //     const { callback } = actorEntry;
  //     const { element, id } = viewport;
  //     viewport.removeActors([uid]);

  //     const actor = await createVolumeActor(
  //       {
  //         volumeId: uid,
  //         blendMode: Enums.BlendModes.MAXIMUM_INTENSITY_BLEND,
  //         callback: ({ volumeActor }) => {
  //           if (callback) {
  //             callback({
  //               volumeActor,
  //               volumeId,
  //             });
  //           }
  //         },
  //       },
  //       element,
  //       id
  //     );

  //     viewport.addActor({ actor, uid });

  //     viewport.render();
  //   }
  // );

  // return {
  //   uid,
  //   actor,
  //   load,
  // };
}
