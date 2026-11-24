import * as cornerstone3D from '@cornerstonejs/core';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { getConfig, setConfig } from '../src/config';
import { getSurfaceActorEntry } from '../src/stateManagement/segmentation/helpers';
import addOrUpdateSurfaceToElement from '../src/tools/displayTools/Surface/addOrUpdateSurfaceToElement';
import { waitFor } from '../../core/test/utils/planarSeriesBothModes';

const {
  utilities,
  Enums,
  geometryLoader,
  cache,
  RenderingEngine,
  getEnabledElementByViewportId,
} = cornerstone3D;
const { ViewportType, OrientationAxis, GeometryType } = Enums;
const { segmentation, Enums: csToolsEnums } = csTools3d;
const { Surface } = csToolsEnums.SegmentationRepresentations;
const renderingEngineId = utilities.uuidv4();
const otherRenderingEngineId = utilities.uuidv4();
const segmentationId = 'surfaceDisplaySetViewports';
const geometryId = 'surfaceDisplaySetViewportsSphere';
const representationUID = `${segmentationId}-${Surface}-1`;

/** Makes a next 3D viewport in a rendering engine. */
function create3DViewport(renderingEngine, viewportId) {
  testUtils.createViewports(renderingEngine, {
    viewportType: ViewportType.VOLUME_3D,
    viewportId,
    orientation: OrientationAxis.CORONAL,
    width: 200,
    height: 200,
    useEnableElement: true,
  });

  return renderingEngine.getViewport(viewportId);
}

/**
 * Caches a closed sphere as the surface of segment 1 and adds a segmentation
 * whose Surface representation is that sphere.
 */
function addSphereSegmentation() {
  const sphere = vtkSphereSource.newInstance({
    center: [0, 0, 0],
    radius: 10,
    phiResolution: 12,
    thetaResolution: 12,
  });

  sphere.update();

  const polyData = sphere.getOutputData();

  geometryLoader.createAndCacheGeometry(geometryId, {
    type: GeometryType.SURFACE,
    geometryData: {
      id: geometryId,
      color: [255, 0, 0],
      frameOfReferenceUID: 'surfaceDisplaySetViewportsFrame',
      points: Array.from(polyData.getPoints().getData()),
      polys: Array.from(polyData.getPolys().getData()),
      segmentIndex: 1,
    },
  });
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: Surface,
        data: { geometryIds: new Map([[1, geometryId]]) },
      },
    },
  ]);
}

/** Whether a viewport shows the surface of segment 1 as an actor entry. */
function showsSurface(viewport) {
  return viewport
    .getActors()
    .some((entry) => entry.representationUID === representationUID);
}

/** The registration of the display set of the surface. */
function registrationOfSurface() {
  return cornerstone3D.displaySetRegistry.get(geometryId);
}

describe('The surface of a segmentation on several next 3D viewports -- ', () => {
  let renderingEngine;
  let config;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
    config = getConfig();
    setConfig({
      ...config,
      addons: {
        polySeg: {
          init: () => undefined,
          canComputeRequestedRepresentation: () => false,
          updateSurfaceData: () => Promise.resolve(),
        },
      },
    });
  });

  afterEach(function () {
    setConfig(config);
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    if (cache.getGeometry(geometryId)) {
      cache.removeGeometryLoadObject(geometryId);
    }
    cornerstone3D.displaySetRegistry.clear();
  });

  it('keeps the registration of the surface while another 3D viewport shows it, so that a mount of the display sets there keeps the segmentation of the surface', async function () {
    const first = create3DViewport(renderingEngine, 'surfaceFirst');
    const second = create3DViewport(renderingEngine, 'surfaceSecond');

    addSphereSegmentation();
    [first, second].forEach((viewport) =>
      segmentation.addSegmentationRepresentations(viewport.id, [
        { segmentationId, type: Surface },
      ])
    );
    await waitFor(() => showsSurface(first) && showsSurface(second));

    segmentation.removeSegmentationRepresentation(first.id, {
      segmentationId,
      type: Surface,
    });
    await waitFor(() => !showsSurface(first));

    expect(showsSurface(second)).toBe(true);
    expect(registrationOfSurface()).toBeDefined();

    await second.setDisplaySets(...second.getDisplaySets());

    expect(
      getSurfaceActorEntry(second.id, segmentationId, 1)?.representationUID
    ).toBe(representationUID);

    segmentation.removeSegmentationRepresentation(second.id, {
      segmentationId,
      type: Surface,
    });
    await waitFor(() => !showsSurface(second));

    expect(registrationOfSurface()).toBeUndefined();
  });

  it('shows the surface on a 3D viewport whose id a 3D viewport of another rendering engine has, which shows the surface already', async function () {
    const otherRenderingEngine = new RenderingEngine(otherRenderingEngineId);
    const viewportId = 'surfaceSameId';
    const viewports = [
      create3DViewport(renderingEngine, viewportId),
      create3DViewport(otherRenderingEngine, viewportId),
    ];
    const elements = viewports.map(({ element }) => element);

    try {
      addSphereSegmentation();

      const surface = cache.getGeometry(geometryId).data;
      const foundById = getEnabledElementByViewportId(viewportId).viewport;
      const inOrder = [
        foundById,
        ...viewports.filter((viewport) => viewport !== foundById),
      ];

      for (const viewport of inOrder) {
        await addOrUpdateSurfaceToElement(
          viewport,
          surface,
          segmentationId,
          geometryId
        );
      }

      expect(inOrder.map(showsSurface)).toEqual([true, true]);
    } finally {
      otherRenderingEngine.destroy();
      elements.forEach((element) => element.remove());
    }
  });
});
