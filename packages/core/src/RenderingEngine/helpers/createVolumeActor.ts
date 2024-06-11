import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';

import { VolumeActor } from './../../types/IActor';
import { VoiModifiedEventDetail } from './../../types/EventTypes';
import { loadVolume } from '../../loaders/volumeLoader';
import createVolumeMapper from './createVolumeMapper';
import BlendModes from '../../enums/BlendModes';
import { triggerEvent } from '../../utilities';
import { Events } from '../../enums';
import setDefaultVolumeVOI from './setDefaultVolumeVOI';

interface createVolumeActorInterface {
  volumeId: string;
  callback?: ({
    volumeActor,
    volumeId,
  }: {
    volumeActor: VolumeActor;
    volumeId: string;
  }) => void;
  blendMode?: BlendModes;
}

/**
 * Given a volumeId, it creates a vtk volume actor and returns it. If
 * callback is provided, it will be called with the volume actor and the
 * volumeId. If blendMode is provided, it will be set on the volume actor.
 *
 * @param props - createVolumeActorInterface
 * @returns A promise that resolves to a VolumeActor.
 */
async function createVolumeActor(
  props: createVolumeActorInterface,
  element: HTMLDivElement,
  viewportId: string,
  suppressEvents = false,
  useNativeDataType = false
): Promise<VolumeActor> {
  const { volumeId, callback, blendMode } = props;

  const imageVolume = await loadVolume(volumeId);

  if (!imageVolume) {
    throw new Error(
      `imageVolume with id: ${imageVolume.volumeId} does not exist`
    );
  }

  const { imageData, vtkOpenGLTexture } = imageVolume;

  const volumeMapper = createVolumeMapper(imageData, vtkOpenGLTexture);

  if (blendMode) {
    volumeMapper.setBlendMode(blendMode);
  }

  const volumeActor = vtkVolume.newInstance();
  volumeActor.setMapper(volumeMapper);

  const numberOfComponents = imageData
    .getPointData()
    .getScalars()
    .getNumberOfComponents();

  if (numberOfComponents === 3) {
    volumeActor.getProperty().setIndependentComponents(false);
  }

  await setDefaultVolumeVOI(volumeActor, imageVolume, useNativeDataType);

  if (callback) {
    callback({ volumeActor, volumeId });
  }

  if (!suppressEvents) {
    triggerVOIModified(element, viewportId, volumeActor, volumeId);
  }

  return volumeActor;
}

function triggerVOIModified(
  element: HTMLDivElement,
  viewportId: string,
  volumeActor: VolumeActor,
  volumeId: string
) {
  const voiRange = volumeActor
    .getProperty()
    .getRGBTransferFunction(0)
    .getRange();

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

export default createVolumeActor;
