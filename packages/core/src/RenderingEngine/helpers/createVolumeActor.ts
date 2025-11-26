import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';

import type { VolumeActor } from './../../types/IActor';
import type { VoiModifiedEventDetail } from './../../types/EventTypes';
import { loadVolume } from '../../loaders/volumeLoader';
import createVolumeMapper from './createVolumeMapper';
import type BlendModes from '../../enums/BlendModes';
import triggerEvent from '../../utilities/triggerEvent';
import { Events } from '../../enums';
import setDefaultVolumeVOI from './setDefaultVolumeVOI';
import type { BlendMode } from '@kitware/vtk.js/Rendering/Core/VolumeMapper/Constants';
import { getConfiguration } from '../../init';

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
 * Creates a volume actor based on the provided properties.
 *
 * @param props - The properties for creating the volume actor.
 * @param element - The HTMLDivElement where the volume actor will be rendered.
 * @param viewportId - The ID of the viewport where the volume actor will be displayed.
 * @param suppressEvents - Optional. Specifies whether to suppress triggering events. Default is false.
 * @param useNativeDataType - Optional. Specifies whether to use the native data type. Default is false.
 * @returns A promise that resolves to the created volume actor.
 * @throws An error if the imageVolume with the specified ID does not exist.
 */
async function createVolumeActor(
  props: createVolumeActorInterface,
  element: HTMLDivElement,
  viewportId: string,
  suppressEvents = false
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
    volumeMapper.setBlendMode(blendMode as unknown as BlendMode);
  }

  const volumeActor = vtkVolume.newInstance();
  volumeActor.setMapper(volumeMapper);

  // Todo: fix this for 3D RGB
  const { numberOfComponents } = imageData.get('numberOfComponents') as {
    numberOfComponents: number;
  };

  const volumeProperty = volumeActor.getProperty();
  volumeProperty.set({ viewportId: viewportId }, true);

  if (getConfiguration().rendering.preferSizeOverAccuracy) {
    // @ts-expect-error: vtk.js typing is missing this method
    volumeProperty.setPreferSizeOverAccuracy(true);
  }

  if (numberOfComponents === 3) {
    volumeActor.getProperty().setIndependentComponents(false);
  }

  await setDefaultVolumeVOI(volumeActor, imageVolume);

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
