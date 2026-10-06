import { vtkSharedVolumeMapper } from '../vtkClasses';
import { getConfiguration } from '../../init';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type vtkOpenGLTexture from '@kitware/vtk.js/Rendering/OpenGL/Texture';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkBoundingBox from '@kitware/vtk.js/Common/DataModel/BoundingBox';

/** The largest number of samples along one ray of a volume mapper. */
export const MAXIMUM_SAMPLES_PER_RAY = 4000;

/**
 * The sample distance of a volume mapper: half the mean side of one voxel of
 * the grid that the texture holds, times the multiplier. This is where the
 * divide by 6 comes from:
 * https://github.com/Kitware/VTK/blob/6b559c65bb90614fb02eb6d1b9e3f0fca3fe4b0b/Rendering/VolumeOpenGL2/vtkSmartVolumeMapper.cxx#L344
 *
 * A reduced texture holds a grid of a larger spacing, and a sample finer than
 * half of its voxel adds no detail. The distance also never falls below the
 * diagonal of the volume divided by `MAXIMUM_SAMPLES_PER_RAY`, so a long
 * series needs no more samples than that on one ray. vtk.js does not enforce
 * the maximum: it warns on every render and samples the whole ray.
 *
 * @param imageData - the image data of the volume
 * @param texture - the texture that the mapper reads, which can state a grid
 * @param multiplier - the multiplier of the default distance. The default is
 * `rendering.volumeRendering.sampleDistanceMultiplier` of the configuration.
 */
export function sampleDistanceOf(
  imageData: vtkImageData,
  texture?: unknown,
  multiplier = getConfiguration().rendering?.volumeRendering
    ?.sampleDistanceMultiplier || 1
): number {
  const grid = (
    texture as { getGrid?: () => { spacing: number[] } | null } | undefined
  )?.getGrid?.();
  const spacing = grid?.spacing ?? imageData.getSpacing();
  const distance = (multiplier * (spacing[0] + spacing[1] + spacing[2])) / 6;
  const diagonal = vtkBoundingBox.getDiagonalLength(imageData.getBounds());

  return Math.max(distance, diagonal / (MAXIMUM_SAMPLES_PER_RAY - 1));
}

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
  vtkOpenGLTexture?: vtkOpenGLTexture
): vtkVolumeMapper {
  const volumeMapper = vtkSharedVolumeMapper.newInstance();

  volumeMapper.setInputData(imageData);

  volumeMapper.setMaximumSamplesPerRay(MAXIMUM_SAMPLES_PER_RAY);
  volumeMapper.setSampleDistance(sampleDistanceOf(imageData, vtkOpenGLTexture));
  // A render path can create the mapper before it binds a base texture.
  if (vtkOpenGLTexture) {
    volumeMapper.setScalarTexture(vtkOpenGLTexture);
  }

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
