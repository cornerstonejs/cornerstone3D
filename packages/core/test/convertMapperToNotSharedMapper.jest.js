import { describe, it, expect } from '@jest/globals';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import { convertMapperToNotSharedMapper } from '../src/RenderingEngine/helpers/createVolumeMapper';

const dimensions = [4, 3, 2];
const voxelCount = dimensions[0] * dimensions[1] * dimensions[2];

/** A volume's image data, as ImageVolume makes it, and a mapper that reads it. */
function sharedMapperOf(scalars) {
  const imageData = vtkImageData.newInstance();
  imageData.setDimensions(dimensions);
  imageData.setSpacing([0.5, 0.75, 2]);
  imageData.setOrigin([-10, 20, 30]);
  imageData.setDirection([0, 1, 0, 1, 0, 0, 0, 0, -1]);

  const values = Float32Array.from({ length: voxelCount }, (_, i) => i);
  const voxelManager = { getCompleteScalarDataArray: () => values };
  imageData.set({ voxelManager, numberOfComponents: 1 }, true);

  if (scalars) {
    imageData.getPointData().setScalars(scalars);
  }

  const sharedMapper = vtkVolumeMapper.newInstance();
  sharedMapper.setInputData(imageData);

  return { sharedMapper, imageData, values, voxelManager };
}

/**
 * What addVolumesAsIndependentComponents does to the new mapper's scalars, and
 * what its handler of labelmap edits does after each edit.
 */
function makeTwoComponents(mapper) {
  const ownImageData = mapper.getInputData();
  const array = ownImageData.getPointData().getScalars();
  array.setData(new Float32Array(2 * voxelCount));
  array.setNumberOfComponents(2);
  ownImageData.modified();
}

describe('convertMapperToNotSharedMapper', () => {
  it('reads the voxels from a copy of the image data, with the same grid', () => {
    const { sharedMapper, imageData, values, voxelManager } = sharedMapperOf();

    const mapper = convertMapperToNotSharedMapper(sharedMapper);
    const ownImageData = mapper.getInputData();

    expect(ownImageData).not.toBe(imageData);
    expect(ownImageData.getDimensions()).toEqual(imageData.getDimensions());
    expect(ownImageData.getSpacing()).toEqual(imageData.getSpacing());
    expect(ownImageData.getOrigin()).toEqual(imageData.getOrigin());
    expect(ownImageData.getDirection()).toEqual(imageData.getDirection());
    expect(ownImageData.get('voxelManager').voxelManager).toBe(voxelManager);

    const scalars = ownImageData.getPointData().getScalars();
    expect(scalars.getName()).toBe('Pixels');
    expect(scalars.getData()).toBe(values);
  });

  // Every other viewport of the volume renders from its image data. Scalars
  // set on it would make those viewports build their texture again, with the
  // number of components of the edge projection's combined array.
  it('leaves the image data of the volume without scalars', () => {
    const { sharedMapper, imageData } = sharedMapperOf();
    const pointData = imageData.getPointData();
    const arrayCount = pointData.getNumberOfArrays();

    const mapper = convertMapperToNotSharedMapper(sharedMapper);
    makeTwoComponents(mapper);

    expect(sharedMapper.getInputData()).toBe(imageData);
    expect(imageData.getPointData()).toBe(pointData);
    expect(pointData.getNumberOfArrays()).toBe(arrayCount);
    expect(pointData.getScalars()).toBeFalsy();
  });

  // A mapper of the volume builds its texture again when the modified time of
  // the image data changes, so each labelmap edit would cost the other
  // viewports a whole texture.
  it('leaves the modified time of the image data of the volume as it was', () => {
    const { sharedMapper, imageData } = sharedMapperOf();
    const modifiedTime = imageData.getMTime();

    const mapper = convertMapperToNotSharedMapper(sharedMapper);
    makeTwoComponents(mapper);

    expect(imageData.getMTime()).toBe(modifiedTime);
  });

  it('leaves the scalars of the volume as they were, one component', () => {
    const ownValues = new Float32Array(voxelCount);
    const own = vtkDataArray.newInstance({
      name: 'Scalars',
      values: ownValues,
    });
    const { sharedMapper, imageData, values } = sharedMapperOf(own);

    const mapper = convertMapperToNotSharedMapper(sharedMapper);

    // The new mapper renders the voxels of the voxel manager, not a copy of
    // the array that the volume had.
    const ownPointData = mapper.getInputData().getPointData();
    expect(ownPointData.getScalars().getName()).toBe('Pixels');
    expect(ownPointData.getScalars().getData()).toBe(values);

    makeTwoComponents(mapper);

    const scalars = imageData.getPointData().getScalars();
    expect(scalars).toBe(own);
    expect(scalars.getNumberOfComponents()).toBe(1);
    expect(scalars.getData()).toBe(ownValues);
  });

  // An edit of the labelmap can arrive after the volume is gone from the
  // cache, which deletes its image data.
  it('keeps its grid after the image data of the volume is deleted', () => {
    const { sharedMapper, imageData } = sharedMapperOf();
    const bounds = imageData.getBounds();

    const mapper = convertMapperToNotSharedMapper(sharedMapper);
    imageData.delete();

    const ownImageData = mapper.getInputData();
    expect(ownImageData.getDimensions()).toEqual(dimensions);
    expect(ownImageData.getBounds()).toEqual(bounds);
    expect(ownImageData.getPointData().getScalars().getName()).toBe('Pixels');
  });
});
