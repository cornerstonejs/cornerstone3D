import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { getConfig, setConfig } from '../src/config';
import { getSurfaceActorEntry } from '../src/stateManagement/segmentation/helpers';

const { utilities, Enums, volumeLoader, geometryLoader, cache } = cornerstone3D;
const { ViewportType, OrientationAxis, GeometryType } = Enums;
const { ToolGroupManager, segmentation, Enums: csToolsEnums } = csTools3d;
const { Surface } = csToolsEnums.SegmentationRepresentations;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'next3DSurface';
const segmentationId = 'surfaceSegmentation';

/**
 * The actors of the legacy 3D viewport with the volume and the surfaces of
 * the two segments, and with the volume alone.
 */
const LEGACY_ACTOR_COUNT_WITH_SURFACES = 3;
const LEGACY_ACTOR_COUNT_OF_VOLUME = 1;

/**
 * The colour of the surface actor of each segment on the legacy 3D viewport:
 * the colour of the segment, 221, 84, 84 and 77, 228, 121, over 255.
 */
const LEGACY_SURFACE_COLORS = {
  1: [0.8666666666666667, 0.32941176470588235, 0.32941176470588235],
  2: [0.30196078431372547, 0.8941176470588236, 0.4745098039215686],
};

/**
 * The bounds of the surface actor of a segment on the legacy 3D viewport:
 * those of the points of `addSurfaceSegmentation`.
 */
function legacySurfaceBounds(segmentIndex) {
  const z = segmentIndex * 6;

  return [0, 30, 0, 20, z, z];
}

/**
 * The bounds of the surface actor of segment 1 on the legacy 3D viewport
 * after the surface got a fifth point at 15, 10, 20.
 */
const LEGACY_SURFACE_BOUNDS_WITH_NEW_DATA = [0, 30, 0, 20, 6, 20];

/**
 * What `getSurfaceActorEntry` gave on the legacy 3D viewport, read on commit
 * 58914567b: for each segment an entry with a string uid, the representation
 * UID of the segment and the actor that the renderer drew, in the colours of
 * `LEGACY_SURFACE_COLORS`. The entry stayed, with a hidden actor, while the
 * segment was hidden, and it was undefined for a segment without a surface
 * and after the representation was removed.
 */
const LEGACY_SURFACE_ENTRY_SEGMENTS = [1, 2];

const viewportOptions = {
  orientation: OrientationAxis.SAGITTAL,
  width: 400,
  height: 300,
  useEnableElement: true,
};

/**
 * Makes a direct next 3D viewport in the rendering engine and adds it to the
 * tool group.
 */
function createNextViewport(renderingEngine) {
  testUtils.createViewports(renderingEngine, {
    ...viewportOptions,
    viewportId: 'next3D',
    viewportType: ViewportType.VOLUME_3D_NEXT,
  });
  ToolGroupManager.getToolGroup(toolGroupId).addViewport(
    'next3D',
    renderingEngineId
  );

  return renderingEngine.getViewport('next3D');
}

/**
 * Makes a volume and shows it on the next viewport.
 */
async function showVolume(next) {
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
  utilities.genericViewportDisplaySetMetadataProvider.add('next3DVolume', {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await next.setDisplaySets({
    displaySetId: 'next3DVolume',
    options: { renderMode: 'vtkVolume3d' },
  });
}

/** The id of the geometry of a segment, as the polySeg add-on names it. */
function geometryIdOf(segmentIndex) {
  return `segmentation_${segmentationId}_surface_${segmentIndex}`;
}

/**
 * Adds a segmentation with a surface of two triangles for segment 1 and for
 * segment 2, each inside the volume of the tests.
 */
function addSurfaceSegmentation() {
  const geometryIds = new Map();

  [1, 2].forEach((segmentIndex) => {
    const z = segmentIndex * 6;

    geometryLoader.createAndCacheGeometry(geometryIdOf(segmentIndex), {
      type: GeometryType.SURFACE,
      geometryData: {
        id: geometryIdOf(segmentIndex),
        color: [200, 0, 0],
        frameOfReferenceUID: 'surfaceFrameOfReference',
        points: [0, 0, z, 30, 0, z, 30, 20, z, 0, 20, z],
        polys: [3, 0, 1, 2, 3, 0, 2, 3],
        segmentIndex,
      },
    });
    geometryIds.set(segmentIndex, geometryIdOf(segmentIndex));
  });

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: { type: Surface, data: { geometryIds } },
    },
  ]);
}

