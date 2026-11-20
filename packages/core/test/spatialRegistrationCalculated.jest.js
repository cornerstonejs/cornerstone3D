import { mat4 } from 'gl-matrix';
import * as metaData from '../src/metaData';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import spatialRegistrationMetadataProvider from '../src/utilities/spatialRegistrationMetadataProvider';
import calculateViewportsSpatialRegistration from '../src/utilities/calculateViewportsSpatialRegistration';

/**
 * The image plane module of each stand-in image id. Some give the
 * orientation as row and column cosines only, or no position, as a valid
 * metadata provider may.
 */
const imagePlanes = {
  axial0: {
    imageOrientationPatient: [1, 0, 0, 0, 1, 0],
    imagePositionPatient: [0, 0, 0],
  },
  axial50: {
    imageOrientationPatient: [1, 0, 0, 0, 1, 0],
    imagePositionPatient: [0, 0, 50],
  },
  axial10: {
    imageOrientationPatient: [1, 0, 0, 0, 1, 0],
    imagePositionPatient: [0, 0, 10],
  },
  axial40: {
    imageOrientationPatient: [1, 0, 0, 0, 1, 0],
    imagePositionPatient: [0, 0, 40],
  },
  cosines0: {
    rowCosines: [1, 0, 0],
    columnCosines: [0, 1, 0],
    imagePositionPatient: [0, 0, 0],
  },
  cosines20: {
    rowCosines: [1, 0, 0],
    columnCosines: [0, 1, 0],
    imagePositionPatient: [0, 0, 20],
  },
  noPosition: {
    imageOrientationPatient: [1, 0, 0, 0, 1, 0],
  },
  noOrientation: {
    imagePositionPatient: [0, 0, 5],
  },
};

/** Answers the image plane module of the stand-in image ids. */
function imagePlaneProvider(type, imageId) {
  if (type !== 'imagePlaneModule' || !imagePlanes[imageId]) {
    return;
  }

  return imagePlanes[imageId];
}

/**
 * A planar viewport stand-in whose image on display and frame of reference
 * the test changes, as a viewport that gets the data of another study.
 */
function makeViewport(id, renderingEngineId, imageId, frameOfReferenceUID) {
  const viewport = {
    id,
    renderingEngineId,
    imageId,
    frameOfReferenceUID,
    getCurrentImageId: () => viewport.imageId,
    getFrameOfReferenceUID: () => viewport.frameOfReferenceUID,
  };

  return viewport;
}

/** A rendering engine stand-in that holds the viewports, in the cache. */
function addRenderingEngine(id, viewports) {
  renderingEngineCache.set({
    id,
    getViewport: (viewportId) =>
      viewports.find((viewport) => viewport.id === viewportId),
  });
}

/** The translation in z of a registration matrix. */
function translationZ(registration) {
  return registration?.[14];
}

/** The registration from one viewport to another, with their engine ids. */
function registrationOf(viewport1, viewport2) {
  return spatialRegistrationMetadataProvider.get(
    'spatialRegistrationModule',
    viewport1.id,
    viewport2.id,
    viewport1.renderingEngineId,
    viewport2.renderingEngineId
  );
}

