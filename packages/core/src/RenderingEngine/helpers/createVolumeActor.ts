import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';

import { VolumeActor } from './../../types/IActor';
import { VoiModifiedEventDetail } from './../../types/EventTypes';
import { loadVolume } from '../../volumeLoader';
import createVolumeMapper from './createVolumeMapper';
import BlendModes from '../../enums/BlendModes';
import { triggerEvent } from '../../utilities';
import { Events } from '../../enums';

interface createVolumeActorInterface {
  volumeId: string;
  callback?: ({ volumeActor: any, volumeId: string }) => void;
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
  viewportId: string
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

  const voiRange = volumeActor
    .getProperty()
    .getRGBTransferFunction(0)
    .getRange()
    .slice();

  if (callback) {
    callback({ volumeActor, volumeId });
  }

  triggerVOIModifiedIfNecessary(element, viewportId, volumeActor, voiRange);

  return volumeActor;
}

const triggerVOIModifiedIfNecessary = (
  element: HTMLDivElement,
  viewportId: string,
  volumeActor: VolumeActor,
  voiRange: [number, number]
) => {
  const newVoiRange = volumeActor
    .getProperty()
    .getRGBTransferFunction(0)
    .getRange();

  if (newVoiRange[0] === voiRange[0] && newVoiRange[1] === voiRange[1]) {
    return;
  }

  const voiModifiedEventDetail: VoiModifiedEventDetail = {
    viewportId,
    range: {
      lower: newVoiRange[0],
      upper: newVoiRange[1],
    },
  };

  triggerEvent(element, Events.VOI_MODIFIED, voiModifiedEventDetail);
};

export default createVolumeActor;
