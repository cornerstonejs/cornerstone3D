import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';
import vtkOpenGLTexture from 'vtk.js/Sources/Rendering/OpenGL/Texture';

export default function createVolumeMapper(vtkImageData) {
  const volumeMapper = vtkVolumeMapper.newInstance();

  volumeMapper.setInputData(vtkImageData);

  const spacing = vtkImageData.getSpacing();
  // Set the sample distance to half the mean length of one side. This is where the divide by 6 comes from.
  // https://github.com/Kitware/VTK/blob/6b559c65bb90614fb02eb6d1b9e3f0fca3fe4b0b/Rendering/VolumeOpenGL2/vtkSmartVolumeMapper.cxx#L344
  const sampleDistance = (spacing[0] + spacing[1] + spacing[2]) / 6;

  // Be generous to surpress warnings, as the logging really hurts performance.
  // TODO: maybe we should auto adjust samples to 1000.
  volumeMapper.setMaximumSamplesPerRay(4000);

  volumeMapper.setSampleDistance(sampleDistance);

  // Test make a texture here and pass it all the way down to the vtkOpenGLVolumeMapper
  const scalarTexture = vtkOpenGLTexture.newInstance();

  volumeMapper.setScalarTexture(scalarTexture);

  return volumeMapper;
}
