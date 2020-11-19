import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';

export default function createVolumeMapper(vtkImageData, vtkOpenGLTexture) {
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
  volumeMapper.setScalarTexture(vtkOpenGLTexture);

  return volumeMapper;
}
