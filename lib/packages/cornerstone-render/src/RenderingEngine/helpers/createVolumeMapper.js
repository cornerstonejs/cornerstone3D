import { vtkSharedVolumeMapper } from '../vtkClasses';
export default function createVolumeMapper(vtkImageData, vtkOpenGLTexture) {
    const volumeMapper = vtkSharedVolumeMapper.newInstance();
    volumeMapper.setInputData(vtkImageData);
    const spacing = vtkImageData.getSpacing();
    // Set the sample distance to half the mean length of one side. This is where the divide by 6 comes from.
    // https://github.com/Kitware/VTK/blob/6b559c65bb90614fb02eb6d1b9e3f0fca3fe4b0b/Rendering/VolumeOpenGL2/vtkSmartVolumeMapper.cxx#L344
    const sampleDistance = (spacing[0] + spacing[1] + spacing[2]) / 6;
    // This is to allow for good pixel level image quality.
    volumeMapper.setMaximumSamplesPerRay(4000);
    volumeMapper.setSampleDistance(sampleDistance);
    volumeMapper.setScalarTexture(vtkOpenGLTexture);
    return volumeMapper;
}
//# sourceMappingURL=createVolumeMapper.js.map