import { vtkSharedVolumeMapper } from '../vtkClasses';
import { getConfiguration, getLossyDownsampling } from '../../init';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type vtkOpenGLTexture from '@kitware/vtk.js/Rendering/OpenGL/Texture';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkBoundingBox from '@kitware/vtk.js/Common/DataModel/BoundingBox';
import {
  gpuSettingsForRender,
  gridLimitsOfGpuSettings,
  gpuSettingsForGrid,
} from '../../utilities/gpuSettingsPresets';
import { voxelGridWithinLimits } from '../../utilities/voxelGrid';
import { noteTextureAllocation } from '../../utilities/gpuAllocationTracker';
import {
  getGpuMemoryTotal,
  removeGpuMemoryEntry,
  setGpuMemoryEntry,
} from '../../utilities/gpuMemoryLedger';
import { coreLog } from '../../utilities/logger';

const log = coreLog.getLogger('RenderingEngine', 'createVolumeMapper');

/** The largest number of samples along one ray of a volume mapper. */
export const MAXIMUM_SAMPLES_PER_RAY = 4000;

/**
 * The sample distance of a volume mapper: half the mean side of one voxel of
 * the grid that the texture holds, times the multiplier. This is where the
 * divide by 6 comes from:
 * https://github.com/Kitware/VTK/blob/6b559c65bb90614fb02eb6d1b9e3f0fca3fe4b0b/Rendering/VolumeOpenGL2/vtkSmartVolumeMapper.cxx#L344
 *
 * A reduced texture holds a grid of a larger spacing, and a sample finer than
 * half of its voxel adds no detail. With final downsampling on, the distance
 * also never falls below the diagonal of the volume divided by
 * `MAXIMUM_SAMPLES_PER_RAY`, so a long series needs no more samples than that
 * on one ray. vtk.js does not enforce the maximum: it warns on every render
 * and samples the whole ray. With final downsampling off, the distance is the
 * one of 4.x.
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

  if (!getLossyDownsampling().final) {
    return distance;
  }

  const diagonal = vtkBoundingBox.getDiagonalLength(imageData.getBounds());

  return Math.max(distance, diagonal / (MAXIMUM_SAMPLES_PER_RAY - 1));
}

const idleSampleDistanceMultipliers = new WeakMap<object, number>();

/** Records the multiplier that a mapper samples with when no interaction runs. */
export function setIdleSampleDistanceMultiplier(
  mapper: object,
  multiplier: number
): void {
  idleSampleDistanceMultipliers.set(mapper, multiplier);
}

/**
 * The multiplier that a mapper samples with when no interaction runs: the last
 * one that a viewport set, else the one of the configuration.
 */
export function idleSampleDistanceMultiplierOf(mapper: object): number {
  return (
    idleSampleDistanceMultipliers.get(mapper) ??
    (getConfiguration().rendering?.volumeRendering?.sampleDistanceMultiplier ||
      1)
  );
}

type SampledMapper = {
  getSampleDistance?: () => number;
  getInputData?: () => unknown;
  getScalarTexture?: () => unknown;
};

/**
 * The sample distance of a mapper over its distance at a multiplier of 1:
 * `current` now, and `idle` when no interaction runs. `idle` above 1 is a
 * standing reduction; `current / idle` above 1 ends with the interaction
 * (FIDELITY-RECORD-6).
 *
 * @param texture - the bound texture, when the mapper does not expose it
 */
export function sampleDistanceRatiosOf(
  mapper: SampledMapper | undefined,
  texture: unknown = mapper?.getScalarTexture?.()
): { current: number; idle: number } {
  const current = mapper?.getSampleDistance?.();
  const imageData = mapper?.getInputData?.() as vtkImageData | undefined;

  if (!imageData || !(current > 0)) {
    return { current: 1, idle: 1 };
  }

  const baseline = sampleDistanceOf(imageData, texture, 1);

  if (!(baseline > 0)) {
    return { current: 1, idle: 1 };
  }

  const idle = sampleDistanceOf(
    imageData,
    texture,
    idleSampleDistanceMultiplierOf(mapper)
  );

  return { current: current / baseline, idle: idle / baseline };
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
 * The new mapper is a plain vtk.js mapper, which uploads the complete scalar
 * array at full resolution, with no reduction. With final downsampling off,
 * the mapper is the one of 4.x. With final downsampling on, under `auto` the
 * edge probe runs first, the upload counts in the memory record, and a grid
 * above the limits of the GPU settings logs a warning.
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

  const gpuSettings = gpuSettingsForRender();

  // With final downsampling off, no preset applies and no probe runs.
  if (!gpuSettings) {
    return volumeMapper;
  }

  const dimensions = imageData.getDimensions();
  const bytesPerVoxel = values.BYTES_PER_ELEMENT;
  const textureBytes =
    dimensions[0] * dimensions[1] * dimensions[2] * bytesPerVoxel;
  const limits = gridLimitsOfGpuSettings(
    gpuSettingsForGrid(gpuSettings, dimensions, bytesPerVoxel),
    bytesPerVoxel
  );

  if (
    !voxelGridWithinLimits(
      {
        dimensions: [dimensions[0], dimensions[1], dimensions[2]],
        spacing: [1, 1, 1],
        origin: [0, 0, 0],
        direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      },
      limits
    )
  ) {
    log.warn(
      `a full-resolution texture of ${dimensions.join('x')} exceeds the limits of the GPU settings, and this mapper cannot reduce it`
    );
  }

  noteTextureAllocation({
    textureBytes,
    totalBytes: getGpuMemoryTotal() + textureBytes,
  });
  // vtk.js uploads the texture inside the mapper, so the mapper owns the entry
  // of the ledger until it is deleted.
  setGpuMemoryEntry(volumeMapper, {
    kind: 'texture',
    bytes: textureBytes,
    volumeId: imageData.get('volumeId')?.volumeId,
  });

  const superDelete = volumeMapper.delete;

  volumeMapper.delete = () => {
    removeGpuMemoryEntry(volumeMapper);

    return superDelete();
  };

  return volumeMapper;
}
