import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
} from './utils/planarSeriesBothModes';

const { Enums, utilities } = cornerstone3D;
const { OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/** The options of the example `viewReferencePresentation`. */
const EXAMPLE_OPTIONS = {
  withNavigation: true,
  asVolume: false,
  withOrientation: false,
};

/** The orientations of the volume that the legacy volume viewport was measured in. */
const VOLUME_ORIENTATIONS = [
  OrientationAxis.AXIAL,
  OrientationAxis.ACQUISITION,
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

/** The answers of `isReferenceViewable` without options and with navigation. */
function answers(viewport, viewRef) {
  return {
    plain: viewport.isReferenceViewable(viewRef),
    withNavigation: viewport.isReferenceViewable(viewRef, {
      withNavigation: true,
    }),
    example: viewport.isReferenceViewable(viewRef, EXAMPLE_OPTIONS),
  };
}

/**
 * A stack and a volume of the same images are two display sets, and a next
 * view reference names its display set. The legacy stack viewport and the
 * legacy volume viewport of commit 58914567b took the reference of each other
 * by the image that it names. The values that they gave are stated in each
 * test.
 */
describe('A view reference between a stack and a volume of the same images on direct next planar viewports -- ', () => {
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
  });

  for (const orientation of VOLUME_ORIENTATIONS) {
    it(`a stack takes the reference of a volume in ${orientation} and goes to its image`, async function () {
      const series = await createSeries({ id: `across-stack-${orientation}` });
      const stack = createNextViewport(renderingEngine, 'acrossStack');
      const volume = createNextViewport(renderingEngine, 'acrossVolume');

      await showStack(stack, series, 2);
      await showVolume(volume, series, 0, { orientation });

      for (const k of [1, 6, 3]) {
        volume.setViewReference({
          FrameOfReferenceUID: volume.getFrameOfReferenceUID(),
          referencedImageId: series.imageIds[k],
        });
        await settle(volume);

        const viewRef = volume.getViewReference();

        expect(viewRef.displaySetId).not.toBe(
          stack.getViewReference().displaySetId
        );
        expect(series.imageIds.indexOf(viewRef.referencedImageId)).toBe(k);
        expect(answers(stack, viewRef)).toEqual({
          plain: false,
          withNavigation: true,
          example: true,
        });

        stack.setViewReference(viewRef);
        await settle(stack);

        expect(stack.getCurrentImageIdIndex()).toBe(k);
        expect(answers(stack, viewRef)).toEqual({
          plain: true,
          withNavigation: true,
          example: true,
        });
      }
    });

    it(`a volume in ${orientation} takes the reference of a stack and goes to its image`, async function () {
      const series = await createSeries({ id: `across-volume-${orientation}` });
      const stack = createNextViewport(renderingEngine, 'acrossStack');
      const volume = createNextViewport(renderingEngine, 'acrossVolume');

      await showStack(stack, series, 2);
      await showVolume(volume, series, 3, { orientation });

      for (const k of [5, 0, 7]) {
        stack.setViewState({ slice: { kind: 'stackIndex', imageIdIndex: k } });
        await settle(stack);

        const viewRef = stack.getViewReference();

        expect(viewRef.displaySetId).not.toBe(
          volume.getViewReference().displaySetId
        );
        expect(answers(volume, viewRef)).toEqual({
          plain: false,
          withNavigation: true,
          example: true,
        });

        volume.setViewReference(viewRef);
        await settle(volume);

        expect(series.imageIds.indexOf(volume.getCurrentImageId())).toBe(k);
        expect(answers(volume, viewRef).withNavigation).toBe(true);
        expect(answers(volume, viewRef).plain).toBe(true);
      }
    });
  }

  it('a reference of other images or of another plane is not viewable', async function () {
    const series = await createSeries({ id: 'across-same' });
    const other = await createSeries({ id: 'across-other' });
    const stack = createNextViewport(renderingEngine, 'acrossStack');
    const volume = createNextViewport(renderingEngine, 'acrossVolume');
    const sagittal = createNextViewport(renderingEngine, 'acrossSagittal');
    const otherStack = createNextViewport(renderingEngine, 'acrossOther');

    await showStack(stack, series, 2);
    await showVolume(volume, series, 3, { orientation: OrientationAxis.AXIAL });
    await showVolume(sagittal, series, 3, {
      orientation: OrientationAxis.SAGITTAL,
    });
    await showStack(otherStack, other, 2);

    const stackRef = stack.getViewReference();
    const volumeRef = volume.getViewReference();
    const sagittalRef = sagittal.getViewReference();
    const otherRef = otherStack.getViewReference();
    const none = { plain: false, withNavigation: false, example: false };

    expect(otherRef.FrameOfReferenceUID).toBe(stackRef.FrameOfReferenceUID);
    expect(answers(volume, otherRef)).toEqual(none);
    expect(answers(stack, otherRef)).toEqual(none);
    expect(answers(otherStack, volumeRef)).toEqual(none);
    expect(answers(otherStack, stackRef)).toEqual(none);
    expect(answers(stack, sagittalRef)).toEqual(none);
    expect(answers(sagittal, stackRef)).toEqual(none);
  });
});
