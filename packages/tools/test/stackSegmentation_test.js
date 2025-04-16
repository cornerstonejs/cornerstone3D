import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import * as imageURI_64_64_10_5_1_1_0_SEG_Mocked from './groundTruth/imageURI_64_64_10_5_1_1_0_SEG_Mocked.png';
import * as imageURI_64_64_10_5_1_1_0_SEG_Double_Mocked from './groundTruth/imageURI_64_64_10_5_1_1_0_SEG_Double_Mocked.png';
import * as imageURI_64_64_10_5_1_1_0_SEG_Mocked_Brushed from './groundTruth/imageURI_64_64_10_5_1_1_0_SEG_Mocked_Brushed.png';
import { encodeImageIdInfo } from '../../../utils/test/testUtils';

const { cache, Enums, metaData, imageLoader, eventTarget } = cornerstone3D;

const { ViewportType } = Enums;

const {
  ToolGroupManager,
  segmentation,
  Enums: csToolsEnums,
  BrushTool,
} = csTools3d;

const { Events } = csToolsEnums;

const { addSegmentationRepresentations } = segmentation;

const { fakeMetaDataProvider, compareImages } = testUtils;

const renderingEngineId = 'renderingEngineId-stackSegmentation_test';
const toolGroupId = 'toolGroupId-stackSegmentation_test';
const segmentationId = 'segmentationId-stackSegmentation_test';
const segmentationId2 = 'segmentationId2-stackSegmentation_test';

const viewportId1 = 'STACK_VIEWPORT';

