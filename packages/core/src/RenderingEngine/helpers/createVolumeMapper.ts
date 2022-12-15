import { vtkSharedVolumeMapper } from '../vtkClasses';
import { getConfiguration } from '../../init';
/**
 * Given an imageData and a vtkOpenGLTexture, it creates a "shared" vtk volume mapper
 * from which various volume actors can be created.
 *
 * @param imageData - the vtkImageData object that contains the data to
 * render.
 * @param vtkOpenGLTexture - The vtkOpenGLTexture that will be used to render
 * the volume.
 * @returns The volume mapper.
 */
export default function createVolumeMapper(
  imageData: any,
  vtkOpenGLTexture: any
): any {
  const volumeMapper = vtkSharedVolumeMapper.newInstance();

  if (getConfiguration().rendering.preferSizeOverAccuracy) {
    volumeMapper.setPreferSizeOverAccuracy(true);
  }

  volumeMapper.setInputData(imageData);

  const spacing = imageData.getSpacing();
  // Set the sample distance to half the mean length of one side. This is where the divide by 6 comes from.
  // https://github.com/Kitware/VTK/blob/6b559c65bb90614fb02eb6d1b9e3f0fca3fe4b0b/Rendering/VolumeOpenGL2/vtkSmartVolumeMapper.cxx#L344
  const sampleDistance = (spacing[0] + spacing[1] + spacing[2]) / 6;

  // This is to allow for good pixel level image quality.
  // Todo: why we are setting this to 4000? Is this a good number? it should be configurable
  volumeMapper.setMaximumSamplesPerRay(4000);
  volumeMapper.setSampleDistance(sampleDistance);
  volumeMapper.setScalarTexture(vtkOpenGLTexture);

  return volumeMapper;
}
