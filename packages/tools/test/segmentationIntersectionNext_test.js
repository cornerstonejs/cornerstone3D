import * as cornerstone3D from '@cornerstonejs/core';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { createNextPlanarViewport } from './nextLabelmapScenes';

const { utilities, Enums, volumeLoader, cache } = cornerstone3D;
const { ViewportType } = Enums;
const {
  SegmentationIntersectionTool,
  ToolGroupManager,
  annotation,
  Enums: csToolsEnums,
} = csTools3d;
const { Events: csToolsEvents } = csToolsEnums;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'segmentationIntersectionNext';
const viewportId = 'segmentationIntersectionNext';
const toolName = SegmentationIntersectionTool.toolName;

/** Makes a volume of 64 by 64 voxels of 1 mm and 10 slices in the cache. */
async function createVolume() {
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

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

  return volumeId;
}

/** Resolves when the annotations of the element are drawn once more. */
function waitForAnnotationsRendered(element) {
  return new Promise((resolve) => {
    element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, resolve, {
      once: true,
    });
  });
}

/**
 * Sets the tool enabled on the tool group and resolves when the annotations
 * of the element are drawn once more.
 */
function enableToolAndWaitForRender(element) {
  const rendered = waitForAnnotationsRendered(element);

  ToolGroupManager.getToolGroup(toolGroupId).setToolEnabled(toolName);

  return rendered;
}

/** The annotations of the tool in the frame of reference of a viewport. */
function getIntersectionAnnotations(viewport) {
  return (
    annotation.state.getAnnotations(
      toolName,
      viewport.getFrameOfReferenceUID()
    ) || []
  );
}

/**
 * An actor entry as an application gives it for a clipped surface: a red
 * actor and a clipping filter, whose output is the closed outline through the
 * four world points.
 */
function createClippedSurfaceEntry(worldPoints) {
  const outline = vtkPolyData.newInstance();
  const actor = vtkActor.newInstance();

  outline.getPoints().setData(Float32Array.from(worldPoints.flat()), 3);
  outline.setLines(
    vtkCellArray.newInstance({
      values: Uint16Array.from([2, 0, 1, 2, 1, 2, 2, 2, 3, 2, 3, 0]),
    })
  );
  actor.getProperty().setColor(1, 0, 0);

  return {
    uid: 'clippedSurface',
    actor,
    clippingFilter: { getOutputData: () => outline },
  };
}

describe('SegmentationIntersectionTool on a direct next viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [SegmentationIntersectionTool],
      viewportIds: [viewportId],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
  });

  it('is set enabled on a planar viewport in volume mode and adds its annotation, with no outline when no actor has a clipping filter', async function () {
    const viewport = createNextPlanarViewport(renderingEngine, viewportId);

    await testUtils.setVolumesOnNextViewport(viewport, [await createVolume()]);
    expect(viewport.getCurrentMode()).toBe('volume');
    await enableToolAndWaitForRender(viewport.element);

    const annotations = getIntersectionAnnotations(viewport);

    expect(annotations.length).toBe(1);
    expect(annotations[0].data.actorsWorldPointsMap.size).toBe(0);
  });

  it('is set enabled on a planar viewport in stack mode and adds its annotation', async function () {
    const viewport = createNextPlanarViewport(renderingEngine, viewportId);
    const imageIds = [0, 1, 2].map((sliceIndex) =>
      testUtils.encodeImageIdInfo({
        loader: 'fakeImageLoader',
        name: 'imageURI',
        rows: 64,
        columns: 64,
        barStart: 10,
        barWidth: 5,
        xSpacing: 1,
        ySpacing: 1,
        sliceIndex,
      })
    );

    await testUtils.setStackOnNextViewport(viewport, imageIds, 1);
    expect(viewport.getCurrentMode()).toBe('stack');
    await enableToolAndWaitForRender(viewport.element);

    expect(getIntersectionAnnotations(viewport).length).toBe(1);
  });

  it('draws the outline of an actor entry that has a clipping filter, and keeps it under the view normal and the slice of the viewport', async function () {
    const viewport = createNextPlanarViewport(renderingEngine, viewportId);

    await testUtils.setVolumesOnNextViewport(viewport, [await createVolume()]);

    const getActors = viewport.getActors.bind(viewport);
    const clippedSurface = createClippedSurfaceEntry(
      [
        [150, 150],
        [250, 150],
        [250, 250],
        [150, 250],
      ].map((canvasPoint) => viewport.canvasToWorld(canvasPoint))
    );

    spyOn(viewport, 'getActors').and.callFake(() => [
      ...getActors(),
      clippedSurface,
    ]);
    await enableToolAndWaitForRender(viewport.element);

    const [{ data }] = getIntersectionAnnotations(viewport);
    const outlines = data.actorsWorldPointsMap.get(clippedSurface.uid);
    const [x, y, z] = viewport.getViewReference().viewPlaneNormal;
    const normal = [x, y, z].map((value) => value.toFixed(5)).join(',');
    const firstSlice = viewport.getSliceIndex();
    const path = viewport.element.querySelector('svg path');

    expect([...outlines.keys()]).toEqual([
      `${viewportId}-${normal},-${firstSlice}`,
    ]);
    expect(path?.getAttribute('stroke')).toBe('#ff0000');
    expect(path?.getAttribute('d')).toBe(
      'M 150.0, 150.0 L 250.0, 150.0 L 250.0, 250.0 L 150.0, 250.0 Z '
    );

    const renderedAfterScroll = waitForAnnotationsRendered(viewport.element);

    utilities.scroll(viewport, { delta: 1 });
    await renderedAfterScroll;

    expect(viewport.getSliceIndex()).toBe(firstSlice + 1);
    expect([...outlines.keys()]).toEqual([
      `${viewportId}-${normal},-${firstSlice}`,
      `${viewportId}-${normal},-${firstSlice + 1}`,
    ]);
  });

  it('is set enabled while its viewport shows nothing, without a throw', function () {
    createNextPlanarViewport(renderingEngine, viewportId);

    expect(() => {
      ToolGroupManager.getToolGroup(toolGroupId).setToolEnabled(toolName);
    }).not.toThrow();
  });

  it('is set enabled on a 3D viewport, which has no slice', async function () {
    testUtils.createViewports(renderingEngine, {
      viewportType: ViewportType.VOLUME_3D_NEXT,
      viewportId,
      useEnableElement: true,
    });

    const viewport = renderingEngine.getViewport(viewportId);
    const volumeId = await createVolume();

    utilities.genericViewportDisplaySetMetadataProvider.add(
      'segmentationIntersectionNext3D',
      { imageIds: cache.getVolume(volumeId).imageIds, volumeId }
    );
    await viewport.setDisplaySets({
      displaySetId: 'segmentationIntersectionNext3D',
      options: { renderMode: 'vtkVolume3d' },
    });
    await enableToolAndWaitForRender(viewport.element);

    expect(getIntersectionAnnotations(viewport).length).toBe(1);
  });
});
