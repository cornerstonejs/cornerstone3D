import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
} from './utils/planarSeriesBothModes';

const { utilities } = cornerstone3D;

const renderingEngineId = utilities.uuidv4();
const NAN_POINT = [NaN, NaN, NaN];

const MODES = [
  { name: 'stack mode on the GPU', show: showStack, options: {} },
  { name: 'volume mode on the GPU', show: showVolume, options: {} },
  {
    name: 'stack mode on the CPU',
    show: showStack,
    options: { renderBackend: 'cpu' },
  },
  {
    name: 'volume mode on the CPU',
    show: showVolume,
    options: { renderBackend: 'cpu' },
  },
];

/**
 * References with a point, a direction or a slice index that is not finite.
 * The first is the one of OHIF's jump to the centre of an empty segment
 * (its M43); the others name the frame of reference of the viewport.
 */
const REFERENCES = [
  {
    name: 'a focal point of NaN',
    make: () => ({ cameraFocalPoint: NAN_POINT }),
  },
  {
    name: 'a focal point of NaN in its frame of reference',
    make: (viewport) => ({
      FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
      cameraFocalPoint: NAN_POINT,
    }),
  },
  {
    name: 'a focal point at infinity',
    make: () => ({ cameraFocalPoint: [Infinity, 0, 0] }),
  },
  {
    name: 'a view plane normal of NaN',
    make: (viewport) => ({
      ...viewport.getViewReference(),
      viewPlaneNormal: NAN_POINT,
    }),
  },
  {
    name: 'a plane restriction at a point of NaN',
    make: (viewport) => ({
      FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
      planeRestriction: {
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        point: NAN_POINT,
      },
    }),
  },
  {
    name: 'a slice index of NaN',
    make: (viewport) => ({ ...viewport.getViewReference(), sliceIndex: NaN }),
  },
];

/** Resolves after a few animation frames. */
async function frames(count = 3) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/**
 * A view reference that a planar viewport cannot take is not viewable and
 * moves nothing, as the guide says. On 5.18.3 the legacy volume viewport
 * threw "Incompatible view refs" for a focal point of NaN and stayed on its
 * slice; on 6.0 the planar viewport went to slice NaN and drew nothing.
 */
describe('A view reference with a value that is not finite on a direct next planar viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    cornerstone3D.displaySetRegistry.clear();
  });

  MODES.forEach(({ name: modeName, show, options }) => {
    REFERENCES.forEach(({ name: referenceName, make }) => {
      it(`is not viewable and moves nothing for ${referenceName} in ${modeName}`, async function () {
        const series = await createSeries({ id: 'nonFiniteReference' });
        const viewport = createNextViewport(
          renderingEngine,
          'nonFiniteReference'
        );

        await show(viewport, series, 3, options);
        await frames();

        const reference = make(viewport);
        const viewStateBefore = viewport.getViewState();
        const imageIdBefore = viewport.getCurrentImageId();
        const sliceBefore = viewport.getSliceIndex();

        expect(viewport.isReferenceViewable(reference)).toBe(false);
        expect(
          viewport.isReferenceViewable(reference, {
            withNavigation: true,
            withOrientation: true,
          })
        ).toBe(false);
        expect(() => viewport.setViewReference(reference)).not.toThrow();

        await frames();
        await renderAndWait(viewport);

        expect(viewport.getViewState()).toEqual(viewStateBefore);
        expect(viewport.getCurrentImageId()).toBe(imageIdBefore);
        expect(viewport.getSliceIndex()).toBe(sliceBefore);
        expect(
          viewport
            .getResolvedView()
            .toICamera()
            .focalPoint.every(Number.isFinite)
        ).toBe(true);
      });
    });
  });
});
