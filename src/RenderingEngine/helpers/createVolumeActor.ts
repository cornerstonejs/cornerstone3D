import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';
import imageCache from '../../imageCache';
//@ts-ignore
import createVolumeMapper from './createVolumeMapper';

interface createVolumeActorInterface {
  volumeUID: string;
  callback?: Function;
  blendMode?: string;
}

export default function createVolumeActor(props: createVolumeActorInterface) {
  const { volumeUID, callback, blendMode } = props;

  const imageVolume = imageCache.getImageVolume(volumeUID);

  if (!imageVolume) {
    throw new Error(`imageVolume with uid: ${imageVolume.uid} does not exist`);
  }

  const { vtkImageData, vtkOpenGLTexture } = imageVolume;

  const volumeMapper = createVolumeMapper(vtkImageData, vtkOpenGLTexture);

  if (blendMode) {
    volumeMapper.setBlendMode(blendMode);
  }

  const volumeActor = vtkVolume.newInstance();
  volumeActor.setMapper(volumeMapper);

  if (callback) {
    callback({ volumeActor, volumeUID });
  }

  return volumeActor;
}
