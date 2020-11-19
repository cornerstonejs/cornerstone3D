import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';
import imageCache from '../../imageCache';
import createVolumeMapper from './createVolumeMapper';

export default function createVolumeActor({
  volumeUID,
  callback = () => {},
  blendMode,
}) {
  const imageVolume = imageCache.getImageVolume(volumeUID);

  if (!imageVolume) {
    throw new error(`imageVolume with uid: ${imageVolume.uid} does not exist`);
  }

  const { vtkImageData, vtkOpenGLTexture } = imageVolume;

  const volumeMapper = createVolumeMapper(vtkImageData, vtkOpenGLTexture);

  if (blendMode) {
    volumeMapper.setBlendMode(blendMode);
  }

  const volumeActor = vtkVolume.newInstance();
  volumeActor.setMapper(volumeMapper);

  callback({ volumeActor, volumeUID });

  return volumeActor;
}
