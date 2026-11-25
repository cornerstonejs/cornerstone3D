import { addProvider, removeProvider } from '../src/metaData';
import calculateViewportsSpatialRegistration from '../src/utilities/calculateViewportsSpatialRegistration';
import spatialRegistrationMetadataProvider from '../src/utilities/spatialRegistrationMetadataProvider';

const imagePlanes = {
  'a:first': [0, 0, 0],
  'a:current': [0, 0, 50],
  'b:first': [0, 0, 100],
  'b:current': [10, 20, 130],
};
const iop = [1, 0, 0, 0, 1, 0];

function imagePlaneProvider(type, imageId) {
  if (type === 'imagePlaneModule' && imagePlanes[imageId]) {
    return {
      imagePositionPatient: imagePlanes[imageId],
      imageOrientationPatient: iop,
    };
  }
}

function viewport(id, prefix) {
  return {
    id,
    getCurrentImageId: () => `${prefix}:current`,
    getImageIds: () => [`${prefix}:first`, `${prefix}:current`],
  };
}

describe('calculateViewportsSpatialRegistration', () => {
  beforeAll(() => addProvider(imagePlaneProvider, 10000));
  afterAll(() => removeProvider(imagePlaneProvider));

  it('registers the translation between the current images of the viewports', () => {
    calculateViewportsSpatialRegistration(
      viewport('vpA', 'a'),
      viewport('vpB', 'b')
    );

    const matrix = spatialRegistrationMetadataProvider.get(
      'spatialRegistrationModule',
      'vpA',
      'vpB'
    );
    // Translation column of the mat4: IPP of a:current minus IPP of b:current.
    expect(Array.from(matrix.slice(12, 15))).toEqual([-10, -20, -80]);
  });
});
