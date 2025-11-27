import { vtkSharedVolumeMapper } from '../vtkClasses';
import { getConfiguration } from '../../init';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type vtkOpenGLTexture from '@kitware/vtk.js/Rendering/OpenGL/Texture';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

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
  imageData: vtkImageData,
  vtkOpenGLTexture: vtkOpenGLTexture
): vtkVolumeMapper {
  const volumeMapper = vtkSharedVolumeMapper.newInstance();

  volumeMapper.setInputData(imageData);

  const spacing = imageData.getSpacing();
  // Set the sample distance to half the mean length of one side. This is where the divide by 6 comes from.
  // https://github.com/Kitware/VTK/blob/6b559c65bb90614fb02eb6d1b9e3f0fca3fe4b0b/Rendering/VolumeOpenGL2/vtkSmartVolumeMapper.cxx#L344
  const sampleDistanceMultiplier =
    getConfiguration().rendering?.volumeRendering?.sampleDistanceMultiplier ||
    1;
  const sampleDistance =
    (sampleDistanceMultiplier * (spacing[0] + spacing[1] + spacing[2])) / 6;

  // This is to allow for good pixel level image quality.
  // Todo: why we are setting this to 4000? Is this a good number? it should be configurable
  volumeMapper.setMaximumSamplesPerRay(4000);
  volumeMapper.setSampleDistance(sampleDistance);
  volumeMapper.setScalarTexture(vtkOpenGLTexture);

  return volumeMapper;
}

/**
 * Converts a shared mapper to a non-shared mapper. Sometimes we need to detach
 * a shared mapper and apply some changes to it, since otherwise, the changes
 * will be applied to all the mappers that share the same data.
 *
 * @param sharedMapper - The shared mapper to convert.
 * @returns The converted volume mapper.
 */
export function convertMapperToNotSharedMapper(sharedMapper: vtkVolumeMapper) {
  const volumeMapper = vtkVolumeMapper.newInstance();
  volumeMapper.setBlendMode(sharedMapper.getBlendMode());

  const imageData = sharedMapper.getInputData();
  const { voxelManager } = imageData.get('voxelManager');
  const values = voxelManager.getCompleteScalarDataArray();

  const scalarArray = vtkDataArray.newInstance({
    name: `Pixels`,
    values,
  });

  imageData.getPointData().setScalars(scalarArray);

  volumeMapper.setInputData(imageData);
  volumeMapper.setMaximumSamplesPerRay(sharedMapper.getMaximumSamplesPerRay());
  volumeMapper.setSampleDistance(sharedMapper.getSampleDistance());
  return volumeMapper;
}