describe('A calculated spatial registration', () => {
  beforeAll(() => {
    metaData.addProvider(imagePlaneProvider, 100000);
  });

  afterAll(() => {
    metaData.removeProvider(imagePlaneProvider);
  });

  afterEach(() => {
    renderingEngineCache.delete('f2EngineA');
    renderingEngineCache.delete('f2EngineB');
  });

  it('reads the orientation from the row and column cosines when the image orientation is missing', () => {
    const source = makeViewport('f2CosinesSource', 'f2EngineA', 'cosines20');
    const target = makeViewport('f2CosinesTarget', 'f2EngineB', 'cosines0');

    calculateViewportsSpatialRegistration(source, target);

    expect(translationZ(registrationOf(source, target))).toBe(20);
  });

  it('adds nothing and does not throw for an image without a position or an orientation', () => {
    const pairs = [
      ['noPosition', 'axial0'],
      ['axial0', 'noPosition'],
      ['noOrientation', 'axial0'],
      ['axial0', 'noOrientation'],
    ];

    pairs.forEach(([sourceImageId, targetImageId], index) => {
      const source = makeViewport(
        `f2MissingSource${index}`,
        'f2EngineA',
        sourceImageId
      );
      const target = makeViewport(
        `f2MissingTarget${index}`,
        'f2EngineB',
        targetImageId
      );

      expect(() =>
        calculateViewportsSpatialRegistration(source, target)
      ).not.toThrow();
      expect(registrationOf(source, target)).toBeUndefined();
    });
  });

  it('is not given for the viewports once they show the data of other frames of reference', () => {
    const source = makeViewport(
      'f2StudySource',
      'f2EngineA',
      'axial50',
      'frameOne'
    );
    const target = makeViewport(
      'f2StudyTarget',
      'f2EngineB',
      'axial0',
      'frameTwo'
    );

    addRenderingEngine('f2EngineA', [source]);
    addRenderingEngine('f2EngineB', [target]);
    calculateViewportsSpatialRegistration(source, target);

    expect(translationZ(registrationOf(source, target))).toBe(50);
    expect(translationZ(registrationOf(target, source))).toBe(-50);

    source.imageId = 'axial10';
    target.imageId = 'axial10';
    source.frameOfReferenceUID = 'frameThree';
    target.frameOfReferenceUID = 'frameThree';

    expect(registrationOf(target, source)).toBeUndefined();
    expect(registrationOf(source, target)).toBeUndefined();
    expect(
      spatialRegistrationMetadataProvider.get(
        'spatialRegistrationModule',
        source.id,
        target.id
      )
    ).toBeUndefined();
  });

  it('is given while the viewports show the data of the same frames of reference', () => {
    const source = makeViewport(
      'f2SameSource',
      'f2EngineA',
      'axial50',
      'frameOne'
    );
    const target = makeViewport(
      'f2SameTarget',
      'f2EngineB',
      'axial0',
      'frameTwo'
    );

    addRenderingEngine('f2EngineA', [source]);
    addRenderingEngine('f2EngineB', [target]);
    calculateViewportsSpatialRegistration(source, target);
    source.imageId = 'axial10';

    expect(translationZ(registrationOf(source, target))).toBe(50);
  });

  it('leaves the registration that the application added for the viewport ids as it is', () => {
    const source = makeViewport(
      'f2AppSource',
      'f2EngineA',
      'axial50',
      'frameOne'
    );
    const target = makeViewport(
      'f2AppTarget',
      'f2EngineB',
      'axial0',
      'frameTwo'
    );

    addRenderingEngine('f2EngineA', [source]);
    addRenderingEngine('f2EngineB', [target]);
    spatialRegistrationMetadataProvider.add(
      [source.id, target.id],
      mat4.fromTranslation(mat4.create(), [0, 0, 7])
    );
    source.frameOfReferenceUID = 'frameThree';
    target.frameOfReferenceUID = 'frameThree';

    expect(translationZ(registrationOf(source, target))).toBe(7);
    expect(
      translationZ(
        spatialRegistrationMetadataProvider.get(
          'spatialRegistrationModule',
          source.id,
          target.id
        )
      )
    ).toBe(7);
  });

  it('replaces the registration of the other direction when the reverse one is calculated', () => {
    const first = makeViewport('f2ReverseFirst', 'f2EngineA', 'axial10');
    const second = makeViewport('f2ReverseSecond', 'f2EngineB', 'axial0');

    calculateViewportsSpatialRegistration(first, second);

    expect(translationZ(registrationOf(first, second))).toBe(10);

    first.imageId = 'axial10';
    second.imageId = 'axial40';
    calculateViewportsSpatialRegistration(second, first);

    expect(translationZ(registrationOf(second, first))).toBe(30);
    expect(translationZ(registrationOf(first, second))).toBe(-30);
    expect(
      translationZ(
        spatialRegistrationMetadataProvider.get(
          'spatialRegistrationModule',
          first.id,
          second.id
        )
      )
    ).toBe(-30);
  });
});
