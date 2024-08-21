import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

import * as volumeURI_100_100_10_1_1_1_0_SEG_RectangleScissor from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_RectangleScissor.png';
import * as volumeURI_100_100_10_1_1_1_0_SEG_SAG_RectangleScissor from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_SAG_RectangleScissor.png';

const {
  cache,
  RenderingEngine,
  Enums,
  metaData,
  volumeLoader,
  setVolumesForViewports,
  eventTarget,
} = cornerstone3D;

const { registerVolumeLoader, createAndCacheVolume } = volumeLoader;
const { ViewportType } = Enums;

const {
  ToolGroupManager,
  segmentation,
  Enums: csToolsEnums,
  utilities: csToolsUtils,
  RectangleScissorsTool,
} = csTools3d;

const { Events } = csToolsEnums;

const { addSegmentationRepresentations, addSegmentations } = segmentation;

const {
  fakeVolumeLoader,
  fakeMetaDataProvider,
  createNormalizedMouseEvent,
  compareImages,
} = testUtils;

const toolGroupId = 'toolGroupId-segmentationRectangleScissor_test';

const viewportId1 = 'AXIAL';
const viewportId2 = 'SAGITTAL';

describe('Segmentation Tools:', () => {
  let testEnv;
  let renderingEngine;

  beforeEach(function () {
    testEnv = testUtils.setupTestEnvironment({
      toolGroupIds: [toolGroupId],
      tools: [RectangleScissorsTool],
      toolActivations: {
        [RectangleScissorsTool.toolName]: {
          bindings: [{ mouseButton: 1 }],
        },
      },
      viewportIds: [viewportId1, viewportId2],
    });

    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      toolGroupIds: [toolGroupId],
      renderingEngineId: renderingEngine.id,
    });
  });

  it('should be able to create a new segmentation from a viewport', function (done) {
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
    const vp = renderingEngine.getViewport(viewportId1);

    eventTarget.addEventListener(Events.SEGMENTATION_MODIFIED, (evt) => {
      const { segmentationId } = evt.detail;
      expect(segmentationId.includes(volumeId)).toBe(true);
    });

    eventTarget.addEventListener(Events.SEGMENTATION_RENDERED, (evt) => {
      done();
    });

    try {
      createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          renderingEngine,
          [{ volumeId: volumeId }],
          [viewportId1]
        ).then(() => {
          vp.render();

          csToolsUtils.segmentation
            .createLabelmapVolumeForViewport({
              viewportId: vp.id,
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

  it('should be able to edit the segmentation data with the rectangle scissor', function (done) {
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
    const vp = renderingEngine.getViewport(viewportId1);

    const drawRectangle = () => {
      eventTarget.addEventListener(
        Events.SEGMENTATION_RENDERED,
        compareImageCallback
      );

      const index1 = [11, 5, 0];
      const index2 = [80, 80, 0];

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
      } = createNormalizedMouseEvent(imageData, index1, element, vp);

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
      } = createNormalizedMouseEvent(imageData, index2, element, vp);

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
        drawRectangle();
      }, 100);
    };

    const compareImageCallback = () => {
      const canvas = vp.getCanvas();
      const image = canvas.toDataURL('image/png');

      compareImages(
        image,
        volumeURI_100_100_10_1_1_1_0_SEG_RectangleScissor,
        'volumeURI_100_100_10_1_1_1_0_SEG_RectangleScissor'
      ).then(done, done.fail);
    };

    eventTarget.addEventListener(
      Events.SEGMENTATION_RENDERED,
      newSegRenderedCallback
    );

    eventTarget.addEventListener(Events.SEGMENTATION_MODIFIED, (evt) => {
      const { segmentationId } = evt.detail;
      expect(segmentationId.includes(volumeId)).toBe(true);
    });

    try {
      createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          renderingEngine,
          [{ volumeId: volumeId }],
          [viewportId1]
        ).then(() => {
          vp.render();

          csToolsUtils.segmentation
            .createLabelmapVolumeForViewport({
              viewportId: vp.id,
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

  it('should be able to edit the segmentation data with the rectangle scissor with two viewports to render', function (done) {
    const [element1, element2] = testUtils.createViewports(
      renderingEngine,
      [
        {
          viewportType: ViewportType.ORTHOGRAPHIC,
          orientation: Enums.OrientationAxis.AXIAL,
          viewportId: viewportId1,
        },
        {
          viewportType: ViewportType.ORTHOGRAPHIC,
          orientation: Enums.OrientationAxis.SAGITTAL,
          viewportId: viewportId2,
        },
      ],
      2
    );

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
    const vp2 = renderingEngine.getViewport(viewportId2);

    const drawRectangle = () => {
      eventTarget.removeEventListener(
        Events.SEGMENTATION_RENDERED,
        drawRectangle
      );
      eventTarget.addEventListener(
        Events.SEGMENTATION_RENDERED,
        compareImageCallback
      );

      const index1 = [11, 5, 0];
      const index2 = [80, 80, 0];

      const { imageData } = vp1.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
      } = createNormalizedMouseEvent(imageData, index1, element1, vp1);

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
      } = createNormalizedMouseEvent(imageData, index2, element1, vp1);

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: element1,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      });
      element1.dispatchEvent(evt);

      // Mouse move to put the end somewhere else
      evt = new MouseEvent('mousemove', {
        target: element1,
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

    let newSegRenderCount = 0;
    const newSegRenderedCallback = () => {
      newSegRenderCount++;

      if (newSegRenderCount !== 2) {
        return;
      }

      eventTarget.removeEventListener(
        Events.SEGMENTATION_RENDERED,
        newSegRenderedCallback
      );

      setTimeout(() => {
        drawRectangle();
      }, 500);
    };

    let compareCount = 0;
    const compareImageCallback = async () => {
      compareCount++;

      if (compareCount !== 2) {
        return;
      }

      const canvas1 = vp1.getCanvas();
      const canvas2 = vp2.getCanvas();

      const image1 = canvas1.toDataURL('image/png');
      const image2 = canvas2.toDataURL('image/png');

      try {
        compareImages(
          image2,
          volumeURI_100_100_10_1_1_1_0_SEG_SAG_RectangleScissor,
          'volumeURI_100_100_10_1_1_1_0_SEG_SAG_RectangleScissor'
        );
      } catch (error) {
        return done.fail(error);
      }

      done();
    };

    eventTarget.addEventListener(
      Events.SEGMENTATION_RENDERED,
      newSegRenderedCallback
    );

    eventTarget.addEventListener(Events.SEGMENTATION_MODIFIED, (evt) => {
      const { segmentationId } = evt.detail;
      expect(segmentationId.includes(volumeId)).toBe(true);
    });

    try {
      createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          renderingEngine,
          [{ volumeId: volumeId }],
          [viewportId1, viewportId2]
        ).then(() => {
          vp1.render();
          vp2.render();

          csToolsUtils.segmentation
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
              addSegmentationRepresentations(viewportId2, [
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
