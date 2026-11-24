import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import addOrUpdateSurfaceToElement from '../src/tools/displayTools/Surface/addOrUpdateSurfaceToElement';
import removeSurfaceFromElement from '../src/tools/displayTools/Surface/removeSurfaceFromElement';
import { createSeries } from '../../core/test/utils/planarSeriesBothModes';

const { utilities, Enums, volumeLoader, geometryLoader, cache } = cornerstone3D;
const { ViewportType, OrientationAxis, GeometryType } = Enums;
const {
  OrientationMarkerTool,
  OrientationControllerTool,
  VolumeCroppingTool,
  ToolGroupManager,
  segmentation,
  Enums: csToolsEnums,
} = csTools3d;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'next3DTools';

/** The widgets of the legacy 3D viewport with the orientation marker. */
const LEGACY_WIDGET_COUNT = 1;

/**
 * The actors of the legacy 3D viewport with a volume and one surface, and
 * with the volume alone.
 */
const LEGACY_ACTOR_COUNT_WITH_SURFACE = 2;
const LEGACY_ACTOR_COUNT_OF_VOLUME = 1;

/** The parallel scale of the legacy 3D viewport after the surface was added. */
const LEGACY_PARALLEL_SCALE_WITH_SURFACE = 15;

/** The sphere handles of the cropping tool on the legacy 3D viewport. */
const LEGACY_CROPPING_SPHERE_COUNT = 14;

/**
 * The UIDs of the actors that the cropping tool added to the legacy 3D
 * viewport, sorted: 8 corners, 12 edges and 6 faces. They were also all the
 * actors of its vtk.js renderer.
 */
const LEGACY_CROPPING_ACTOR_UIDS = [
  'corner_XMAX_YMAX_ZMAX',
  'corner_XMAX_YMAX_ZMIN',
  'corner_XMAX_YMIN_ZMAX',
  'corner_XMAX_YMIN_ZMIN',
  'corner_XMIN_YMAX_ZMAX',
  'corner_XMIN_YMAX_ZMIN',
  'corner_XMIN_YMIN_ZMAX',
  'corner_XMIN_YMIN_ZMIN',
  'edge_XMAX_YMAX_ZMIN_XMAX_YMAX_ZMAX',
  'edge_XMAX_YMIN_ZMAX_XMAX_YMAX_ZMAX',
  'edge_XMAX_YMIN_ZMIN_XMAX_YMAX_ZMIN',
  'edge_XMAX_YMIN_ZMIN_XMAX_YMIN_ZMAX',
  'edge_XMIN_YMAX_ZMAX_XMAX_YMAX_ZMAX',
  'edge_XMIN_YMAX_ZMIN_XMAX_YMAX_ZMIN',
  'edge_XMIN_YMAX_ZMIN_XMIN_YMAX_ZMAX',
  'edge_XMIN_YMIN_ZMAX_XMAX_YMIN_ZMAX',
  'edge_XMIN_YMIN_ZMAX_XMIN_YMAX_ZMAX',
  'edge_XMIN_YMIN_ZMIN_XMAX_YMIN_ZMIN',
  'edge_XMIN_YMIN_ZMIN_XMIN_YMAX_ZMIN',
  'edge_XMIN_YMIN_ZMIN_XMIN_YMIN_ZMAX',
  'x_max',
  'x_min',
  'y_max',
  'y_min',
  'z_max',
  'z_min',
];
const LEGACY_CROPPING_SCENE_ACTOR_COUNT = 26;

/**
 * The origins of the six clipping planes of the volume mapper of the legacy
 * 3D viewport with the cropping tool active on the volume of the tests.
 */
const LEGACY_CLIPPING_PLANE_ORIGINS = [
  [2.4, 20, 12],
  [27.6, 20, 12],
  [15, 3.2, 12],
  [15, 36.8, 12],
  [15, 20, 1.92],
  [15, 20, 22.08],
];

/**
 * The look of the labelmap actor of the legacy 3D viewport for the values 0,
 * 1 and 2: red, green, blue and opacity.
 */
const LEGACY_LABELMAP_LOOKS = [
  [0, 0, 0, 0],
  [0.8666666666666667, 0.32941176470588235, 0.32941176470588235, 0.5],
  [0.30196078431372547, 0.8941176470588236, 0.4745098039215686, 0.5],
];

