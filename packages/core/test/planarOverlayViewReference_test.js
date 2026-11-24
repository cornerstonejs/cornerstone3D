import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  STRAIGHT_PLANE,
  waitFor,
  worldOfVoxel,
} from './utils/planarSeriesBothModes';

const { Enums, utilities } = cornerstone3D;
const { OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * A PET of half the CT grid in each axis over the same extent: 16 columns of
 * 2 mm, 12 rows of 3 mm and 4 slices of 4 mm, where the CT has 32 columns of
 * 1 mm, 24 rows of 1.5 mm and 8 slices of 2 mm.
 */
const PET_SIZE = {
  rows: 12,
  columns: 16,
  slices: 4,
  columnSpacing: 2,
  rowSpacing: 3,
  sliceSpacing: 4,
};

const BACKENDS = [
  { name: 'on the GPU', options: {} },
  { name: 'on the CPU', options: { renderBackend: 'cpu' } },
];

/** Resolves after a few animation frames. */
async function frames(count = 3) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** Waits until what the viewport was asked for is drawn. */
async function settle(viewport) {
  await frames();
  await renderAndWait(viewport);
}

/** The display sets of a viewport with their roles, in order. */
function layers(viewport) {
  return viewport
    .getDisplaySets()
    .map(({ displaySetId, options }) => `${options?.role}:${displaySetId}`);
}

/** The volumes of the actors of a viewport, in order. */
function actorOrder(viewport) {
  return viewport.getActors().map(({ referencedId }) => referencedId);
}

/**
 * Registers a CT and a PET of one frame of reference as display sets, as
 * volumes or as stacks.
 */
async function createFusionSeries(name, mode) {
  const ct = await createSeries({ id: `${name}-ct`, plane: STRAIGHT_PLANE });
  const pt = await createSeries({
    id: `${name}-pt`,
    plane: STRAIGHT_PLANE,
    size: PET_SIZE,
    info: { PT: true },
  });
  const ctId = `${name}-ct-${mode}`;
  const ptId = `${name}-pt-${mode}`;

  utilities.genericViewportDisplaySetMetadataProvider.add(
    ctId,
    mode === 'volume'
      ? { imageIds: ct.imageIds, volumeId: ct.volumeId }
      : { imageIds: ct.imageIds, kind: 'planar', initialImageIdIndex: 0 }
  );
  utilities.genericViewportDisplaySetMetadataProvider.add(
    ptId,
    mode === 'volume'
      ? { imageIds: pt.imageIds, volumeId: pt.volumeId }
      : { imageIds: pt.imageIds, kind: 'planar', initialImageIdIndex: 0 }
  );

  return { ct, pt, ctId, ptId };
}

/**
 * A view reference whose `dataId` names a display set that a planar viewport
 * shows as an overlay, as the PET of a fusion: the legacy volume viewport of
 * 5.18.3 moved its view to the plane and the point of such a reference (from
 * the PET viewport of OHIF's TMTV mode) and kept the CT as its source; its
 * references named no display set.
 */
describe('A view reference that names an overlay of a planar viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    utilities.genericViewportDisplaySetMetadataProvider.clear();
  });

  BACKENDS.forEach(({ name: backendName, options }) => {
    it(`moves a sagittal fusion in volume mode to the plane of a PET reference and keeps the CT as its source ${backendName}`, async function () {
      const { ct, pt, ctId, ptId } = await createFusionSeries(
        `overlayRefVolume${backendName}`,
        'volume'
      );
      const fusion = createNextViewport(renderingEngine, 'overlayRefFusion');
      const petViewport = createNextViewport(renderingEngine, 'overlayRefPet');
      const sagittal = { orientation: OrientationAxis.SAGITTAL, ...options };

      await fusion.setDisplaySets(
        { displaySetId: ctId, options: sagittal },
        { displaySetId: ptId, options: sagittal }
      );
      await settle(fusion);
      await petViewport.setDisplaySets({
        displaySetId: ptId,
        options: sagittal,
      });
      await settle(petViewport);
      petViewport.setViewState({
        slice: {
          kind: 'volumePoint',
          sliceWorldPoint: worldOfVoxel(pt, [5, 6, 2]),
        },
      });
      await settle(petViewport);

      const reference = petViewport.getViewReference();
      const layersBefore = layers(fusion);
      const actorsBefore = actorOrder(fusion);
      const slicesBefore = fusion.getNumberOfSlices();

      expect(reference.dataId).toBe(ptId);
      expect(
        fusion.isReferenceViewable(reference, { withNavigation: true })
      ).toBe(true);

      fusion.setViewReference(reference);
      await settle(fusion);

      const focalPoint = fusion.getResolvedView().toICamera().focalPoint;

      expect(fusion.getSourceDataId()).toBe(ctId);
      expect(layers(fusion)).toEqual(layersBefore);
      expect(actorOrder(fusion)).toEqual(actorsBefore);
      expect(actorsBefore).toEqual([ct.volumeId, pt.volumeId]);
      expect(fusion.getNumberOfSlices()).toBe(slicesBefore);
      expect(fusion.getNumberOfSlices()).toBe(ct.size.columns);
      expect(focalPoint[0]).toBeCloseTo(reference.cameraFocalPoint[0], 3);
      expect(fusion.isReferenceViewable(reference)).toBe(true);
    });

    it(`moves a fusion of two stacks to the CT image at the point of a PET reference and keeps the CT as its source ${backendName}`, async function () {
      const { ct, pt, ctId, ptId } = await createFusionSeries(
        `overlayRefStack${backendName}`,
        'stack'
      );
      const fusion = createNextViewport(renderingEngine, 'overlayRefFusion');
      const petViewport = createNextViewport(renderingEngine, 'overlayRefPet');
      const acquisition = {
        orientation: OrientationAxis.ACQUISITION,
        ...options,
      };

      await fusion.setDisplaySets(
        { displaySetId: ctId, options: acquisition },
        { displaySetId: ptId, options: acquisition }
      );
      await settle(fusion);
      await petViewport.setDisplaySets({
        displaySetId: ptId,
        options: acquisition,
      });
      await settle(petViewport);
      petViewport.setViewState({
        slice: { kind: 'stackIndex', imageIdIndex: 2 },
      });
      await waitFor(() => petViewport.getCurrentImageId() === pt.imageIds[2]);
      await settle(petViewport);

      const reference = petViewport.getViewReference();
      const layersBefore = layers(fusion);

      expect(reference.dataId).toBe(ptId);
      expect(reference.referencedImageId).toBe(pt.imageIds[2]);
      expect(
        fusion.isReferenceViewable(reference, { withNavigation: true })
      ).toBe(true);

      fusion.setViewReference(reference);
      await waitFor(() => fusion.getCurrentImageId() === ct.imageIds[4]);
      await settle(fusion);

      expect(fusion.getSourceDataId()).toBe(ctId);
      expect(layers(fusion)).toEqual(layersBefore);
      expect(fusion.getImageIds()).toEqual(ct.imageIds);
      expect(fusion.getCurrentImageId()).toBe(ct.imageIds[4]);
      expect(
        fusion.isReferenceViewable(reference, { withNavigation: true })
      ).toBe(true);
    });
  });
});
