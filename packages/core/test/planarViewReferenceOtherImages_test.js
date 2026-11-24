import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
  sliceNormal,
  worldOfVoxel,
} from './utils/planarSeriesBothModes';

const { utilities } = cornerstone3D;

const renderingEngineId = utilities.uuidv4();

/**
 * What the legacy viewports of commit 58914567b did with a view reference of
 * another series of the same geometry in the same frame of reference: the
 * images of `createSeries`, a legacy stack and a legacy volume in its
 * acquisition plane, both at image 3, and a second stack of the other series
 * at its image 2. The legacy stack stayed at image 3 for each reference that
 * names an image of the other series (`StackViewport.setViewReference` found
 * no such image and returned), whatever slice index or focal point came with
 * it. With a slice index alone, or with an image of its own series, it went
 * there. The legacy volume went to the plane of the reference of the other
 * stack, image 2.
 */
const LEGACY = {
  stackStays: 3,
  stackSliceIndexAlone: 5,
  stackOwnImage: 6,
  volumeOtherStackReference: 2,
};

async function frames(count = 3) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** Renders after a few frames, so that a scroll that was asked lands. */
async function settle(viewport) {
  await frames();
  await renderAndWait(viewport);
}

/** The index of the image that a viewport shows, in the images of a series. */
function shownIndex(viewport, series) {
  return series.imageIds.indexOf(viewport.getCurrentImageId());
}

/** Sets a view reference on a stack at image 3, and gives where it lands. */
async function landingOfStack(stack, series, viewRef) {
  stack.setViewState({ slice: { kind: 'stackIndex', imageIdIndex: 3 } });
  await settle(stack);
  stack.setViewReference(viewRef);
  await settle(stack);

  return shownIndex(stack, series);
}

describe('A planar viewport given a view reference of other images -- ', () => {
  let renderingEngine;
  let series;
  let other;
  let otherStack;

  beforeEach(async function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
    series = await createSeries({ id: 'otherImagesSame' });
    other = await createSeries({ id: 'otherImagesOther' });
    otherStack = createNextViewport(renderingEngine, 'otherImagesOtherStack');
    await showStack(otherStack, other, 2);
  });

  afterEach(function () {
    cornerstone3D.displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('keeps a stack where it is for a reference that names an image of another series, as the legacy stack', async function () {
    const stack = createNextViewport(renderingEngine, 'otherImagesStack');

    await showStack(stack, series, 3);

    const FrameOfReferenceUID = stack.getFrameOfReferenceUID();
    const references = {
      'the reference of the other stack': otherStack.getViewReference(),
      'an image of the other series with a slice index': {
        FrameOfReferenceUID,
        referencedImageId: other.imageIds[2],
        sliceIndex: 2,
      },
      'an image of the other series with the focal point of image 5': {
        FrameOfReferenceUID,
        referencedImageId: other.imageIds[2],
        cameraFocalPoint: worldOfVoxel(series, [
          series.size.columns / 2,
          series.size.rows / 2,
          5,
        ]),
        viewPlaneNormal: sliceNormal(series),
      },
    };

    for (const [name, viewRef] of Object.entries(references)) {
      expect(stack.isReferenceViewable(viewRef, { withNavigation: true }))
        .withContext(name)
        .toBe(false);
      expect(await landingOfStack(stack, series, viewRef))
        .withContext(name)
        .toBe(LEGACY.stackStays);
    }
  });

  it('still moves a stack for a slice index alone and for an image of its own series, as the legacy stack', async function () {
    const stack = createNextViewport(renderingEngine, 'otherImagesStack');

    await showStack(stack, series, 3);

    expect(await landingOfStack(stack, series, { sliceIndex: 5 })).toBe(
      LEGACY.stackSliceIndexAlone
    );
    expect(
      await landingOfStack(stack, series, {
        FrameOfReferenceUID: stack.getFrameOfReferenceUID(),
        referencedImageId: series.imageIds[6],
        sliceIndex: 1,
      })
    ).toBe(LEGACY.stackOwnImage);
  });

  it('moves a volume to the plane of the reference of another series in its frame of reference, as the legacy volume', async function () {
    const volume = createNextViewport(renderingEngine, 'otherImagesVolume');

    await showVolume(volume, series, 3);

    expect(shownIndex(volume, series)).toBe(3);

    volume.setViewReference(otherStack.getViewReference());
    await settle(volume);

    expect(shownIndex(volume, series)).toBe(LEGACY.volumeOtherStackReference);
  });
});
