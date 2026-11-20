import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { cache, RenderingEngine, Enums, volumeLoader } = cornerstone3D;

const { Events } = Enums;

const viewportId = 'VIEWPORT';

/** The window of the test. */
const VOI_RANGE = { lower: 50, upper: 100 };

/** The number of slices of the colour volume of the test. */
const SLICES = 10;

/**
 * The colour that a voxel colour of the colour bar volume takes with the
 * window of the test and the invert, channel by channel.
 */
function windowedInvertedColor(color) {
  const width = VOI_RANGE.upper - VOI_RANGE.lower;

  return color.map(
    (value) =>
      255 -
      Math.round(
        (255 * Math.min(Math.max(value - VOI_RANGE.lower, 0), width)) / width
      )
  );
}

/**
 * A world point at the centre of a slice of the colour volume, 32 voxels
 * wide, on the coronal slice that the view shows: voxel i has its centre at
 * i, and the slices are 1 apart from 0.
 */
function sliceCentre(slice) {
  return [15.5, 16, slice];
}

/**
 * The colour of the canvas of a viewport at the canvas point of a world
 * point.
 */
function colorAtWorld(viewport, worldPoint) {
  const canvas = viewport.getCanvas();
  const scale = canvas.width / canvas.clientWidth;
  const [x, y] = viewport.worldToCanvas(worldPoint);

  return Array.from(
    canvas
      .getContext('2d')
      .getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1)
      .data.slice(0, 3)
  );
}

describe('Volume Viewport SetProperties -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      toolGroupIds: ['default'],
      viewportIds: [viewportId],
    });
    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId: renderingEngine.id,
      toolGroupIds: ['default'],
    });
  });

  it('should successfully modify the viewport with invert and setVOI', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportId,
      orientation: Enums.OrientationAxis.CORONAL,
      viewportType: Enums.ViewportType.PLANAR,
    });

    const volumeId = testUtils.encodeVolumeIdInfo({
      loader: 'fakeVolumeLoader',
      name: 'volumeURI',
      rows: 32,
      columns: 32,
      slices: SLICES,
      xSpacing: 1,
      ySpacing: 1,
      rgb: 1,
    });
    const vp = renderingEngine.getViewport(viewportId);
    const sliceColors = testUtils.colors.slice(0, SLICES);

    element.addEventListener(
      Events.IMAGE_RENDERED,
      () => {
        expect(
          sliceColors.map((_, slice) => colorAtWorld(vp, sliceCentre(slice)))
        ).toEqual(sliceColors.map(windowedInvertedColor));
        done();
      },
      { once: true }
    );

    try {
      volumeLoader
        .createAndCacheVolume(volumeId, { imageIds: [] })
        .then(() => {
          testUtils.setVolumesOnNextViewport(vp, [volumeId]).then(() => {
            vp.setDisplaySetPresentation({
              voiRange: VOI_RANGE,
              invert: true,
            });
            vp.render();
          });
        })
        .catch((e) => {
          done(e);
        });
    } catch (e) {
      done.fail(e);
    }
  });
});