/** Shows the Surface representation of the segmentation on each viewport. */
async function showSurfaces(viewports) {
  for (const viewport of viewports) {
    segmentation.addSegmentationRepresentations(viewport.id, [
      { segmentationId, type: Surface },
    ]);
  }

  await waitFor(() =>
    viewports.every((viewport) => surfaceEntriesOf(viewport).length === 2)
  );
}

/** The actor entries of the surfaces of the segmentation, by segment. */
function surfaceEntriesOf(viewport) {
  return viewport
    .getActors()
    .filter(({ representationUID }) =>
      String(representationUID ?? '').startsWith(`${segmentationId}-Surface-`)
    )
    .sort((a, b) => a.representationUID.localeCompare(b.representationUID));
}

/** The actor of the surface of a segment, if the viewport lists one. */
function surfaceActorOf(viewport, segmentIndex) {
  return viewport
    .getActors()
    .find(
      ({ representationUID }) =>
        representationUID === `${segmentationId}-Surface-${segmentIndex}`
    )?.actor;
}

/** The ids of the display sets of a next viewport, in mount order. */
function displaySetIdsOf(viewport) {
  return viewport.getDisplaySets().map(({ displaySetId }) => displaySetId);
}

/** The registration of a display set, if there is one. */
function registeredDisplaySetOf(displaySetId) {
  const provider = utilities.genericViewportDisplaySetMetadataProvider;

  return provider.get(provider.VIEWPORT_V2_DISPLAY_SET, displaySetId);
}

/** Whether the vtk.js renderer of the viewport draws the actor. */
function isInScene(viewport, actor) {
  return viewport.getRenderer().getActors().includes(actor);
}

/** The number of points of the poly data that the actor draws. */
function pointCountOf(actor) {
  return actor.getMapper().getInputData().getPoints().getNumberOfPoints();
}

/**
 * A polySeg add-on that converts nothing. The default listener of a Surface
 * representation asks the add-on for an update of the surface data.
 */
function createPolySegStandIn() {
  return {
    init: () => undefined,
    canComputeRequestedRepresentation: () => false,
    updateSurfaceData: () => Promise.resolve(),
  };
}

