import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextPlanarViewport,
  showStackWithLabelmap,
  showVolumeWithLabelmap,
} from './nextLabelmapScenes';
import {
  createNextViewport,
  createSeries,
  drawPathOf,
  showStack,
  showVolume,
} from '../../core/test/utils/planarSeriesBothModes';

const { utilities, cache, eventTarget, volumeLoader } = cornerstone3D;
const { ViewportColorbar } = csTools3d.utilities.voi.colorbar;
const { segmentation, Enums: csToolsEnums } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const segmentationId = 'viewportQueriesNext';

/** The draw paths of a planar viewport, with how to show the series. */
const DRAW_PATHS = [
  ['frame-gpu', showStack, {}],
  ['frame-cpu', showStack, { renderBackend: 'cpu' }],
  ['cpu-gpu', showVolume, {}],
  ['gpuVolume-gpu', showVolume, { sliceFirst: false }],
  ['cpu-cpu', showVolume, { renderBackend: 'cpu' }],
];

/**
 * Shows a volume of the fake volume loader on a planar viewport with the
 * options of its display set, and hydrates an empty labelmap of the same
 * grid as the segmentation of the tests. Gives the id of the volume.
 */
async function showVolumeWithHydratedLabelmap(viewport, options) {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'volumeURI',
    rows: 64,
    columns: 64,
    slices: 10,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });
  const rendered = new Promise((resolve) => {
    eventTarget.addEventListenerOnce(
      csToolsEnums.Events.SEGMENTATION_RENDERED,
      resolve
    );
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
  await testUtils.setVolumesOnNextViewport(viewport, [volumeId], options);
  volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: segmentationId,
  });
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: { volumeId: segmentationId },
      },
    },
  ]);
  segmentation.addLabelmapRepresentationToViewportMap({
    [viewport.id]: [{ segmentationId }],
  });
  await rendered;

  return volumeId;
}

/** Adds a colorbar of the source of a viewport, with its container. */
function addColorbar(viewport) {
  const container = document.createElement('div');

  container.style.width = '20px';
  container.style.height = '200px';
  document.body.appendChild(container);

  const colorbar = new ViewportColorbar({
    id: `colorbar:${viewport.id}`,
    element: viewport.element,
    container,
    colormaps: [{ Name: 'Grayscale', RGBPoints: [0, 0, 0, 0, 1, 1, 1, 1] }],
    activeColormapName: 'Grayscale',
  });

  return { colorbar, container };
}

describe('The volume ids and the scalar range of direct next planar viewports, for tools -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    csTools3d.init();
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

  it('gives the image volume of a volume with a hydrated labelmap on the GPU volume slice path, and the labelmap too with includeSegmentations', async function () {
    const viewport = createNextPlanarViewport(
      renderingEngine,
      'volumeWithLabelmap'
    );
    const volumeId = await showVolumeWithHydratedLabelmap(viewport, {
      sliceFirst: false,
    });
    const labelmapDisplaySetId = viewport
      .getDisplaySets()
      .find(({ options }) => options.role === 'overlay')?.displaySetId;

    expect(drawPathOf(viewport.getRenderPlan()[0])).toBe('gpuVolume-gpu');
    expect(viewport.getDisplaySets().length).toBe(2);
    expect(viewport.getVolumeIds()).toEqual([volumeId]);
    expect(viewport.getVolumeIds({ includeSegmentations: true })).toEqual([
      volumeId,
      segmentationId,
    ]);
    expect(viewport.getDisplaySetIdForVolumeId(volumeId)).toBe(
      viewport.getSourceDisplaySetId()
    );
    expect(viewport.getDisplaySetIdForVolumeId(segmentationId)).toBe(
      labelmapDisplaySetId
    );
  });

  it('gives the image volume of a volume with a hydrated labelmap on the CPU slice path, where the labelmap is drawn as images and is no volume of the viewport', async function () {
    const viewport = createNextPlanarViewport(
      renderingEngine,
      'volumeWithLabelmapCpuSlice'
    );
    const { volumeId } = await showVolumeWithLabelmap(viewport, segmentationId);

    expect(drawPathOf(viewport.getRenderPlan()[0])).toBe('cpu-gpu');
    expect(viewport.getDisplaySets().length).toBe(2);
    expect(viewport.getVolumeIds()).toEqual([volumeId]);
    expect(viewport.getVolumeIds({ includeSegmentations: true })).toEqual([
      volumeId,
    ]);
  });

  it('gives no volume for a stack with a hydrated labelmap', async function () {
    const viewport = createNextPlanarViewport(
      renderingEngine,
      'stackWithLabelmap'
    );

    await showStackWithLabelmap(viewport, segmentationId);

    expect(viewport.getCurrentMode()).toBe('stack');
    expect(viewport.getDisplaySets().length).toBeGreaterThan(1);
    expect(viewport.getVolumeIds()).toEqual([]);
    expect(viewport.getVolumeIds({ includeSegmentations: true })).toEqual([]);
  });

  for (const [drawPath, show, options] of DRAW_PATHS) {
    it(`gives a colorbar the scalar range of the viewport on the ${drawPath} path`, async function () {
      const series = await createSeries({ id: `colorbarRange-${drawPath}` });

      series.imageIds.forEach((imageId, k) => {
        const image = cache.getImage(imageId);

        image.minPixelValue = -50 - k;
        image.maxPixelValue = 300 + k;
      });

      const viewport = createNextViewport(renderingEngine, 'colorbarRange');

      await show(viewport, series, 2, options);

      const { colorbar, container } = addColorbar(viewport);
      const [lower, upper] = viewport.getScalarRange();

      expect(drawPathOf(viewport.getRenderPlan()[0])).toBe(drawPath);
      expect(colorbar.imageRange).toEqual({ lower, upper });
      expect(colorbar.imageRange).toEqual(
        show === showStack
          ? { lower: -52, upper: 302 }
          : { lower: -57, upper: 307 }
      );

      colorbar.destroy();
      container.remove();
    });
  }
});
