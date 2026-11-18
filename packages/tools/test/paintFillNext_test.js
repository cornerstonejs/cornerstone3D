import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { performMouseDownAndUp } from '../../../utils/test/testUtilsMouseEvents';
import {
  createNextPlanarViewport,
  showVolumeWithLabelmap,
  showStackWithLabelmap,
  canvasToIndex,
} from './nextLabelmapScenes';

const { utilities } = cornerstone3D;
const { PaintFillTool } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'paintFillNext';
const viewportId = 'paintFillNext';
const segmentationId = 'paintFillNextSegmentation';
const RING_SEGMENT_INDEX = 2;
const RING_START = 20;
const RING_END = 40;

/**
 * Draws the outline of a square of segment 2 on a slice of the labelmap, from
 * voxel 20 to voxel 40 on both axes.
 */
function drawRing(voxelManager, slice) {
  for (let position = RING_START; position <= RING_END; position++) {
    [
      [position, RING_START],
      [position, RING_END],
      [RING_START, position],
      [RING_END, position],
    ].forEach(([column, row]) => {
      voxelManager.setAtIJK(column, row, slice, RING_SEGMENT_INDEX);
    });
  }
}

/**
 * Presses and releases the first mouse button on the voxel of an index, with
 * the paint fill tool active.
 */
function clickOnIndex(viewport, imageData, index) {
  const { element } = viewport;
  const { pageX, pageY, clientX, clientY } =
    testUtils.createNormalizedMouseEvent(imageData, index, element, viewport);

  return performMouseDownAndUp(
    element,
    new MouseEvent('mousedown', {
      target: element,
      buttons: 1,
      clientX,
      clientY,
      pageX,
      pageY,
    }),
    new MouseEvent('mouseup'),
    null,
    null,
    false
  );
}

describe('PaintFillTool on a direct next planar viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [PaintFillTool],
      toolActivations: {
        [PaintFillTool.toolName]: { bindings: [{ mouseButton: 1 }] },
      },
      viewportIds: [viewportId],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
  });

  it('fills the region of the click on the slice shown and stops at another segment, in volume mode', async function () {
    const viewport = createNextPlanarViewport(renderingEngine, viewportId);
    const { voxelManager, imageData } = await showVolumeWithLabelmap(
      viewport,
      segmentationId
    );
    const slice = canvasToIndex(viewport, imageData, [200, 200])[2];

    expect(viewport.getCurrentMode()).toBe('volume');
    drawRing(voxelManager, slice);
    await clickOnIndex(viewport, imageData, [30, 30, slice]);

    expect(voxelManager.getAtIJK(30, 30, slice)).toBe(1);
    expect(voxelManager.getAtIJK(RING_START + 1, RING_END - 1, slice)).toBe(1);
    expect(voxelManager.getAtIJK(RING_START, 30, slice)).toBe(
      RING_SEGMENT_INDEX
    );
    expect(voxelManager.getAtIJK(10, 10, slice)).toBe(0);
    expect(voxelManager.getAtIJK(30, 30, slice + 1)).toBe(0);
  });

  it('fills the region of the click on the image shown and stops at another segment, in stack mode', async function () {
    const viewport = createNextPlanarViewport(renderingEngine, viewportId);
    const { voxelManager, imageData } = await showStackWithLabelmap(
      viewport,
      segmentationId
    );

    expect(viewport.getCurrentMode()).toBe('stack');
    drawRing(voxelManager, 0);
    await clickOnIndex(viewport, imageData, [30, 30, 0]);

    expect(voxelManager.getAtIJK(30, 30, 0)).toBe(1);
    expect(voxelManager.getAtIJK(RING_START + 1, RING_END - 1, 0)).toBe(1);
    expect(voxelManager.getAtIJK(RING_START, 30, 0)).toBe(RING_SEGMENT_INDEX);
    expect(voxelManager.getAtIJK(10, 10, 0)).toBe(0);
  });
});
