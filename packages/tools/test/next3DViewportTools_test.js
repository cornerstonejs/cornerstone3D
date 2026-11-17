import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import addOrUpdateSurfaceToElement from '../src/tools/displayTools/Surface/addOrUpdateSurfaceToElement';
import removeSurfaceFromElement from '../src/tools/displayTools/Surface/removeSurfaceFromElement';

const {
  utilities,
  Enums,
  volumeLoader,
  geometryLoader,
  cache,
  getConfiguration,
} = cornerstone3D;
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

/**
 * Makes a legacy 3D viewport and a direct next 3D viewport of the same size
 * and orientation in one rendering engine, and adds both to the tool group.
 */
function createViewports(renderingEngine) {
  const rendering = getConfiguration().rendering;
  const useGenericViewport = rendering.useGenericViewport;
  const viewportOptions = {
    orientation: OrientationAxis.SAGITTAL,
    width: 400,
    height: 300,
    useEnableElement: true,
  };

  rendering.useGenericViewport = false;
  testUtils.createViewports(renderingEngine, {
    ...viewportOptions,
    viewportId: 'legacy3D',
    viewportType: ViewportType.VOLUME_3D,
  });
  rendering.useGenericViewport = useGenericViewport;
  testUtils.createViewports(renderingEngine, {
    ...viewportOptions,
    viewportId: 'next3D',
    viewportType: ViewportType.VOLUME_3D_NEXT,
  });

  const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

  toolGroup.addViewport('legacy3D', renderingEngineId);
  toolGroup.addViewport('next3D', renderingEngineId);

  return [
    renderingEngine.getViewport('legacy3D'),
    renderingEngine.getViewport('next3D'),
  ];
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
 * Shows the volume on both viewports and makes the cropping tool active on
 * each, in a tool group of its own, with its handles and its clipping planes
 * visible. Gives the tool of the legacy and of the next viewport.
 */
async function startCropping(legacy, next) {
  const toolName = VolumeCroppingTool.toolName;

  csTools3d.addTool(VolumeCroppingTool);

  const legacyGroup = ToolGroupManager.createToolGroup('legacyCropping');
  const nextGroup = ToolGroupManager.createToolGroup('nextCropping');
  const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

  toolGroup.removeViewports(renderingEngineId, 'legacy3D');
  toolGroup.removeViewports(renderingEngineId, 'next3D');
  await showVolume(legacy, next);

  return [
    [legacyGroup, 'legacy3D'],
    [nextGroup, 'next3D'],
  ].map(([group, viewportId]) => {
    group.addTool(toolName);
    group.addViewport(viewportId, renderingEngineId);
    group.setToolActive(toolName, { bindings: [{ mouseButton: 1 }] });

    const tool = group.getToolInstance(toolName);

    tool.setHandlesVisible(true);
    tool.setClippingPlanesVisible(true);

    return tool;
  });
}

/** Makes a volume and shows it on the legacy and on the next viewport. */
async function showVolume(legacy, next) {
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
  await legacy.setVolumes([{ volumeId }]);
  utilities.genericViewportDisplaySetMetadataProvider.add('next3DVolume', {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await next.setDisplaySets({
    displaySetId: 'next3DVolume',
    options: { renderMode: 'vtkVolume3d' },
  });
}

/** Waits until the condition holds, for at most two seconds. */
async function waitFor(condition) {
  for (let attempt = 0; attempt < 100 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
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
    const [legacy, next] = createViewports(renderingEngine);
    const toolName = OrientationMarkerTool.toolName;
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    await showVolume(legacy, next);
    toolGroup.setToolEnabled(toolName);
    await waitFor(
      () =>
        Boolean(legacy.getWidget(toolName)) && next.getWidgets().length === 1
    );

    const [widget] = next.getWidgets();
    const marker =
      toolGroup.getToolInstance(toolName).orientationMarkers[next.id];

    expect(next.getWidget).toBeUndefined();
    expect(widget).toBeDefined();
    expect(widget).toBe(marker.orientationWidget);
    expect(widget.getEnabled()).toBe(true);
    expect(widget.getRenderer()).toBeTruthy();
    expect(next.getWidgets().length).toBe(legacy.getWidgets().length);

    next.removeWidgets();

    expect(widget.getEnabled()).toBe(false);
  });

  it('keeps one orientation marker for a viewport, and makes a new one for a viewport that is enabled again under the same id', async function () {
    const viewports = createViewports(renderingEngine);
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

      const rendering = getConfiguration().rendering;
      const useGenericViewport = rendering.useGenericViewport;

      renderingEngine.disableElement(id);

      expect(widget.getEnabled()).toBe(false);

      rendering.useGenericViewport = false;
      renderingEngine.enableElement({
        viewportId: id,
        type,
        element,
        defaultOptions: { orientation: OrientationAxis.SAGITTAL },
      });
      rendering.useGenericViewport = useGenericViewport;
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

  it('turns a direct next 3D viewport with the orientation controller, as the legacy viewport', async function () {
    const [legacy, next] = createViewports(renderingEngine);

    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    await showVolume(legacy, next);
    testUtils.createViewports(renderingEngine, {
      viewportId: 'nextVideo',
      viewportType: ViewportType.VIDEO_NEXT,
      useEnableElement: true,
    });

    expect(legacy.isOrientationChangeable()).toBe(true);
    expect(next.isOrientationChangeable).toBeUndefined();
    expect(utilities.viewportIsInVolumeMode(next)).toBe(true);
    expect(() =>
      toolGroup.setToolEnabled(OrientationControllerTool.toolName)
    ).not.toThrow();

    const tool = toolGroup.getToolInstance(OrientationControllerTool.toolName);

    for (const viewportId of [legacy.id, next.id, 'nextVideo']) {
      tool.addMarkerToViewport(viewportId, renderingEngineId);
    }

    expect(tool.widget.getActors(legacy.id)).toBeDefined();
    expect(tool.widget.getActors(next.id)).toBeDefined();
    expect(tool.widget.getActors('nextVideo')).toBeUndefined();
  });

  it('shows a surface of a Surface representation as on the legacy 3D viewport', async function () {
    const [legacy, next] = createViewports(renderingEngine);

    await showVolume(legacy, next);

    const surface = createSurface();

    addOrUpdateSurfaceToElement(legacy, surface, 'surfaceSegmentation');
    await addOrUpdateSurfaceToElement(next, surface, 'surfaceSegmentation');

    const [surfaceEntry] = next
      .getActors()
      .filter(({ representationUID }) => representationUID);

    expect(surfaceEntry.representationUID).toBe(
      'surfaceSegmentation-Surface-1'
    );
    expect(next.getActors().length).toBe(legacy.getActors().length);
    expect(next.getViewState().parallelScale).toBeCloseTo(
      legacy.getCamera().parallelScale,
      4
    );

    removeSurfaceFromElement(legacy.element, 'surfaceSegmentation');
    removeSurfaceFromElement(next.element, 'surfaceSegmentation');

    expect(next.getActors().length).toBe(1);
    expect(next.getActors().length).toBe(legacy.getActors().length);
  });

  it('crops a direct next 3D viewport with its sphere handles as the legacy 3D viewport', async function () {
    const [legacy, next] = createViewports(renderingEngine);
    const tools = await startCropping(legacy, next);

    const clippingPlanesOf = (viewport) =>
      viewport.getActors()[0].actor.getMapper().getClippingPlanes();

    expect(tools[1].sphereStates.length).toBeGreaterThan(0);
    expect(tools[1].sphereStates.length).toBe(tools[0].sphereStates.length);
    expect(handleUIDsOf(tools[1])).toEqual(surfaceActorUIDsOf(legacy));
    expect(sceneActorsOf(next).length).toBe(sceneActorsOf(legacy).length);
    handleActorsOf(tools[1]).forEach((actor) =>
      expect(sceneActorsOf(next)).toContain(actor)
    );
    expect(clippingPlanesOf(next).length).toBe(6);
    expect(clippingPlanesOf(next).length).toBe(clippingPlanesOf(legacy).length);
    clippingPlanesOf(next).forEach((plane, index) => {
      const legacyPlane = clippingPlanesOf(legacy)[index];

      plane.getOrigin().forEach((value, axis) => {
        expect(value).toBeCloseTo(legacyPlane.getOrigin()[axis], 4);
      });
    });

    await next.setDisplaySets({
      displaySetId: 'next3DVolume',
      options: { renderMode: 'vtkVolume3d' },
    });

    expect(clippingPlanesOf(next).length).toBe(6);

    ToolGroupManager.destroyToolGroup('legacyCropping');
    ToolGroupManager.destroyToolGroup('nextCropping');
  });

  it('keeps the handles of the cropping tool as props of the tool: a direct next 3D viewport lists only its display sets', async function () {
    const [legacy, next] = createViewports(renderingEngine);
    const [, tool] = await startCropping(legacy, next);
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

    ToolGroupManager.destroyToolGroup('legacyCropping');
    ToolGroupManager.destroyToolGroup('nextCropping');
  });

  it('takes the handles of the cropping tool out of the scene of a direct next 3D viewport at disable, renders, and puts them back when active again', async function () {
    const [legacy, next] = createViewports(renderingEngine);
    const [, tool] = await startCropping(legacy, next);
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

    ToolGroupManager.destroyToolGroup('legacyCropping');
    ToolGroupManager.destroyToolGroup('nextCropping');
  });

  it('shows a labelmap of a Labelmap representation as on the legacy 3D viewport', async function () {
    const [legacy, next] = createViewports(renderingEngine);
    const rendering = getConfiguration().rendering;
    const useGenericViewport = rendering.useGenericViewport;

    rendering.useGenericViewport = true;
    testUtils.createViewports(renderingEngine, {
      orientation: OrientationAxis.SAGITTAL,
      width: 400,
      height: 300,
      useEnableElement: true,
      viewportId: 'adapter3D',
      viewportType: ViewportType.VOLUME_3D,
    });
    rendering.useGenericViewport = useGenericViewport;

    const adapter = renderingEngine.getViewport('adapter3D');

    await showVolume(legacy, next);
    await adapter.setVolumes([{ volumeId: legacy.getVolumeId() }]);
    await volumeLoader.createAndCacheDerivedLabelmapVolume(
      legacy.getVolumeId(),
      { volumeId: 'labelmap3D' }
    );
    segmentation.addSegmentations([
      {
        segmentationId: 'labelmap3D',
        representation: {
          type: csToolsEnums.SegmentationRepresentations.Labelmap,
          data: { volumeId: 'labelmap3D' },
        },
      },
    ]);

    const labelmapActorsOf = (viewport) =>
      viewport
        .getActors()
        .filter(({ representationUID }) =>
          String(representationUID ?? '').startsWith('labelmap3D')
        );

    for (const viewport of [legacy, adapter, next]) {
      segmentation.addSegmentationRepresentations(viewport.id, [
        {
          segmentationId: 'labelmap3D',
          type: csToolsEnums.SegmentationRepresentations.Labelmap,
        },
      ]);
    }

    await waitFor(() =>
      [legacy, adapter, next].every(
        (viewport) => labelmapActorsOf(viewport).length > 0
      )
    );

    expect(labelmapActorsOf(legacy).length).toBe(1);
    expect(labelmapActorsOf(adapter).length).toBe(1);
    expect(labelmapActorsOf(next).length).toBe(1);
    expect(labelmapActorsOf(next)[0].actor.getClassName()).toBe('vtkVolume');
    expect(labelmapActorsOf(next)[0].actor.getVisibility()).toBe(true);

    const looksOf = (viewport) => {
      const { actor } = labelmapActorsOf(viewport)[0];
      const property = actor.getProperty();

      return [0, 1, 2].map((value) => {
        const rgb = [];

        property.getRGBTransferFunction(0).getColor(value, rgb);

        return [...rgb, property.getScalarOpacity(0).getValue(value)];
      });
    };

    await waitFor(() => looksOf(next)[1][3] === looksOf(legacy)[1][3]);

    expect(looksOf(next)).toEqual(looksOf(legacy));
    expect(looksOf(adapter)).toEqual(looksOf(legacy));
    expect(labelmapActorsOf(next)[0].actor.getMapper().getBlendMode()).toBe(
      labelmapActorsOf(legacy)[0].actor.getMapper().getBlendMode()
    );

    segmentation.removeSegmentationRepresentations(next.id, {
      segmentationId: 'labelmap3D',
    });

    expect(labelmapActorsOf(next).length).toBe(0);
  });
});
