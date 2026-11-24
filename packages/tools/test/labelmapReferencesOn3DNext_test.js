import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  showStack,
} from '../../core/test/utils/planarSeriesBothModes';

const { Enums, imageLoader, utilities } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;
const { segmentation } = csTools3d;
const { SegmentationRepresentations } = csTools3d.Enums;

const renderingEngineId = utilities.uuidv4();
const segmentationId = 'labelmapReferencesOn3DNext';

/** Waits for the given number of animation frames. */
async function frames(count) {
  for (let frame = 0; frame < count; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** Shows the volume of a series on a direct next 3D viewport. */
async function show3D(renderingEngine, series) {
  const element = document.createElement('div');
  const displaySetId = `labelmapReferences3D:${series.volumeId}`;

  element.style.width = '400px';
  element.style.height = '300px';
  document.body.appendChild(element);
  renderingEngine.enableElement({
    viewportId: 'labelmapReferences3D',
    type: ViewportType.VOLUME_3D,
    element,
    defaultOptions: { orientation: OrientationAxis.CORONAL },
  });

  const viewport = renderingEngine.getViewport('labelmapReferences3D');

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds: series.imageIds,
    volumeId: series.volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { renderMode: 'vtkVolume3d' },
  });
  viewport.render();
  await frames(3);

  return viewport;
}

describe('The labelmap image references of a segmentation on direct next viewports -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    csTools3d.init();
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
  });

  afterEach(function () {
    cornerstone3D.displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('are left alone on a 3D viewport, which has no image on display, as on the legacy 3D viewport, and found on a stack', async function () {
    const series = await createSeries({ id: 'labelmapReferencesOn3D' });
    const viewport3D = await show3D(renderingEngine, series);
    const stack = createNextViewport(
      renderingEngine,
      'labelmapReferencesStack'
    );

    await showStack(stack, series, 2);

    const labelmapImageIds = imageLoader
      .createAndCacheDerivedLabelmapImages(series.imageIds)
      .map(({ imageId }) => imageId);

    segmentation.addSegmentations([
      {
        segmentationId,
        representation: {
          type: SegmentationRepresentations.Labelmap,
          data: { imageIds: labelmapImageIds },
        },
      },
    ]);

    expect(segmentation.getLabelmapImageIds(segmentationId)).toEqual(
      labelmapImageIds
    );

    let reference;

    expect(() => {
      reference = segmentation.state.updateLabelmapSegmentationImageReferences(
        viewport3D.id,
        segmentationId
      );
    }).not.toThrow();
    expect(reference).toBeUndefined();

    expect(
      segmentation.state.updateLabelmapSegmentationImageReferences(
        stack.id,
        segmentationId
      )
    ).toBe(labelmapImageIds[2]);
  });
});
