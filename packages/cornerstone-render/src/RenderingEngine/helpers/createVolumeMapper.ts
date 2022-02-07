import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper'

import { vtkSharedVolumeMapper } from '../vtkClasses'

export default function createVolumeMapper(
  imageData: any,
  vtkOpenGLTexture: any
): any {
  let volumeMapper
  if (useSharedMapper) {
    volumeMapper = vtkSharedVolumeMapper.newInstance()
  } else {
    console.debug('not using shared mapper')
    volumeMapper = vtkVolumeMapper.newInstance()
  }

  volumeMapper.setInputData(imageData)

  const spacing = imageData.getSpacing()
  // Set the sample distance to half the mean length of one side. This is where the divide by 6 comes from.
  // https://github.com/Kitware/VTK/blob/6b559c65bb90614fb02eb6d1b9e3f0fca3fe4b0b/Rendering/VolumeOpenGL2/vtkSmartVolumeMapper.cxx#L344
  const sampleDistance = (spacing[0] + spacing[1] + spacing[2]) / 6

  // This is to allow for good pixel level image quality.
  volumeMapper.setMaximumSamplesPerRay(4000)

  volumeMapper.setSampleDistance(sampleDistance)

  if (useSharedMapper) {
    volumeMapper.setScalarTexture(vtkOpenGLTexture)
  }

  return volumeMapper
}
