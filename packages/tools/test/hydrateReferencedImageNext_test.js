import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  showStack,
  showVolume,
  worldOfVoxel,
} from '../../core/test/utils/planarSeriesBothModes';

const { utilities } = cornerstone3D;
const { LengthTool, annotation: annotations } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'hydrateReferencedImageNext';

/** The image on display, and the image whose plane holds the points. */
const SHOWN_IMAGE = 2;
const POINT_IMAGE = 6;

const CASES = [
  ['in stack mode on the GPU', showStack, {}],
  ['in stack mode on the CPU', showStack, { renderBackend: 'cpu' }],
  ['in volume mode on the GPU', showVolume, {}],
  ['in volume mode on the CPU', showVolume, { renderBackend: 'cpu' }],
];

describe('An annotation hydrated on a direct next planar viewport -- ', () => {
  let renderingEngine;
  let toolGroup;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [LengthTool],
      toolActivations: {
        [LengthTool.toolName]: { bindings: [{ mouseButton: 1 }] },
      },
    });

    renderingEngine = testEnv.renderingEngine;
    toolGroup = testEnv.toolGroups[toolGroupId];
  });

  afterEach(function () {
    annotations.state.removeAllAnnotations();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
  });

  for (const [where, show, options] of CASES) {
    it(`references the image of its points, not the image on display, ${where}`, async function () {
      const series = await createSeries({ id: `hydrate-${where}` });
      const viewport = createNextViewport(renderingEngine, 'nextHydrate');

      toolGroup.addViewport(viewport.id, renderingEngineId);
      await show(viewport, series, SHOWN_IMAGE, options);

      LengthTool.hydrate(
        viewport.id,
        [
          worldOfVoxel(series, [8, 6, POINT_IMAGE]),
          worldOfVoxel(series, [20, 14, POINT_IMAGE]),
        ],
        { annotationUID: 'lengthOnAnotherImage' }
      );
      LengthTool.hydrate(
        viewport.id,
        [
          worldOfVoxel(series, [8, 6, SHOWN_IMAGE]),
          worldOfVoxel(series, [20, 14, SHOWN_IMAGE]),
        ],
        { annotationUID: 'lengthOnTheShownImage' }
      );
      LengthTool.hydrate(
        viewport.id,
        [
          worldOfVoxel(series, [8, 6, POINT_IMAGE]),
          worldOfVoxel(series, [20, 14, POINT_IMAGE]),
        ],
        {
          annotationUID: 'lengthWithAnImage',
          referencedImageId: series.imageIds[4],
        }
      );

      const imageOf = (annotationUID) =>
        series.imageIds.indexOf(
          annotations.state.getAnnotation(annotationUID).metadata
            .referencedImageId
        );

      expect(imageOf('lengthOnAnotherImage')).toBe(POINT_IMAGE);
      expect(imageOf('lengthOnTheShownImage')).toBe(SHOWN_IMAGE);
      expect(imageOf('lengthWithAnImage')).toBe(4);
      expect(series.imageIds.indexOf(viewport.getCurrentImageId())).toBe(
        SHOWN_IMAGE
      );
    });
  }
});
