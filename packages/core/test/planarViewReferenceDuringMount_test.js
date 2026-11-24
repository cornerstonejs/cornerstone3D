import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  STRAIGHT_PLANE,
} from './utils/planarSeriesBothModes';

const { Enums, utilities } = cornerstone3D;
const { OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/** A PET of half the CT grid in each axis over the same extent. */
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

/** The display set and the role of each layer of the render plan, source first. */
function rolesOf(viewport) {
  return viewport
    .getRenderPlan()
    .map(({ displaySetId, role }) => `${role}:${displaySetId}`);
}

/**
 * `addDisplaySet(id, { role: 'source' })` makes the new display set the
 * source before its render path is mounted, and a view reference can come
 * while the mount waits, as from a synchronizer. The old source is still the
 * first binding then. A reference of it made that binding the source again,
 * so after the mount the viewport named the old display set as its source,
 * drew it first in its render plan, and held the new one as source in the
 * roles of its layers.
 */
describe('A view reference that comes while a new source mounts on a direct next planar viewport -- ', () => {
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
    cornerstone3D.displaySetRegistry.clear();
  });

  BACKENDS.forEach(({ name, options }) => {
    it(`keeps the new source for a reference of the old source ${name}`, async function () {
      const ct = await createSeries({
        id: `duringMountCt${name}`,
        plane: STRAIGHT_PLANE,
      });
      const pt = await createSeries({
        id: `duringMountPt${name}`,
        plane: STRAIGHT_PLANE,
        size: PET_SIZE,
        info: { PT: true },
      });
      const ctId = `duringMount-ct-${name}`;
      const ptId = `duringMount-pt-${name}`;
      const viewport = createNextViewport(renderingEngine, 'duringMount');
      const axial = { orientation: OrientationAxis.AXIAL, ...options };

      cornerstone3D.displaySetRegistry.add(ctId, {
        imageIds: ct.imageIds,
        volumeId: ct.volumeId,
      });
      cornerstone3D.displaySetRegistry.add(ptId, {
        imageIds: pt.imageIds,
        volumeId: pt.volumeId,
      });
      await viewport.setDisplaySets({ displaySetId: ctId, options: axial });
      await settle(viewport);

      const ctReference = viewport.getViewReference();
      const addLoadedData = viewport.addLoadedData;
      const referencesSent = [];

      viewport.addLoadedData = function (displaySetId, ...rest) {
        if (displaySetId === ptId) {
          referencesSent.push(this.getSourceDisplaySetId());
          this.setViewReference(ctReference);
        }

        return addLoadedData.call(this, displaySetId, ...rest);
      };

      try {
        await viewport.addDisplaySet(ptId, { role: 'source', ...axial });
      } finally {
        delete viewport.addLoadedData;
      }
      await settle(viewport);

      expect(ctReference.displaySetId).toBe(ctId);
      expect(referencesSent).toEqual([ptId]);
      expect(viewport.getSourceDisplaySetId()).toBe(ptId);
      expect(rolesOf(viewport)).toEqual([`source:${ptId}`, `overlay:${ctId}`]);
      expect(
        viewport.getActors().map(({ referencedId }) => referencedId)
      ).toEqual([pt.volumeId, ct.volumeId]);
    });
  });
});
