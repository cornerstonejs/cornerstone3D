import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

import * as volumeURI_100_100_10_1_1_1_0_SEG_controller_1 from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_controller_1.png';

const { Enums, volumeLoader, setVolumesForViewports, eventTarget } =
  cornerstone3D;

const { createAndCacheVolume } = volumeLoader;
const { ViewportType } = Enums;

const { segmentation, Enums: csToolsEnums, RectangleScissorsTool } = csTools3d;

const { Events } = csToolsEnums;

const { addSegmentationRepresentations, addSegmentations } = segmentation;

const renderingEngineId =
  'renderingEngineId-segmentationSegmentIndexController_test';
const toolGroupId = 'toolGroupId-segmentationSegmentIndexController_test';

const viewportId1 = 'AXIAL';

describe('Segmentation Index Controller:', () => {
  let testEnv;
  let renderingEngine;
  let segToolGroup;

  beforeEach(function () {
    testEnv = testUtils.setupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [RectangleScissorsTool],
      toolActivations: {
        [RectangleScissorsTool.toolName]: {
          bindings: [{ mouseButton: 1 }],
        },
      },
      viewportIds: [viewportId1],
    });

    renderingEngine = testEnv.renderingEngine;
    segToolGroup = testEnv.toolGroups[toolGroupId];
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: [toolGroupId],
      cleanupDOMElements: true,
    });
  });

  it('should be able to segment different indices using rectangle scissor', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportType: ViewportType.ORTHOGRAPHIC,
      orientation: Enums.OrientationAxis.AXIAL,
      viewportId: viewportId1,
    });

    const volumeId = testUtils.encodeVolumeIdInfo({
      loader: 'fakeVolumeLoader',
      name: 'volumeURI',
      rows: 100,
      columns: 100,
      slices: 10,
      xSpacing: 1,
      ySpacing: 1,
      zSpacing: 1,
    });

    const vp1 = renderingEngine.getViewport(viewportId1);

    const drawRectangle = (index1, index2) => {
      const { imageData } = vp1.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
      } = testUtils.createNormalizedMouseEvent(imageData, index1, element, vp1);

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
      } = testUtils.createNormalizedMouseEvent(imageData, index2, element, vp1);

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      });
      element.dispatchEvent(evt);

      // Mouse move to put the end somewhere else
      evt = new MouseEvent('mousemove', {
        target: element,
        buttons: 1,
        clientX: clientX2,
        clientY: clientY2,
        pageX: pageX2,
        pageY: pageY2,
      });
      document.dispatchEvent(evt);

      // Mouse Up instantly after
      evt = new MouseEvent('mouseup');
      document.dispatchEvent(evt);
    };

    const newSegRenderedCallback = () => {
      eventTarget.removeEventListener(
        Events.SEGMENTATION_RENDERED,
        newSegRenderedCallback
      );

      setTimeout(() => {
        drawRectangle([20, 20, 0], [40, 40, 0]);

        eventTarget.addEventListener(
          Events.SEGMENTATION_RENDERED,
          compareImageCallback
        );
        drawRectangle([30, 30, 0], [50, 50, 0]);
      }, 500);
    };

    const compareImageCallback = () => {
      const canvas1 = vp1.getCanvas();
      const image1 = canvas1.toDataURL('image/png');

      testUtils
        .compareImages(
          image1,
          volumeURI_100_100_10_1_1_1_0_SEG_controller_1,
          'volumeURI_100_100_10_1_1_1_0_SEG_controller_1'
        )
        .then(done, done.fail);
    };

    eventTarget.addEventListener(
      Events.SEGMENTATION_RENDERED,
      newSegRenderedCallback
    );

    try {
      createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          renderingEngine,
          [{ volumeId: volumeId }],
          [viewportId1]
        ).then(() => {
          vp1.render();

          csTools3d.utilities.segmentation
            .createLabelmapVolumeForViewport({
              viewportId: vp1.id,
              renderingEngineId: renderingEngine.id,
            })
            .then((segmentationId) => {
              addSegmentations([
                {
                  segmentationId: segmentationId,
                  representation: {
                    type: csToolsEnums.SegmentationRepresentations.Labelmap,
                    data: {
                      volumeId: segmentationId,
                    },
                  },
                },
              ]);

              addSegmentationRepresentations(viewportId1, [
                {
                  segmentationId: segmentationId,
                  type: csToolsEnums.SegmentationRepresentations.Labelmap,
                },
              ]);
            });
        });
      });
    } catch (e) {
      done.fail(e);
    }
  });
});
