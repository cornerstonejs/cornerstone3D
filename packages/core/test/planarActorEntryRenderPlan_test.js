import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
} from './utils/planarSeriesBothModes';

const { Enums, utilities, displaySetRegistry } = cornerstone3D;
const { OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();
const viewportId = 'actorEntryRenderPlan';

/**
 * The two contents of a planar viewport, and the descriptor of a series in
 * each: a stack by its image ids, a volume with its volume id.
 */
const MODES = [
  ['stack', (series) => ({ imageIds: series.imageIds })],
  [
    'volume',
    (series) => ({ imageIds: series.imageIds, volumeId: series.volumeId }),
  ],
];

/** The backends that draw a planar viewport. */
const BACKENDS = ['gpu', 'cpu'];

describe('The display set id of an actor entry of a direct planar viewport -- ', () => {
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
  });

  for (const [mode, descriptorOf] of MODES) {
    for (const backend of BACKENDS) {
      it(`names the layer of the render plan of a source and an overlay in ${mode} mode on the ${backend.toUpperCase()}`, async function () {
        const source = await createSeries({ id: `entry-${mode}-source` });
        const overlay = await createSeries({ id: `entry-${mode}-overlay` });
        const sourceId = `entry:${mode}:${backend}:source`;
        const overlayId = `entry:${mode}:${backend}:overlay`;
        const viewport = createNextViewport(renderingEngine, viewportId);
        const options = {
          mode,
          orientation: OrientationAxis.ACQUISITION,
          renderBackend: backend,
        };

        displaySetRegistry.add(sourceId, descriptorOf(source));
        displaySetRegistry.add(overlayId, descriptorOf(overlay));
        await viewport.setDisplaySets(
          { displaySetId: sourceId, options },
          { displaySetId: overlayId, options: { ...options, role: 'overlay' } }
        );
        await renderAndWait(viewport);

        const plan = viewport.getRenderPlan();
        const layerOf = (entry) =>
          plan.find((layer) => layer.displaySetId === entry.displaySetId);
        const entries = viewport.getActors();

        expect(viewport.getCurrentMode()).toBe(mode);
        expect(plan.map((layer) => [layer.displaySetId, layer.role])).toEqual([
          [sourceId, 'source'],
          [overlayId, 'overlay'],
        ]);
        expect(plan.every((layer) => layer.backend === backend)).toBe(true);
        expect(entries.map((entry) => entry.displaySetId)).toEqual([
          sourceId,
          overlayId,
        ]);
        expect(entries.map((entry) => layerOf(entry)?.role)).toEqual([
          'source',
          'overlay',
        ]);
        expect(viewport.getDefaultActor().displaySetId).toBe(
          viewport.getSourceDisplaySetId()
        );
        expect(
          entries.every(
            (entry) =>
              entry.actor.isA('vtkImageSlice') ===
              (layerOf(entry).draw === 'gpu')
          )
        ).toBe(true);
      });
    }
  }
});
