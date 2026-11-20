import { mat4 } from 'gl-matrix';
import * as metaData from '../src/metaData';
import spatialRegistrationMetadataProvider from '../src/utilities/spatialRegistrationMetadataProvider';
import calculateViewportsSpatialRegistration from '../src/utilities/calculateViewportsSpatialRegistration';

/**
 * The image plane of each stand-in slice. The calculator reads the image
 * plane of the slice index of a viewport, so each slice index here names a
 * plane.
 */
const imagePlanes = {
  10: [0, 0, 10],
  20: [0, 0, 0],
  30: [0, 0, 100],
  40: [0, 0, 0],
};

/** Answers the image plane of the stand-in slices. */
function imagePlaneProvider(type, imageId) {
  if (type !== 'imagePlaneModule' || !imagePlanes[imageId]) {
    return;
  }

  return {
    imageOrientationPatient: [1, 0, 0, 0, 1, 0],
    imagePositionPatient: imagePlanes[imageId],
  };
}

/** A planar viewport stand-in at a slice index of the table above. */
function makeViewport(id, renderingEngineId, sliceIndex) {
  return { id, renderingEngineId, getSliceIndex: () => sliceIndex };
}

/** The translation in z of a registration matrix. */
function translationZ(registration) {
  return registration?.[14];
}

describe('The spatial registration of two pairs of rendering engines whose viewports have the same ids', () => {
  beforeAll(() => {
    metaData.addProvider(imagePlaneProvider, 100000);
  });

  afterAll(() => {
    metaData.removeProvider(imagePlaneProvider);
  });

  it('gives a pair of rendering engines no registration that was calculated for another pair', () => {
    calculateViewportsSpatialRegistration(
      makeViewport('rf7Source', 'engineA', 10),
      makeViewport('rf7Target', 'engineB', 20)
    );

    expect(
      translationZ(
        spatialRegistrationMetadataProvider.get(
          'spatialRegistrationModule',
          'rf7Source',
          'rf7Target',
          'engineA',
          'engineB'
        )
      )
    ).toBe(10);
    expect(
      spatialRegistrationMetadataProvider.get(
        'spatialRegistrationModule',
        'rf7Target',
        'rf7Source',
        'engineD',
        'engineC'
      )
    ).toBeUndefined();
    expect(
      spatialRegistrationMetadataProvider.get(
        'spatialRegistrationModule',
        'rf7Source',
        'rf7Target',
        'engineC',
        'engineD'
      )
    ).toBeUndefined();

    calculateViewportsSpatialRegistration(
      makeViewport('rf7Source', 'engineC', 30),
      makeViewport('rf7Target', 'engineD', 40)
    );

    expect(
      translationZ(
        spatialRegistrationMetadataProvider.get(
          'spatialRegistrationModule',
          'rf7Source',
          'rf7Target',
          'engineC',
          'engineD'
        )
      )
    ).toBe(100);
    expect(
      translationZ(
        spatialRegistrationMetadataProvider.get(
          'spatialRegistrationModule',
          'rf7Source',
          'rf7Target',
          'engineA',
          'engineB'
        )
      )
    ).toBe(10);
  });

  it('gives the last calculated registration when it is asked with the viewport ids alone, as in 5.x', () => {
    calculateViewportsSpatialRegistration(
      makeViewport('rf7LastSource', 'engineA', 10),
      makeViewport('rf7LastTarget', 'engineB', 20)
    );

    expect(
      translationZ(
        spatialRegistrationMetadataProvider.get(
          'spatialRegistrationModule',
          'rf7LastSource',
          'rf7LastTarget'
        )
      )
    ).toBe(10);
    expect(
      translationZ(
        spatialRegistrationMetadataProvider.get(
          'spatialRegistrationModule',
          'rf7LastTarget',
          'rf7LastSource'
        )
      )
    ).toBe(-10);

    calculateViewportsSpatialRegistration(
      makeViewport('rf7LastSource', 'engineC', 30),
      makeViewport('rf7LastTarget', 'engineD', 40)
    );

    expect(
      translationZ(
        spatialRegistrationMetadataProvider.get(
          'spatialRegistrationModule',
          'rf7LastSource',
          'rf7LastTarget'
        )
      )
    ).toBe(100);
  });

  it('gives every pair of rendering engines the registration that the application added for the viewport ids alone', () => {
    spatialRegistrationMetadataProvider.add(
      ['rf7AppSource', 'rf7AppTarget'],
      mat4.fromTranslation(mat4.create(), [0, 0, 7])
    );

    expect(
      translationZ(
        spatialRegistrationMetadataProvider.get(
          'spatialRegistrationModule',
          'rf7AppSource',
          'rf7AppTarget',
          'engineA',
          'engineB'
        )
      )
    ).toBe(7);
    expect(
      translationZ(
        spatialRegistrationMetadataProvider.get(
          'spatialRegistrationModule',
          'rf7AppTarget',
          'rf7AppSource',
          'engineD',
          'engineC'
        )
      )
    ).toBe(-7);

    calculateViewportsSpatialRegistration(
      makeViewport('rf7AppSource', 'engineE', 30),
      makeViewport('rf7AppTarget', 'engineF', 40)
    );

    expect(
      translationZ(
        spatialRegistrationMetadataProvider.get(
          'spatialRegistrationModule',
          'rf7AppSource',
          'rf7AppTarget',
          'engineE',
          'engineF'
        )
      )
    ).toBe(100);
    expect(
      translationZ(
        spatialRegistrationMetadataProvider.get(
          'spatialRegistrationModule',
          'rf7AppSource',
          'rf7AppTarget',
          'engineA',
          'engineB'
        )
      )
    ).toBe(7);
  });
});
