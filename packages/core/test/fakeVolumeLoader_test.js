import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { volumeLoader, metaData, utilities } = cornerstone3D;

const renderingEngineId = utilities.uuidv4();

/** Makes the volume id of a small fake volume with the spacings given. */
function volumeIdWith(id, spacings) {
  return testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'volumeURI',
    id,
    rows: 10,
    columns: 10,
    slices: 4,
    ...spacings,
  });
}

describe('The fake volume loader of the tests -- ', () => {
  beforeEach(function () {
    testUtils.setupTestEnvironment({ renderingEngineId });
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
  });

  it('makes the volume with the spacing of its id', async function () {
    const volume = await volumeLoader.createAndCacheVolume(
      volumeIdWith('fakeSpacing', { xSpacing: 1, ySpacing: 2, zSpacing: 3 }),
      { imageIds: [] }
    );

    expect(Array.from(volume.spacing)).toEqual([1, 2, 3]);
    expect(Array.from(volume.imageData.getSpacing())).toEqual([1, 2, 3]);
  });

  it('places the image of each slice at the position of that slice in the volume', async function () {
    const volume = await volumeLoader.createAndCacheVolume(
      volumeIdWith('fakePositions', {
        xSpacing: 1,
        ySpacing: 1,
        zSpacing: 3,
      }),
      { imageIds: [] }
    );

    const positions = volume.imageIds.map(
      (imageId) =>
        metaData.get('imagePlaneModule', imageId).imagePositionPatient
    );
    const worldOfSlices = volume.imageIds.map((_imageId, k) =>
      Array.from(volume.imageData.indexToWorld([0, 0, k]))
    );

    expect(positions).toEqual([
      [0, 0, 0],
      [0, 0, 3],
      [0, 0, 6],
      [0, 0, 9],
    ]);
    expect(positions).toEqual(worldOfSlices);
  });

  it('takes a spacing of 1 where the id leaves it out', async function () {
    const volume = await volumeLoader.createAndCacheVolume(
      volumeIdWith('fakeDefaultSpacing', { xSpacing: 2, ySpacing: 1 }),
      { imageIds: [] }
    );

    expect(Array.from(volume.spacing)).toEqual([2, 1, 1]);
    expect(
      metaData.get('imagePlaneModule', volume.imageIds[2]).imagePositionPatient
    ).toEqual([0, 0, 2]);
  });
});
