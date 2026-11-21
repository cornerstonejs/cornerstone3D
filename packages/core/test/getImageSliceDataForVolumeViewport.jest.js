import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import getImageSliceDataForVolumeViewport from '../src/utilities/getImageSliceDataForVolumeViewport';
import getTargetVolumeAndSpacingInNormalDir from '../src/utilities/getTargetVolumeAndSpacingInNormalDir';

jest.mock('../src/utilities/getTargetVolumeAndSpacingInNormalDir', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const volumeId = 'volume';

// A volume actor over a real vtkImageData, so that getSliceRange measures the
// slice range from the volume's corners as it does in a viewport.
function createVolumeActor(dimensions, origin, spacing) {
  const imageData = vtkImageData.newInstance();
  imageData.setDimensions(dimensions);
  imageData.setSpacing(spacing);
  imageData.setOrigin(origin);
  imageData.setDirection([1, 0, 0, 0, 1, 0, 0, 0, 1]);

  const mapper = vtkVolumeMapper.newInstance();
  mapper.setInputData(imageData);
  const actor = vtkVolume.newInstance();
  actor.setMapper(mapper);
  return actor;
}

function createViewport(
  dimensions,
  focalPoint,
  viewPlaneNormal = [0, 0, 1],
  { origin = [0, 0, 0], spacing = [1, 1, 1] } = {}
) {
  const actor = createVolumeActor(dimensions, origin, spacing);
  getTargetVolumeAndSpacingInNormalDir.mockReturnValue({
    imageVolume: { volumeId },
    spacingInNormalDirection: 1,
    actorUID: volumeId,
  });
  return {
    getCamera: () => ({
      focalPoint,
      position: focalPoint.map((v, i) => v + 100 * viewPlaneNormal[i]),
      viewPlaneNormal,
    }),
    getActors: () => [{ uid: volumeId, actor }],
  };
}

describe('getImageSliceDataForVolumeViewport', () => {
  it('reports the slice the focal point is on in a volume of several slices', () => {
    const viewport = createViewport([4, 4, 10], [1.5, 1.5, 3]);

    expect(getImageSliceDataForVolumeViewport(viewport)).toEqual({
      numberOfSlices: 10,
      imageIndex: 3,
    });
  });

  it('reports the first and the last slice of a volume of several slices', () => {
    expect(
      getImageSliceDataForVolumeViewport(createViewport([4, 4, 10], [1, 1, 0]))
    ).toEqual({ numberOfSlices: 10, imageIndex: 0 });
    expect(
      getImageSliceDataForVolumeViewport(createViewport([4, 4, 10], [1, 1, 9]))
    ).toEqual({ numberOfSlices: 10, imageIndex: 9 });
  });

  // A volume one slice thick collapses the slice range to min === max ===
  // current, which makes the fraction of the range the focal point is at
  // 0 / 0. getSliceRange rotates the volume's corners until the normal points
  // at +X; for the +X normal of the sagittal orientation that rotation is the
  // identity, so the range is exactly 0 wherever the volume is.
  it('reports slice 0 of 1 for a single sagittal slice viewed sagittally', () => {
    const viewport = createViewport([1, 4, 4], [0, 1.5, 1.5], [1, 0, 0]);

    expect(getImageSliceDataForVolumeViewport(viewport)).toEqual({
      numberOfSlices: 1,
      imageIndex: 0,
    });
  });

  // For other normals the rotation leaves a residue far smaller than the slice
  // coordinate, and at patient coordinates it rounds away: a 512 x 512 axial
  // slice at z = -150.25 viewed along the axial normal has a range of exactly 0.
  it('reports slice 0 of 1 for a single axial slice at patient coordinates', () => {
    const spacing = [0.48828125, 0.48828125, 1];
    const origin = [-125.3, -130.1, -150.25];
    const focalPoint = [
      origin[0] + 255.5 * spacing[0],
      origin[1] + 255.5 * spacing[1],
      origin[2],
    ];
    const viewport = createViewport([512, 512, 1], focalPoint, [0, 0, -1], {
      origin,
      spacing,
    });

    expect(getImageSliceDataForVolumeViewport(viewport)).toEqual({
      numberOfSlices: 1,
      imageIndex: 0,
    });
  });

  // With the origin at 0 the rotation leaves a residue of ~1e-16 on the range
  // here, so this case never divided by zero.
  it('reports slice 0 of 1 for a single axial slice at the origin', () => {
    const viewport = createViewport([4, 4, 1], [1.5, 1.5, 0]);

    expect(getImageSliceDataForVolumeViewport(viewport)).toEqual({
      numberOfSlices: 1,
      imageIndex: 0,
    });
  });
});