/**
 * The blend mode of the mapper of the labelmap actor of the legacy 3D
 * viewport: the maximum intensity blend.
 */
const LEGACY_LABELMAP_BLEND_MODE = 1;

/**
 * Makes a direct next 3D viewport in the rendering engine and adds it to the
 * tool group.
 */
function createNextViewport(renderingEngine) {
  testUtils.createViewports(renderingEngine, {
    orientation: OrientationAxis.SAGITTAL,
    width: 400,
    height: 300,
    useEnableElement: true,
    viewportId: 'next3D',
    viewportType: ViewportType.VOLUME_3D,
  });
  ToolGroupManager.getToolGroup(toolGroupId).addViewport(
    'next3D',
    renderingEngineId
  );

  return renderingEngine.getViewport('next3D');
}

/**
 * A surface of one triangle fan around the volume of the tests: four points
 * and two triangles, in the shape that the Surface representation draws. It
 * is the surface of a cached geometry, which a next 3D viewport mounts as a
 * display set.
 */
function createSurface() {
  if (cache.getGeometry('next3DSurface')) {
    cache.removeGeometryLoadObject('next3DSurface');
  }

  const surface = geometryLoader.createAndCacheGeometry('next3DSurface', {
    type: GeometryType.SURFACE,
    geometryData: {
      id: 'next3DSurface',
      frameOfReferenceUID: 'surfaceFrameOfReference',
      points: [0, 0, 0, 30, 0, 0, 30, 20, 10, 0, 20, 10],
      polys: [3, 0, 1, 2, 3, 0, 2, 3],
      color: [255, 0, 0],
      segmentIndex: 1,
    },
  }).data;

  surface.visible = true;

  return surface;
}

/** The actors that are not volumes, as `[uid, ...]` sorted. */
function surfaceActorUIDsOf(viewport) {
  return viewport
    .getActors()
    .filter(({ actor }) => actor.getClassName() !== 'vtkVolume')
    .map(({ uid }) => uid)
    .sort();
}

/** The sphere handles and the edge lines that a cropping tool keeps. */
function handleActorsOf(tool) {
  return [
    ...tool.sphereStates.map(({ sphereActor }) => sphereActor),
    ...Object.values(tool.edgeLines).map(({ actor }) => actor),
  ].filter(Boolean);
}

/** The UIDs of the handles and the edge lines of a cropping tool, sorted. */
function handleUIDsOf(tool) {
  return [
    ...tool.sphereStates.map(({ uid }) => uid),
    ...Object.keys(tool.edgeLines),
  ].sort();
}

/** The actors that the vtk.js renderer of a viewport draws. */
function sceneActorsOf(viewport) {
  return viewport.getRenderer().getActors();
}

/**
 * Shows the volume on the next viewport and makes the cropping tool active
 * on it, in a tool group of its own, with its handles and its clipping
 * planes visible. Gives the tool of the next viewport.
 */
async function startCropping(next) {
  const toolName = VolumeCroppingTool.toolName;

  csTools3d.addTool(VolumeCroppingTool);

  const nextGroup = ToolGroupManager.createToolGroup('nextCropping');
  const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

  toolGroup.removeViewports(renderingEngineId, 'next3D');
  await showVolume(next);
  nextGroup.addTool(toolName);
  nextGroup.addViewport('next3D', renderingEngineId);
  nextGroup.setToolActive(toolName, { bindings: [{ mouseButton: 1 }] });

  const tool = nextGroup.getToolInstance(toolName);

  tool.setHandlesVisible(true);
  tool.setClippingPlanesVisible(true);

  return tool;
}

/** Makes and caches the volume of the tests and gives its id. */
async function createVolume() {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'volumeURI',
    id: 'volumeURI',
    rows: 30,
    columns: 40,
    slices: 12,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 2,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

  return volumeId;
}

