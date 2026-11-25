import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
  waitFor,
} from './utils/planarSeriesBothModes';

const { Enums, utilities } = cornerstone3D;
const { OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/** The image of the series that the stack shows first. */
const STACK_INDEX = 1;

const CASES = [
  ['on the GPU', {}],
  ['on the CPU', { renderBackend: 'cpu' }],
];

/** Resolves after a few animation frames. */
async function frames(count = 3) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** Waits until what the viewport was asked for is drawn. */
async function settle(viewport) {
  await frames();
  await renderAndWait(viewport);
}

/** The index of the image that a viewport shows, in the images of a series. */
function shownIndex(viewport, series) {
  return series.imageIds.indexOf(viewport.getCurrentImageId());
}

/**
 * A view reference of a volume that names no image, as a sagittal or a
 * coronal slice gives, counts its slice index in the slices of its view. A
 * stack shows only the planes of its images, so it takes such a reference
 * only as a volume (`asVolume`), and `setViewReference` moves it to no image
 * for it, as `isReferenceViewable` says.
 */
describe('A view reference of a volume that names no image, on a planar viewport in stack mode -- ', () => {
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

  for (const [where, options] of CASES) {
    for (const orientation of [
      OrientationAxis.SAGITTAL,
      OrientationAxis.CORONAL,
    ]) {
      it(`moves nothing for the reference of a ${orientation} slice of a volume of its series, which it takes only as a volume, ${where}`, async function () {
        const series = await createSeries({
          id: `volumeOnStack-${orientation}-${where}`,
        });
        const volume = createNextViewport(renderingEngine, 'volumeOnStackVol');
        const stack = createNextViewport(renderingEngine, 'volumeOnStackStk');

        await showVolume(volume, series, 0, { orientation });
        await showStack(stack, series, STACK_INDEX, options);

        const reference = volume.getViewReference();

        expect(reference.volumeId).toBe(series.volumeId);
        expect(reference.referencedImageId).toBeUndefined();
        expect(typeof reference.sliceIndex).toBe('number');
        expect(reference.sliceIndex).not.toBe(STACK_INDEX);
        expect(
          stack.isReferenceViewable(reference, { withNavigation: true })
        ).toBe(false);
        expect(stack.isReferenceViewable(reference, { asVolume: true })).toBe(
          true
        );

        stack.setViewReference(reference);
        await settle(stack);

        expect(stack.getCurrentImageIdIndex()).toBe(STACK_INDEX);
        expect(shownIndex(stack, series)).toBe(STACK_INDEX);
      });
    }

    it(`goes to the image that the reference of a volume in its plane names, ${where}`, async function () {
      const series = await createSeries({ id: `volumeImageOnStack-${where}` });
      const volume = createNextViewport(renderingEngine, 'volumeImageVol');
      const stack = createNextViewport(renderingEngine, 'volumeImageStk');

      await showVolume(volume, series, 6);
      await showStack(stack, series, STACK_INDEX, options);

      const reference = volume.getViewReference();

      expect(reference.volumeId).toBe(series.volumeId);
      expect(reference.referencedImageId).toBe(series.imageIds[6]);
      expect(
        stack.isReferenceViewable(reference, { withNavigation: true })
      ).toBe(true);

      stack.setViewReference(reference);
      await waitFor(() => shownIndex(stack, series) === 6);
      await settle(stack);

      expect(stack.getCurrentImageIdIndex()).toBe(6);
    });

    it(`goes to the image at the point of the reference of a volume that it shows as an overlay, ${where}`, async function () {
      const series = await createSeries({ id: `fusionSource-${where}` });
      const overlay = await createSeries({
        id: `fusionOverlay-${where}`,
        info: { PT: true },
      });
      const volume = createNextViewport(renderingEngine, 'fusionVol');
      const stack = createNextViewport(renderingEngine, 'fusionStk');
      const overlayId = `fusionOverlay:${where}`;

      await showVolume(volume, overlay, 4);
      await showStack(stack, series, STACK_INDEX, options);
      cornerstone3D.displaySetRegistry.add(overlayId, {
        imageIds: overlay.imageIds,
        volumeId: overlay.volumeId,
      });
      await stack.addDisplaySet(overlayId, {
        role: 'overlay',
        mode: 'volume',
        orientation: OrientationAxis.ACQUISITION,
        ...options,
      });
      await settle(stack);

      const reference = volume.getViewReference();

      expect(stack.getCurrentMode()).toBe('stack');
      expect(reference.volumeId).toBe(overlay.volumeId);
      expect(
        stack.isReferenceViewable(reference, { withNavigation: true })
      ).toBe(true);

      stack.setViewReference(reference);
      await waitFor(() => shownIndex(stack, series) === 4);
      await settle(stack);

      expect(stack.getCurrentImageIdIndex()).toBe(4);
      expect(stack.getSourceDisplaySetId()).toBe(`stack:${stack.id}`);
    });
  }
});
