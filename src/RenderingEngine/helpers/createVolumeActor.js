import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';
import imageCache from '../../imageCache';

export default function createVolumeActor(volumeUID, callback = () => {}) {
  const imageVolume = imageCache.getImageVolume(volumeUID);

  if (!imageVolume) {
    throw new error(`imageVolume with uid: ${imageVolume.uid} does not exist`);
  }

  const { vtkImageData } = imageVolume;

  const volumeActor = vtkVolume.newInstance();
  const volumeMapper = vtkVolumeMapper.newInstance();

  volumeActor.setMapper(volumeMapper);
  volumeMapper.setInputData(vtkImageData);

  const spacing = vtkImageData.getSpacing();
  // Set the sample distance to half the mean length of one side. This is where the divide by 6 comes from.
  // https://github.com/Kitware/VTK/blob/6b559c65bb90614fb02eb6d1b9e3f0fca3fe4b0b/Rendering/VolumeOpenGL2/vtkSmartVolumeMapper.cxx#L344
  const sampleDistance = (spacing[0] + spacing[1] + spacing[2]) / 6;

  // Be generous to surpress warnings, as the logging really hurts performance.
  // TODO: maybe we should auto adjust samples to 1000.
  volumeMapper.setMaximumSamplesPerRay(4000);

  volumeMapper.setSampleDistance(sampleDistance);

  callback({ volumeActor, volumeUID });

  return volumeActor;
}