/** Makes the volume, shows it on the next viewport and gives its id. */
async function showVolume(next) {
  const volumeId = await createVolume();

  cornerstone3D.displaySetRegistry.add('next3DVolume', {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await next.setDisplaySets({
    displaySetId: 'next3DVolume',
    options: { renderMode: 'vtkVolume3d' },
  });

  return volumeId;
}

/** Waits until the condition holds, for at most two seconds. */
async function waitFor(condition) {
  for (let attempt = 0; attempt < 100 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** The actors of the labelmap of the tests that the viewport lists. */
function labelmapActorsOf(viewport) {
  return viewport
    .getActors()
    .filter(({ representationUID }) =>
      String(representationUID ?? '').startsWith('labelmap3D')
    );
}

/**
 * The look of the labelmap actor of the viewport for the values 0, 1 and 2:
 * red, green, blue and opacity.
 */
function looksOf(viewport) {
  const { actor } = labelmapActorsOf(viewport)[0];
  const property = actor.getProperty();

  return [0, 1, 2].map((value) => {
    const rgb = [];

    property.getRGBTransferFunction(0).getColor(value, rgb);

    return [...rgb, property.getScalarOpacity(0).getValue(value)];
  });
}

/**
 * Makes a labelmap of the volume, adds it as a segmentation and shows its
 * Labelmap representation on the viewport. Waits for the labelmap actor.
 */
async function showLabelmap(volumeId, viewport) {
  await volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: 'labelmap3D',
  });
  segmentation.addSegmentations([
    {
      segmentationId: 'labelmap3D',
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: { volumeId: 'labelmap3D' },
      },
    },
  ]);
  segmentation.addSegmentationRepresentations(viewport.id, [
    {
      segmentationId: 'labelmap3D',
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);
  await waitFor(() => labelmapActorsOf(viewport).length > 0);
}

describe('Tools on a direct next 3D viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [OrientationMarkerTool, OrientationControllerTool],
    });
    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
  });

  it('shows the orientation marker as on the legacy 3D viewport', async function () {
    const next = createNextViewport(renderingEngine);
    const toolName = OrientationMarkerTool.toolName;
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    await showVolume(next);
    toolGroup.setToolEnabled(toolName);
    await waitFor(() => next.getWidgets().length === 1);

    const [widget] = next.getWidgets();
    const marker =
      toolGroup.getToolInstance(toolName).orientationMarkers[next.id];

    expect(next.getWidget).toBeUndefined();
    expect(widget).toBeDefined();
    expect(widget).toBe(marker.orientationWidget);
    expect(widget.getEnabled()).toBe(true);
    expect(widget.getRenderer()).toBeTruthy();
    expect(next.getWidgets().length).toBe(LEGACY_WIDGET_COUNT);

    next.removeWidgets();

    expect(widget.getEnabled()).toBe(false);
  });

  it('keeps one orientation marker for a viewport, and makes a new one for a viewport that is enabled again under the same id', async function () {
    const viewports = [createNextViewport(renderingEngine)];
    const toolName = OrientationMarkerTool.toolName;
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    await showVolume(...viewports);
    toolGroup.setToolEnabled(toolName);
    await waitFor(() =>
      viewports.every((viewport) => viewport.getWidgets().length === 1)
    );

    for (const viewport of viewports) {
      const { id, type, element } = viewport;
      const [widget] = viewport.getWidgets();

      cornerstone3D.triggerEvent(
        element,
        Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME,
        { viewportId: id, volumeActors: [] }
      );

      expect(viewport.getWidgets()).toEqual([widget]);
      expect(widget.getEnabled()).toBe(true);

      renderingEngine.disableElement(id);

      expect(widget.getEnabled()).toBe(false);

      renderingEngine.enableElement({
        viewportId: id,
        type,
        element,
        defaultOptions: { orientation: OrientationAxis.SAGITTAL },
      });
      toolGroup.addViewport(id, renderingEngineId);

      const enabledAgain = renderingEngine.getViewport(id);

      await waitFor(() => enabledAgain.getWidgets().length === 1);

      const [newWidget] = enabledAgain.getWidgets();

      expect(enabledAgain).not.toBe(viewport);
      expect(enabledAgain.type).toBe(type);
      expect(newWidget).toBeDefined();
      expect(newWidget).not.toBe(widget);
      expect(newWidget.getEnabled()).toBe(true);
      expect(newWidget.getParentRenderer()).toBe(enabledAgain.getRenderer());
    }
  });

  it('turns a direct next 3D viewport with the orientation controller', async function () {
    const next = createNextViewport(renderingEngine);

    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    await showVolume(next);
    testUtils.createViewports(renderingEngine, {
      viewportId: 'nextVideo',
      viewportType: ViewportType.VIDEO,
      useEnableElement: true,
    });

    expect(next.isOrientationChangeable).toBeUndefined();
    expect(utilities.viewportIsInVolumeMode(next)).toBe(true);
    expect(() =>
      toolGroup.setToolEnabled(OrientationControllerTool.toolName)
    ).not.toThrow();

    const tool = toolGroup.getToolInstance(OrientationControllerTool.toolName);

    for (const viewportId of [next.id, 'nextVideo']) {
      tool.addMarkerToViewport(viewportId, renderingEngineId);
    }

    expect(tool.widget.getActors(next.id)).toBeDefined();
    expect(tool.widget.getActors('nextVideo')).toBeUndefined();
  });

  it('shows a surface of a Surface representation as on the legacy 3D viewport', async function () {
    const next = createNextViewport(renderingEngine);

    await showVolume(next);

    const surface = createSurface();

    await addOrUpdateSurfaceToElement(next, surface, 'surfaceSegmentation');

    const [surfaceEntry] = next
      .getActors()
      .filter(({ representationUID }) => representationUID);

    expect(surfaceEntry.representationUID).toBe(
      'surfaceSegmentation-Surface-1'
    );
    expect(next.getActors().length).toBe(LEGACY_ACTOR_COUNT_WITH_SURFACE);
    expect(next.getViewState().parallelScale).toBeCloseTo(
      LEGACY_PARALLEL_SCALE_WITH_SURFACE,
      4
    );

    removeSurfaceFromElement(next.element, 'surfaceSegmentation');

    expect(next.getActors().length).toBe(1);
    expect(next.getActors().length).toBe(LEGACY_ACTOR_COUNT_OF_VOLUME);
  });

  it('crops a direct next 3D viewport with its sphere handles as the legacy 3D viewport', async function () {
    const next = createNextViewport(renderingEngine);
    const tool = await startCropping(next);

    const clippingPlanesOf = (viewport) =>
      viewport.getActors()[0].actor.getMapper().getClippingPlanes();

    expect(tool.sphereStates.length).toBeGreaterThan(0);
    expect(tool.sphereStates.length).toBe(LEGACY_CROPPING_SPHERE_COUNT);
    expect(handleUIDsOf(tool)).toEqual(LEGACY_CROPPING_ACTOR_UIDS);
    expect(sceneActorsOf(next).length).toBe(LEGACY_CROPPING_SCENE_ACTOR_COUNT);
    handleActorsOf(tool).forEach((actor) =>
      expect(sceneActorsOf(next)).toContain(actor)
    );
    expect(clippingPlanesOf(next).length).toBe(6);
    expect(clippingPlanesOf(next).length).toBe(
      LEGACY_CLIPPING_PLANE_ORIGINS.length
    );
    clippingPlanesOf(next).forEach((plane, index) => {
      const legacyOrigin = LEGACY_CLIPPING_PLANE_ORIGINS[index];

      plane.getOrigin().forEach((value, axis) => {
        expect(value).toBeCloseTo(legacyOrigin[axis], 4);
      });
    });

    await next.setDisplaySets({
      displaySetId: 'next3DVolume',
      options: { renderMode: 'vtkVolume3d' },
    });

    expect(clippingPlanesOf(next).length).toBe(6);

    ToolGroupManager.destroyToolGroup('nextCropping');
  });

  it('keeps the handles of the cropping tool as props of the tool: a direct next 3D viewport lists only its display sets', async function () {
    const next = createNextViewport(renderingEngine);
    const tool = await startCropping(next);
    const handles = handleActorsOf(tool);

    expect(handles.length).toBe(26);
    expect(next.getActors().length).toBe(1);
    expect(surfaceActorUIDsOf(next)).toEqual([]);
    expect(sceneActorsOf(next).length).toBe(26);
    handles.forEach((actor) => expect(sceneActorsOf(next)).toContain(actor));

    await next.setDisplaySets({
      displaySetId: 'next3DVolume',
      options: { renderMode: 'vtkVolume3d' },
    });

    const newHandles = handleActorsOf(tool);

    expect(newHandles.length).toBe(26);
    expect(sceneActorsOf(next).length).toBe(26);
    newHandles.forEach((actor) => {
      expect(handles).not.toContain(actor);
      expect(sceneActorsOf(next)).toContain(actor);
    });

    ToolGroupManager.destroyToolGroup('nextCropping');
  });

  it('takes the handles of the cropping tool out of the scene of a direct next 3D viewport at disable, renders, and puts them back when active again', async function () {
    const next = createNextViewport(renderingEngine);
    const tool = await startCropping(next);
    const toolName = VolumeCroppingTool.toolName;
    const nextGroup = ToolGroupManager.getToolGroup('nextCropping');
    const handles = handleActorsOf(tool);
    const croppedPoint = [...tool.sphereStates[0].point];

    spyOn(next, 'render').and.callThrough();
    nextGroup.setToolDisabled(toolName);

    expect(sceneActorsOf(next).length).toBe(0);
    expect(next.render).toHaveBeenCalled();
    expect(handleActorsOf(tool)).toEqual(handles);

    nextGroup.setToolActive(toolName, { bindings: [{ mouseButton: 1 }] });

    expect(handleActorsOf(tool)).toEqual(handles);
    expect(tool.sphereStates[0].point).toEqual(croppedPoint);
    expect(sceneActorsOf(next).length).toBe(26);
    handles.forEach((actor) => expect(sceneActorsOf(next)).toContain(actor));

    ToolGroupManager.destroyToolGroup('nextCropping');
  });

  it('shows a labelmap of a Labelmap representation as on the legacy 3D viewport', async function () {
    const next = createNextViewport(renderingEngine);
    const volumeId = await showVolume(next);

    await showLabelmap(volumeId, next);

    expect(labelmapActorsOf(next).length).toBe(1);
    expect(labelmapActorsOf(next)[0].actor.getClassName()).toBe('vtkVolume');
    expect(labelmapActorsOf(next)[0].actor.getVisibility()).toBe(true);

    await waitFor(() => looksOf(next)[1][3] === LEGACY_LABELMAP_LOOKS[1][3]);

    expect(looksOf(next)).toEqual(LEGACY_LABELMAP_LOOKS);
    expect(labelmapActorsOf(next)[0].actor.getMapper().getBlendMode()).toBe(
      LEGACY_LABELMAP_BLEND_MODE
    );

    segmentation.removeSegmentationRepresentations(next.id, {
      segmentationId: 'labelmap3D',
    });

    expect(labelmapActorsOf(next).length).toBe(0);
  });

  it('adds and mounts the labelmap of a PT series, with its PT image ids as referenced image ids, on a 3D viewport of a CT series in the same frame of reference', async function () {
    const next = createNextViewport(renderingEngine);
    const ct = await createSeries({ id: 'next3DCT' });
    const pt = await createSeries({ id: 'next3DPT', info: { PT: true } });
    const { Labelmap } = csToolsEnums.SegmentationRepresentations;

    cornerstone3D.displaySetRegistry.add('next3DCT', {
      imageIds: ct.imageIds,
      volumeId: ct.volumeId,
    });
    await next.setDisplaySets({
      displaySetId: 'next3DCT',
      options: { renderMode: 'vtkVolume3d' },
    });
    await volumeLoader.createAndCacheDerivedLabelmapVolume(pt.volumeId, {
      volumeId: 'labelmap3D',
    });
    segmentation.addSegmentations([
      {
        segmentationId: 'labelmap3D',
        representation: {
          type: Labelmap,
          data: { volumeId: 'labelmap3D', referencedImageIds: pt.imageIds },
        },
      },
    ]);
    segmentation.addSegmentationRepresentations(next.id, [
      { segmentationId: 'labelmap3D', type: Labelmap },
    ]);
    await waitFor(() => labelmapActorsOf(next).length > 0);

    expect(next.getCurrentMode()).toBe('volume3d');
    expect(next.getImageIds()).toEqual(ct.imageIds);
    expect(
      segmentation.state.getSegmentationRepresentations(next.id, {
        segmentationId: 'labelmap3D',
      }).length
    ).toBe(1);
    expect(labelmapActorsOf(next).length).toBe(1);
  });
});
