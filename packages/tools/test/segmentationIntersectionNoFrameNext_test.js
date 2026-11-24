import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as polySeg from '../../polymorphic-segmentation/src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { getConfig, setConfig } from '../src/config';
import { getSurfaceActorEntry } from '../src/stateManagement/segmentation/helpers';
import {
  createNextViewport,
  createSeries,
  showVolume,
  waitFor,
  worldOfVoxel,
} from '../../core/test/utils/planarSeriesBothModes';

const { utilities, Enums, volumeLoader, cache, metaData } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;
const {
  SegmentationIntersectionTool,
  ToolGroupManager,
  segmentation,
  Enums: csToolsEnums,
} = csTools3d;
const { Events: csToolsEvents } = csToolsEnums;
const { Surface, Labelmap } = csToolsEnums.SegmentationRepresentations;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'segmentationIntersectionNoFrame';
const viewportId = 'segmentationIntersectionNoFrame';
const viewport3DId = 'segmentationIntersectionNoFrame3D';
const segmentationId = 'segmentationIntersectionNoFrameLabelmap';

/** A series of 40 by 40 by 20 voxels of 1 mm, from z = 20 to z = 39. */
const SIZE = {
  rows: 40,
  columns: 40,
  slices: 20,
  columnSpacing: 1,
  rowSpacing: 1,
  sliceSpacing: 1,
};

/**
 * The voxel block of segment 1 of the labelmap, as [first, last] index on
 * each axis: x from 4 to 16 mm, y from 19 to 31 mm and z from 25 to 35 mm.
 */
const LABELMAP_BLOCK = [
  [14, 26],
  [14, 26],
  [5, 15],
];

/**
 * The longest wait, in ms, for the first conversion of the labelmap by
 * polySeg, which starts its worker.
 */
const FIRST_CONVERSION_TIMEOUT = 5000;

/**
 * The image plane of the images of a series made with
 * `info: { noFrameOfReference: true }`: the plane of the test series with no
 * frame of reference. It goes before the provider of the test series.
 */
function noFramePlaneProvider(type, imageId) {
  if (type !== 'imagePlaneModule' || typeof imageId !== 'string') {
    return;
  }

  const info = testUtils.decodeImageIdInfo(imageId);

  if (!info?.noFrameOfReference) {
    return;
  }

  const { plane, size, sliceIndex } = info;

  return {
    rows: size.rows,
    columns: size.columns,
    imageOrientationPatient: [...plane.rowCosines, ...plane.columnCosines],
    rowCosines: plane.rowCosines,
    columnCosines: plane.columnCosines,
    imagePositionPatient: worldOfVoxel({ plane, size }, [0, 0, sliceIndex]),
    pixelSpacing: [size.rowSpacing, size.columnSpacing],
    rowPixelSpacing: size.rowSpacing,
    columnPixelSpacing: size.columnSpacing,
  };
}

/** Gives each voxel of a block of a labelmap the value `value`. */
function fillBlock(voxelManager, [[i0, i1], [j0, j1], [k0, k1]], value) {
  for (let k = k0; k <= k1; k++) {
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        voxelManager.setAtIJK(i, j, k, value);
      }
    }
  }
}

/** The closed paths that the tools drew on the SVG layer of a viewport. */
function closedPaths(viewport) {
  return [...viewport.element.querySelectorAll('svg path')].filter((path) =>
    path.getAttribute('d').trim().endsWith('Z')
  );
}

/**
 * Sets the tool enabled on the tool group and resolves when the annotations
 * of the element are drawn once more.
 */
function enableToolAndWaitForRender(element) {
  const rendered = new Promise((resolve) => {
    element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, resolve, {
      once: true,
    });
  });

  ToolGroupManager.getToolGroup(toolGroupId).setToolEnabled(
    SegmentationIntersectionTool.toolName
  );

  return rendered;
}

describe('SegmentationIntersectionTool with the surface that polySeg converts from a labelmap of images without a frame of reference -- ', () => {
  let renderingEngine;
  let config;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [SegmentationIntersectionTool],
      viewportIds: [viewportId],
    }).renderingEngine;
    metaData.addProvider(noFramePlaneProvider, 30000);
    config = getConfig();
    polySeg.init();
    setConfig({ ...config, addons: { ...config.addons, polySeg } });
  });

  afterEach(function () {
    setConfig(config);
    metaData.removeProvider(noFramePlaneProvider);
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
    cornerstone3D.displaySetRegistry.clear?.();
  });

  it('gives the converted surface the frame of reference that the planar viewport makes up for the images, and the tool draws the cut on that viewport', async function () {
    const series = await createSeries({
      id: 'segmentationIntersectionNoFrame',
      size: SIZE,
      info: { noFrameOfReference: true },
    });
    const viewport = createNextViewport(renderingEngine, viewportId);

    await showVolume(viewport, series, 10, {
      orientation: OrientationAxis.AXIAL,
    });
    volumeLoader.createAndCacheDerivedLabelmapVolume(series.volumeId, {
      volumeId: segmentationId,
    });
    fillBlock(cache.getVolume(segmentationId).voxelManager, LABELMAP_BLOCK, 1);
    segmentation.addSegmentations([
      {
        segmentationId,
        representation: { type: Labelmap, data: { volumeId: segmentationId } },
        config: { segments: { 1: {} } },
      },
    ]);
    testUtils.createViewports(renderingEngine, {
      viewportType: ViewportType.VOLUME_3D,
      viewportId: viewport3DId,
      orientation: OrientationAxis.CORONAL,
      width: 300,
      height: 300,
      useEnableElement: true,
    });
    segmentation.addSegmentationRepresentations(viewport3DId, [
      { segmentationId, type: Surface },
    ]);
    await waitFor(
      () => getSurfaceActorEntry(viewport3DId, segmentationId, 1),
      FIRST_CONVERSION_TIMEOUT
    );

    const frameOfReferenceUID = viewport.getFrameOfReferenceUID();
    const geometryId = segmentation.state
      .getSegmentation(segmentationId)
      .representationData.Surface.geometryIds.get(1);

    expect(cache.getVolume(series.volumeId).metadata.FrameOfReferenceUID)
      .withContext('the series has no frame of reference')
      .toBeFalsy();
    expect(frameOfReferenceUID).toMatch(/^noFrameOfReference-/);
    expect(frameOfReferenceUID).toBe(
      utilities.getImagesFrameOfReferenceUID(series.imageIds)
    );
    expect(cache.getGeometry(geometryId).data.frameOfReferenceUID).toBe(
      frameOfReferenceUID
    );

    await enableToolAndWaitForRender(viewport.element);

    expect(closedPaths(viewport).length).toBe(1);
  }, 30000);
});
