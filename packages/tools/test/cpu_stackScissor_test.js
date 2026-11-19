import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  encodeImageIdInfo,
  createViewports,
  setupTestEnvironment,
  cleanupTestEnvironment,
} from '../../../utils/test/testUtils';

const { Enums, imageLoader, eventTarget } = cornerstone3D;

const { ViewportType } = Enums;

const { CircleScissorsTool, segmentation, Enums: csToolsEnums } = csTools3d;

const { Events: csToolsEvents } = csToolsEnums;

const { createNormalizedMouseEvent } = testUtils;

const renderingEngineId = 'renderingEngineId-cpu_stackScissor_test';
const toolGroupId = 'toolGroupId-cpu_stackScissor_test';
const segmentationId = 'segmentationId-cpu_stackScissor_test';
const viewportId = 'STACK_VIEWPORT';

/**
 * Drags the mouse on the element from one image index to another.
 */
function dragOnImage(element, viewport, fromIndex, toIndex) {
  const { imageData } = viewport.getImageData();
  const from = createNormalizedMouseEvent(
    imageData,
    fromIndex,
    element,
    viewport
  );
  const to = createNormalizedMouseEvent(imageData, toIndex, element, viewport);

  element.dispatchEvent(
    new MouseEvent('mousedown', {
      target: element,
      buttons: 1,
      clientX: from.clientX,
      clientY: from.clientY,
      pageX: from.pageX,
      pageY: from.pageY,
    })
  );
  document.dispatchEvent(
    new MouseEvent('mousemove', {
      target: element,
      buttons: 1,
      clientX: to.clientX,
      clientY: to.clientY,
      pageX: to.pageX,
      pageY: to.pageY,
    })
  );
  document.dispatchEvent(new MouseEvent('mouseup'));
}

describe('Stack segmentation scissors on the CPU:', () => {
  let renderingEngine;

  beforeEach(() => {
    const setup = setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [CircleScissorsTool],
      toolActivations: {
        [CircleScissorsTool.toolName]: { bindings: [{ mouseButton: 1 }] },
      },
      viewportIds: [viewportId],
    });

    renderingEngine = setup.renderingEngine;
  });

  afterEach(() => {
    cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      cleanupDOMElements: true,
    });
  });

  it('fills the labelmap of a stack with the circle scissor when the stack draws on the CPU', (done) => {
    const element = createViewports(renderingEngine, {
      viewportType: ViewportType.PLANAR_NEXT,
      viewportId,
      width: 256,
      height: 256,
    });
    const vp = renderingEngine.getViewport(viewportId);
    const imageId = encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: 'imageURI',
      rows: 64,
      columns: 64,
      barStart: 10,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex: 0,
    });
    let segImage;

    const onDataModified = () => {
      eventTarget.removeEventListener(
        csToolsEvents.SEGMENTATION_DATA_MODIFIED,
        onDataModified
      );
      const scalarData = segImage.voxelManager.getScalarData();

      expect(scalarData[32 * 64 + 32]).toBe(1);
      expect(scalarData[32 * 64 + 36]).toBe(1);
      expect(scalarData[2 * 64 + 2]).toBe(0);
      done();
    };

    const onFirstRender = () => {
      eventTarget.removeEventListener(
        csToolsEvents.SEGMENTATION_RENDERED,
        onFirstRender
      );
      const overlay = vp
        .getRenderPlan()
        .find((layer) => layer.role === 'overlay');

      expect(overlay?.draw).toBe('cpu');
      expect(vp.getActors()[1].actor.getClassName()).toBe('CanvasActor');

      eventTarget.addEventListener(
        csToolsEvents.SEGMENTATION_DATA_MODIFIED,
        onDataModified
      );
      dragOnImage(element, vp, [32, 32, 0], [40, 32, 0]);
    };

    eventTarget.addEventListener(
      csToolsEvents.SEGMENTATION_RENDERED,
      onFirstRender
    );

    testUtils
      .setStackOnNextViewport(vp, [imageId], 0, { renderBackend: 'cpu' })
      .then(() => {
        segImage = imageLoader.createAndCacheDerivedLabelmapImage(imageId);
        segmentation.addSegmentations([
          {
            segmentationId,
            representation: {
              type: csToolsEnums.SegmentationRepresentations.Labelmap,
              data: { imageIds: [segImage.imageId] },
            },
          },
        ]);
        segmentation.addSegmentationRepresentations(viewportId, [
          {
            segmentationId,
            type: csToolsEnums.SegmentationRepresentations.Labelmap,
          },
        ]);
        renderingEngine.render();
      })
      .catch(done.fail);
  });
});