describe('Stack Segmentation Rendering:', () => {
  let testEnv;
  let renderingEngine;

  beforeEach(function () {
    testEnv = testUtils.setupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: [toolGroupId],
      viewportIds: [viewportId1],
    });

    const segToolGroup = testEnv.toolGroups[toolGroupId];
    renderingEngine = testEnv.renderingEngine;

    csTools3d.addTool(BrushTool);
    segToolGroup.addToolInstance('CircularBrush', BrushTool.toolName, {
      activeStrategy: 'FILL_INSIDE_CIRCLE',
    });
    segToolGroup.setToolActive('CircularBrush', {
      bindings: [{ mouseButton: 1 }],
    });
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: [toolGroupId],
      cleanupDOMElements: true,
    });
  });

  it('should successfully render a segmentation on a stack viewport', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportType: ViewportType.STACK,
      viewportId: viewportId1,
    });

    const imageInfo1 = {
      loader: 'fakeImageLoader',
      name: 'imageURI',
      rows: 64,
      columns: 64,
      barStart: 10,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex: 0,
    };

    const imageId1 = encodeImageIdInfo(imageInfo1);
    const vp = renderingEngine.getViewport(viewportId1);

    eventTarget.addEventListener(Events.SEGMENTATION_RENDERED, (evt) => {
      const canvas = vp.getCanvas();
      const image = canvas.toDataURL('image/png');

      compareImages(
        image,
        imageURI_64_64_10_5_1_1_0_SEG_Mocked,
        'imageURI_64_64_10_5_1_1_0_SEG_Mocked'
      ).then(done, done.fail);
    });

    try {
      vp.setStack([imageId1], 0).then(() => {
        const segImage =
          imageLoader.createAndCacheDerivedLabelmapImage(imageId1);
        segmentation.addSegmentations([
          {
            segmentationId,
            representation: {
              type: csToolsEnums.SegmentationRepresentations.Labelmap,
              data: {
                imageIds: [segImage.imageId],
              },
            },
          },
        ]);

        testUtils.fillStackSegmentationWithMockData({
          imageIds: [imageId1],
          segmentationImageIds: [segImage.imageId],
          cornerstone: cornerstone3D,
        });

        addSegmentationRepresentations(viewportId1, [
          {
            segmentationId,
            type: csToolsEnums.SegmentationRepresentations.Labelmap,
          },
        ]);

        renderingEngine.render();
      });
    } catch (e) {
      done.fail(e);
    }
  });

  it('should successfully render two segmentations on a stack viewport', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportType: ViewportType.STACK,
      viewportId: viewportId1,
    });

    const imageInfo1 = {
      loader: 'fakeImageLoader',
      name: 'imageURI',
      rows: 64,
      columns: 64,
      barStart: 10,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex: 0,
    };

    const imageId1 = encodeImageIdInfo(imageInfo1);
    const vp = renderingEngine.getViewport(viewportId1);

    let renderCount = 0;
    const expectedRenderCount = 2; // We expect two segmentations to be rendered

    eventTarget.addEventListener(Events.SEGMENTATION_RENDERED, (evt) => {
      renderCount++;

      if (renderCount === expectedRenderCount) {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');

        compareImages(
          image,
          imageURI_64_64_10_5_1_1_0_SEG_Double_Mocked,
          'imageURI_64_64_10_5_1_1_0_SEG_Double_Mocked'
        ).then(done, done.fail);
      }
    });

    try {
      vp.setStack([imageId1], 0).then(() => {
        const segImage1 =
          imageLoader.createAndCacheDerivedLabelmapImage(imageId1);
        const segImage2 =
          imageLoader.createAndCacheDerivedLabelmapImage(imageId1);

        testUtils.fillStackSegmentationWithMockData({
          imageIds: [imageId1],
          segmentationImageIds: [segImage1.imageId],
          cornerstone: cornerstone3D,
        });
        testUtils.fillStackSegmentationWithMockData({
          imageIds: [imageId1],
          segmentationImageIds: [segImage2.imageId],
          centerOffset: [30, 30, 0],
          innerValue: 4,
          outerValue: 5,
          cornerstone: cornerstone3D,
        });

        segmentation.addSegmentations([
          {
            segmentationId,
            representation: {
              type: csToolsEnums.SegmentationRepresentations.Labelmap,
              data: {
                imageIds: [segImage1.imageId],
              },
            },
          },
        ]);
        segmentation.addSegmentations([
          {
            segmentationId: segmentationId2,
            representation: {
              type: csToolsEnums.SegmentationRepresentations.Labelmap,
              data: {
                imageIds: [segImage2.imageId],
              },
            },
          },
        ]);

        addSegmentationRepresentations(viewportId1, [
          {
            segmentationId,
            type: csToolsEnums.SegmentationRepresentations.Labelmap,
          },
        ]);
        addSegmentationRepresentations(viewportId1, [
          {
            segmentationId: segmentationId2,
            type: csToolsEnums.SegmentationRepresentations.Labelmap,
          },
        ]);

        renderingEngine.render();
      });
    } catch (e) {
      done.fail(e);
    }
  });

  it('should successfully render a segmentation on a stack viewport and use brush to edit it', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportType: ViewportType.STACK,
      viewportId: viewportId1,
    });

    const imageInfo1 = {
      loader: 'fakeImageLoader',
      name: 'imageURI',
      rows: 64,
      columns: 64,
      barStart: 10,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex: 0,
    };

    const imageId1 = encodeImageIdInfo(imageInfo1);
    const vp = renderingEngine.getViewport(viewportId1);

    const compareImageCallback = (evt) => {
      const canvas = vp.getCanvas();
      const image = canvas.toDataURL('image/png');

      compareImages(
        image,
        imageURI_64_64_10_5_1_1_0_SEG_Mocked_Brushed,
        'imageURI_64_64_10_5_1_1_0_SEG_Mocked_Brushed'
      ).then(done, done.fail);
    };

    const performBrushing = () => {
      eventTarget.addEventListener(
        Events.SEGMENTATION_RENDERED,
        compareImageCallback
      );

      const index1 = [50, 50, 0];
      const index2 = [60, 60, 0];

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = testUtils.createNormalizedMouseEvent(imageData, index1, element, vp);

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = testUtils.createNormalizedMouseEvent(imageData, index2, element, vp);

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

      // Since we need some time after the first render so that the
      // request animation frame is done and is ready for the next frame.
      performBrushing();
    };

    eventTarget.addEventListener(
      Events.SEGMENTATION_RENDERED,
      newSegRenderedCallback
    );

    try {
      vp.setStack([imageId1], 0).then(() => {
        const segImage1 =
          imageLoader.createAndCacheDerivedLabelmapImage(imageId1);
        segmentation.addSegmentations([
          {
            segmentationId,
            representation: {
              type: csToolsEnums.SegmentationRepresentations.Labelmap,
              data: {
                imageIds: [segImage1.imageId],
              },
            },
          },
        ]);

        testUtils.fillStackSegmentationWithMockData({
          imageIds: [imageId1],
          segmentationImageIds: [segImage1.imageId],
          cornerstone: cornerstone3D,
        });

        addSegmentationRepresentations(viewportId1, [
          {
            segmentationId,
            type: csToolsEnums.SegmentationRepresentations.Labelmap,
          },
        ]);

        segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 2);

        renderingEngine.render();
      });
    } catch (e) {
      done.fail(e);
    }
  });
});
