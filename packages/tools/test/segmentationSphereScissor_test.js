import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

import * as volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_AX from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_AX.png';
import * as volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_SAG from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_SAG.png';
import * as volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_COR from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_COR.png';

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
  SphereScissorsTool,
} = csTools3d;

const { Events } = csToolsEnums;

const { addSegmentationRepresentations, addSegmentations } = segmentation;

const {
  fakeVolumeLoader,
  fakeMetaDataProvider,
  createNormalizedMouseEvent,
  compareImages,
} = testUtils;

const renderingEngineId = 'renderingEngineId-segmentationSphereScissor_test';
const toolGroupId = 'toolGroupId-segmentationSphereScissor_test';

const viewportId1 = 'AXIAL';
const viewportId2 = 'SAGITTAL';
const viewportId3 = 'CORONAL';

describe('Segmentation Tools:', () => {
  let testEnv;
  let renderingEngine;
  let segToolGroup;

  beforeEach(function () {
    testEnv = testUtils.setupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [SphereScissorsTool],
      toolActivations: {
        [SphereScissorsTool.toolName]: {
          bindings: [{ mouseButton: 1 }],
        },
      },
      viewportIds: [viewportId1, viewportId2, viewportId3],
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

  it('should be able to edit the segmentation data with the sphere scissor', function (done) {
    const elements = testUtils.createViewports(renderingEngine, [
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
      {
        viewportType: ViewportType.ORTHOGRAPHIC,
        orientation: Enums.OrientationAxis.CORONAL,
        viewportId: viewportId3,
      },
    ]);

    const [element1, element2, element3] = elements;

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
    const vp3 = renderingEngine.getViewport(viewportId3);

    const drawSphere = () => {
      eventTarget.addEventListener(
        Events.SEGMENTATION_RENDERED,
        compareImageCallback
      );

      const index1 = [50, 50, 0];
      const index2 = [60, 60, 0];

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

    let renderCount = 0;
    const newSegRenderedCallback = () => {
      renderCount++;

      if (renderCount === 3) {
        return;
      }

      eventTarget.removeEventListener(
        Events.SEGMENTATION_RENDERED,
        newSegRenderedCallback
      );

      setTimeout(() => {
        drawSphere();
      }, 500);
    };

    let compareCount = 0;
    const compareImageCallback = async () => {
      compareCount++;

      if (compareCount !== 3) {
        return;
      }

      const canvas1 = vp1.getCanvas();
      const canvas2 = vp2.getCanvas();
      const canvas3 = vp3.getCanvas();
      const image1 = canvas1.toDataURL('image/png');
      const image2 = canvas2.toDataURL('image/png');
      const image3 = canvas3.toDataURL('image/png');

      try {
        await compareImages(
          image1,
          volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_AX,
          'volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_AX'
        );

        await compareImages(
          image2,
          volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_SAG,
          'volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_SAG'
        );

        await compareImages(
          image3,
          volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_COR,
          'volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_COR'
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
          [viewportId1, viewportId2, viewportId3]
        ).then(() => {
          vp1.render();
          vp2.render();
          vp3.render();

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
              addSegmentationRepresentations(viewportId3, [
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
