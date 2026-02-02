import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import {
  vtkSharedImageResliceMapper,
  vtkStreamingOpenGLTexture,
} from '../vtkClasses';

import type { ImageActor } from './../../types/IActor';
import type { VoiModifiedEventDetail } from './../../types/EventTypes';
import { loadVolume } from '../../loaders/volumeLoader';
import triggerEvent from '../../utilities/triggerEvent';
import { Events } from '../../enums';
import setDefaultVolumeVOI from './setDefaultVolumeVOI';

interface createVolumeSliceActorInterface {
  volumeId: string;
  callback?: ({
    volumeActor,
    volumeId,
  }: {
    volumeActor: ImageActor;
    volumeId: string;
  }) => void;
}

async function createVolumeSliceActor(
  props: createVolumeSliceActorInterface,
  element: HTMLDivElement,
  viewportId: string,
  suppressEvents = false
): Promise<{ actor: ImageActor; slicePlane: vtkPlane }> {
  const { volumeId, callback } = props;

  const imageVolume = await loadVolume(volumeId);

  if (!imageVolume) {
    throw new Error(`imageVolume with id: ${volumeId} does not exist`);
  }

  const { imageData } = imageVolume;

  const slicePlane = vtkPlane.newInstance();
  const mapper = vtkSharedImageResliceMapper.newInstance();
  const streamingTexture = vtkStreamingOpenGLTexture.newInstance();
  streamingTexture.setVolumeId(volumeId);
  streamingTexture.modified();
  mapper.setInputData(imageData);
  mapper.setSlicePlane(slicePlane);
  mapper.setSlabThickness(0);
  mapper.setScalarTexture?.(streamingTexture);
  mapper.modified();

  const actor = vtkImageSlice.newInstance();
  actor.setMapper(mapper);

  const numberOfComponents = imageData.get('numberOfComponents')
    .numberOfComponents as number;
  if (numberOfComponents > 1) {
    actor.getProperty().setIndependentComponents(false);
  }

  const imageProperty = actor.getProperty();
  imageProperty.set({ viewportId: viewportId }, true);

  await setDefaultVolumeVOI(actor, imageVolume);

  if (actor.getClassName && actor.getClassName() === 'vtkImageSlice') {
    const defaultWindow = imageProperty.getColorWindow?.();
    const defaultLevel = imageProperty.getColorLevel?.();
    if (defaultWindow === 255 && defaultLevel === 127.5) {
      const scalarRange = imageVolume.voxelManager?.getRange?.();
      if (scalarRange?.length === 2) {
        imageProperty.setColorWindow(scalarRange[1] - scalarRange[0]);
        imageProperty.setColorLevel((scalarRange[1] + scalarRange[0]) / 2);
      }
    }
  }

  if (callback) {
    callback({ volumeActor: actor, volumeId });
  }

  if (!suppressEvents) {
    triggerVOIModified(element, viewportId, actor, volumeId);
  }

  return { actor, slicePlane };
}

function triggerVOIModified(
  element: HTMLDivElement,
  viewportId: string,
  actor: ImageActor,
  volumeId: string
) {
  const voiRange = actor.getProperty().getRGBTransferFunction(0).getRange();

  const voiModifiedEventDetail: VoiModifiedEventDetail = {
    viewportId,
    range: {
      lower: voiRange[0],
      upper: voiRange[1],
    },
    volumeId,
  };

  triggerEvent(element, Events.VOI_MODIFIED, voiModifiedEventDetail);
}

export default createVolumeSliceActor;
