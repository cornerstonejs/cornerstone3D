import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';
import imageCache from '../../imageCache';

export default function createVolumeActor(volumeUID, callback = () => {}) {
  const imageVolume = imageCache.getImageVolume(volumeUID);

  if (!imageVolume) {
    throw new error(`imageVolume with uid: ${imageVolume.uid} does not exist`);
  }

  const { volumeMapper } = imageVolume;

  const volumeActor = vtkVolume.newInstance();
  volumeActor.setMapper(volumeMapper);

  callback({ volumeActor, volumeUID });

  return volumeActor;
}