/** Waits until the condition holds, for at most two seconds. */
async function waitFor(condition) {
  for (let attempt = 0; attempt < 100 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('A Surface representation on a direct next 3D viewport -- ', () => {
  let renderingEngine;
  let config;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [],
    });
    renderingEngine = testEnv.renderingEngine;
    config = getConfig();
    setConfig({ ...config, addons: { polySeg: createPolySegStandIn() } });
  });

  afterEach(function () {
    setConfig(config);
    [1, 2].map(geometryIdOf).forEach((geometryId) => {
      if (cache.getGeometry(geometryId)) {
        cache.removeGeometryLoadObject(geometryId);
      }
    });
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
  });

  it('shows the surface of each segment as the legacy 3D viewport', async function () {
    const next = createNextViewport(renderingEngine);

    await showVolume(next);
    addSurfaceSegmentation();
    await showSurfaces([next]);

    expect(
      surfaceEntriesOf(next).map(({ representationUID }) => representationUID)
    ).toEqual([`${segmentationId}-Surface-1`, `${segmentationId}-Surface-2`]);
    expect(next.getActors().length).toBe(LEGACY_ACTOR_COUNT_WITH_SURFACES);

    [1, 2].forEach((segmentIndex) => {
      const actor = surfaceActorOf(next, segmentIndex);

      expect(isInScene(next, actor)).toBe(true);
      expect(actor.getVisibility()).toBe(true);
      expect(pointCountOf(actor)).toBe(4);
      expect(actor.getProperty().getColor()).toEqual(
        LEGACY_SURFACE_COLORS[segmentIndex]
      );
      expect(actor.getBounds()).toEqual(legacySurfaceBounds(segmentIndex));
    });
  });

  it('mounts the surface of each segment as a geometry display set with its colour and visibility as presentation', async function () {
    const next = createNextViewport(renderingEngine);

    await showVolume(next);
    addSurfaceSegmentation();
    await showSurfaces([next]);
    segmentation.config.visibility.setSegmentIndexVisibility(
      next.id,
      { segmentationId, type: Surface },
      2,
      false
    );
    await waitFor(() => !surfaceActorOf(next, 2).getVisibility());

    expect(displaySetIdsOf(next)).toEqual([
      'next3DVolume',
      geometryIdOf(1),
      geometryIdOf(2),
    ]);
    expect(next.getCurrentMode()).toBe('volume3d');
    expect(registeredDisplaySetOf(geometryIdOf(1)).reference).toEqual({
      kind: 'segmentation',
      segmentationId,
      representationUID: `${segmentationId}-Surface-1`,
    });

    [1, 2].forEach((segmentIndex) => {
      const { actor, referencedId } = surfaceEntriesOf(next)[segmentIndex - 1];
      const presentation = next.getDisplaySetPresentation(
        geometryIdOf(segmentIndex)
      );

      expect(referencedId).toBe(geometryIdOf(segmentIndex));
      expect(presentation.visible).toBe(segmentIndex === 1);
      expect(actor.getVisibility()).toBe(segmentIndex === 1);
      expect(presentation.color.map((value) => value / 255)).toEqual(
        actor.getProperty().getColor()
      );
    });
  });

  it('shows a new colour of a segment', async function () {
    const next = createNextViewport(renderingEngine);

    await showVolume(next);
    addSurfaceSegmentation();
    await showSurfaces([next]);

    const actor = surfaceActorOf(next, 1);
    const otherColor = [...surfaceActorOf(next, 2).getProperty().getColor()];

    segmentation.config.color.setSegmentIndexColor(
      next.id,
      segmentationId,
      1,
      [0, 255, 0, 255]
    );
    await waitFor(() => actor.getProperty().getColor()[1] === 1);

    expect(surfaceActorOf(next, 1)).toBe(actor);
    expect(actor.getProperty().getColor()).toEqual([0, 1, 0]);
    expect(surfaceActorOf(next, 2).getProperty().getColor()).toEqual(
      otherColor
    );
  });

  it('hides and shows a segment', async function () {
    const next = createNextViewport(renderingEngine);

    await showVolume(next);
    addSurfaceSegmentation();
    await showSurfaces([next]);

    const setVisible = (visible) =>
      segmentation.config.visibility.setSegmentIndexVisibility(
        next.id,
        { segmentationId, type: Surface },
        1,
        visible
      );
    const isShown = (viewport) => surfaceActorOf(viewport, 1).getVisibility();

    setVisible(false);
    await waitFor(() => !isShown(next));

    expect(isShown(next)).toBe(false);
    expect(surfaceActorOf(next, 2).getVisibility()).toBe(true);

    setVisible(true);
    await waitFor(() => isShown(next));

    expect(isShown(next)).toBe(true);
  });

  it('shows new surface data of a segment as the legacy 3D viewport', async function () {
    const next = createNextViewport(renderingEngine);

    await showVolume(next);
    addSurfaceSegmentation();
    await showSurfaces([next]);

    const actor = surfaceActorOf(next, 1);
    const surface = cache.getGeometry(geometryIdOf(1)).data;

    surface.points = [0, 0, 6, 30, 0, 6, 30, 20, 6, 0, 20, 6, 15, 10, 20];
    surface.polys = [3, 0, 1, 4, 3, 1, 2, 4, 3, 2, 3, 4, 3, 3, 0, 4];
    segmentation.triggerSegmentationEvents.triggerSegmentationModified(
      segmentationId
    );
    await waitFor(() => pointCountOf(surfaceActorOf(next, 1)) === 5);

    expect(surfaceActorOf(next, 1)).toBe(actor);
    expect(isInScene(next, actor)).toBe(true);
    expect(pointCountOf(actor)).toBe(5);
    expect(actor.getBounds()).toEqual(LEGACY_SURFACE_BOUNDS_WITH_NEW_DATA);
    expect(actor.getBounds()[5]).toBe(20);
    expect(pointCountOf(surfaceActorOf(next, 2))).toBe(4);
  });

  it('takes the surfaces of a removed representation out of the scene as the legacy 3D viewport', async function () {
    const next = createNextViewport(renderingEngine);

    await showVolume(next);
    addSurfaceSegmentation();
    await showSurfaces([next]);

    const actors = [1, 2].map((segmentIndex) =>
      surfaceActorOf(next, segmentIndex)
    );

    segmentation.removeSegmentationRepresentations(next.id, {
      segmentationId,
      type: Surface,
    });

    expect(surfaceEntriesOf(next).length).toBe(0);
    expect(next.getActors().length).toBe(1);
    expect(next.getActors().length).toBe(LEGACY_ACTOR_COUNT_OF_VOLUME);
    actors.forEach((actor) => expect(isInScene(next, actor)).toBe(false));
    expect(displaySetIdsOf(next)).toEqual(['next3DVolume']);
    expect(registeredDisplaySetOf(geometryIdOf(1))).toBeUndefined();
    expect(registeredDisplaySetOf(geometryIdOf(2))).toBeUndefined();
  });

  it('finds the surface of each segment with getSurfaceActorEntry, as on the legacy 3D viewport', async function () {
    const next = createNextViewport(renderingEngine);

    await showVolume(next);
    addSurfaceSegmentation();
    await showSurfaces([next]);

    LEGACY_SURFACE_ENTRY_SEGMENTS.forEach((segmentIndex) => {
      const entry = getSurfaceActorEntry(next.id, segmentationId, segmentIndex);

      expect(typeof entry.uid).toBe('string');
      expect(entry.representationUID).toBe(
        `${segmentationId}-Surface-${segmentIndex}`
      );
      expect(entry.referencedId).toBe(geometryIdOf(segmentIndex));
      expect(entry.actor).toBe(surfaceActorOf(next, segmentIndex));
      expect(isInScene(next, entry.actor)).toBe(true);
      expect(entry.actor.getVisibility()).toBe(true);
      expect(entry.actor.getProperty().getColor()).toEqual(
        LEGACY_SURFACE_COLORS[segmentIndex]
      );
    });
    expect(getSurfaceActorEntry(next.id, segmentationId, 3)).toBeUndefined();

    segmentation.config.visibility.setSegmentIndexVisibility(
      next.id,
      { segmentationId, type: Surface },
      2,
      false
    );
    await waitFor(() => !surfaceActorOf(next, 2).getVisibility());

    const hiddenEntry = getSurfaceActorEntry(next.id, segmentationId, 2);

    expect(hiddenEntry.actor).toBe(surfaceActorOf(next, 2));
    expect(hiddenEntry.actor.getVisibility()).toBe(false);

    segmentation.removeSegmentationRepresentations(next.id, {
      segmentationId,
      type: Surface,
    });

    LEGACY_SURFACE_ENTRY_SEGMENTS.forEach((segmentIndex) =>
      expect(
        getSurfaceActorEntry(next.id, segmentationId, segmentIndex)
      ).toBeUndefined()
    );
  });
});
