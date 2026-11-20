import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, imageLoader } = cornerstone3D;
const { ViewportType } = Enums;
const { BrushTool, segmentation, Enums: csToolsEnums } = csTools3d;
const { Labelmap } = csToolsEnums.SegmentationRepresentations;

const renderingEngineId = 'renderingEngineId-cpuDynamicThresholdStroke_test';
const toolGroupId = 'toolGroupId-cpuDynamicThresholdStroke_test';
const gpuViewportId = 'GPU_STROKE_VIEWPORT';
const cpuViewportId = 'CPU_STROKE_VIEWPORT';
const brushName = 'DynamicThreshold';
const size = 64;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mouseEventAt(viewport, index, type, target) {
  const { imageData } = viewport.getImageData();
  const point = testUtils.createNormalizedMouseEvent(
    imageData,
    index,
    viewport.element,
    viewport
  );

  return new MouseEvent(type, {
    target,
    buttons: 1,
    clientX: point.clientX,
    clientY: point.clientY,
    pageX: point.pageX,
    pageY: point.pageY,
  });
}

/**
 * Drags the brush along a row of the image, from one column to another, one
 * mouse move per step of two pixels.
 */
async function strokeAlongRow(viewport, row, fromColumn, toColumn) {
  const { element } = viewport;

  element.dispatchEvent(
    mouseEventAt(viewport, [fromColumn, row, 0], 'mousedown', element)
  );

  for (let column = fromColumn + 2; column <= toColumn; column += 2) {
    document.dispatchEvent(
      mouseEventAt(viewport, [column, row, 0], 'mousemove', element)
    );
    await wait(20);
  }

  document.dispatchEvent(
    mouseEventAt(viewport, [toColumn, row, 0], 'mouseup', element)
  );
  await wait(300);
}

function countLabelledPixels(labelmapImage) {
  const labels = labelmapImage.voxelManager.getScalarData();
  let count = 0;

  for (let index = 0; index < labels.length; index++) {
    if (labels[index]) {
      count++;
    }
  }

  return count;
}

describe('The dynamic threshold brush on a CPU viewport:', () => {
  let renderingEngine;

  beforeEach(() => {
    const setup = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [BrushTool],
      viewportIds: [gpuViewportId, cpuViewportId],
    });
    const toolGroup = setup.toolGroups[toolGroupId];

    renderingEngine = setup.renderingEngine;
    toolGroup.addToolInstance(brushName, BrushTool.toolName, {
      activeStrategy: 'THRESHOLD_INSIDE_CIRCLE',
      brushSize: 4,
      threshold: { isDynamic: true, dynamicRadius: 1 },
      preview: { enabled: false },
    });
    toolGroup.setToolActive(brushName, { bindings: [{ mouseButton: 1 }] });
  });

  afterEach(() => {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      cleanupDOMElements: true,
    });
  });

  it('fills on one stroke what the brush fills on the GPU', async () => {
    testUtils.createViewports(renderingEngine, [
      {
        viewportType: ViewportType.PLANAR,
        viewportId: gpuViewportId,
        width: 256,
        height: 256,
      },
      {
        viewportType: ViewportType.PLANAR,
        viewportId: cpuViewportId,
        width: 256,
        height: 256,
      },
    ]);
    const gpuViewport = renderingEngine.getViewport(gpuViewportId);
    const cpuViewport = renderingEngine.getViewport(cpuViewportId);
    const imageId = testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: 'imageURI',
      rows: size,
      columns: size,
      barStart: 20,
      barWidth: 30,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex: 0,
    });

    await testUtils.setStackOnNextViewport(gpuViewport, [imageId], 0);
    await testUtils.setStackOnNextViewport(cpuViewport, [imageId], 0, {
      renderBackend: 'cpu',
    });

    const labelmaps = [gpuViewportId, cpuViewportId].map((viewportId) => {
      const segmentationId = `stroke-${viewportId}`;
      const labelmapImage =
        imageLoader.createAndCacheDerivedLabelmapImage(imageId);

      segmentation.addSegmentations([
        {
          segmentationId,
          representation: {
            type: Labelmap,
            data: { imageIds: [labelmapImage.imageId] },
          },
        },
      ]);

      return { viewportId, segmentationId, labelmapImage };
    });

    for (const { viewportId, segmentationId } of labelmaps) {
      await segmentation.addSegmentationRepresentations(viewportId, [
        { segmentationId, type: Labelmap },
      ]);
    }
    renderingEngine.render();
    await wait(500);

    if (gpuViewport.getRenderPlan()[0].draw !== 'gpu') {
      pending('this karma run draws every viewport on the CPU');
    }

    expect(cpuViewport.getRenderPlan()[0].draw).toBe('cpu');

    await strokeAlongRow(gpuViewport, 32, 8, 40);
    await strokeAlongRow(cpuViewport, 32, 8, 40);

    const gpuCount = countLabelledPixels(labelmaps[0].labelmapImage);
    const cpuCount = countLabelledPixels(labelmaps[1].labelmapImage);

    expect(gpuCount).toBeGreaterThan(0);
    expect(cpuCount)
      .withContext(`pixels filled on the CPU, ${gpuCount} on the GPU`)
      .toBe(gpuCount);
  });
});
