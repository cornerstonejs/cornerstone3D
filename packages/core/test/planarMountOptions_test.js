import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  waitFor,
} from './utils/planarSeriesBothModes';

const { Enums, utilities, displaySetRegistry, setRenderBackend, eventTarget } =
  cornerstone3D;
const { OrientationAxis, Events } = Enums;

const renderingEngineId = utilities.uuidv4();

/** The two backends that draw a planar viewport. */
const BACKENDS = ['gpu', 'cpu'];

/** The window that a mount asks for in the tests of the appearance. */
const MOUNT_WINDOW = { lower: 40, upper: 160 };

/** Waits for a few animation frames. */
async function frames(count = 4) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/**
 * Counts the draws of a viewport and records the appearance events and the
 * render plan events of its element, from now on. `windowAtFirstDraw` is the
 * window that the source drew with at its first draw.
 */
function recordMount(viewport) {
  const record = {
    draws: 0,
    appearance: [],
    plans: [],
    pipelines: 0,
    windowAtFirstDraw: undefined,
  };
  const onPipeline = () => {
    record.pipelines += 1;
  };

  viewport.element.addEventListener(Events.IMAGE_RENDERED, () => {
    if (!record.draws) {
      record.windowAtFirstDraw =
        viewport.getEffectiveDisplaySetAppearance()?.voiRange;
    }

    record.draws += 1;
  });
  viewport.element.addEventListener(
    Events.DISPLAY_SET_APPEARANCE_CHANGED,
    (evt) => record.appearance.push(evt.detail)
  );
  viewport.element.addEventListener(Events.RENDER_PLAN_CHANGED, (evt) =>
    record.plans.push(evt.detail.current)
  );
  eventTarget.addEventListener(Events.RENDERING_PIPELINE_CHANGED, onPipeline);
  record.stop = () =>
    eventTarget.removeEventListener(
      Events.RENDERING_PIPELINE_CHANGED,
      onPipeline
    );

  return record;
}

/**
 * Registers a series as one display set with its image ids and its volume
 * id, and gives its id.
 */
function register(displaySetId, series) {
  displaySetRegistry.add(displaySetId, {
    imageIds: series.imageIds,
    volumeId: series.volumeId,
  });

  return displaySetId;
}

/** Mounts a display set, waits for its draws to end, and gives the record. */
async function mountAndRecord(viewport, displaySetId, options) {
  const record = recordMount(viewport);

  await viewport.setDisplaySets({ displaySetId, options });
  await frames();
  await renderAndWait(viewport);
  await frames();
  record.stop();

  return record;
}

describe('The mount options of a direct next planar viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
  });

  afterEach(function () {
    setRenderBackend('auto');
    displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  describe('initialImageIdIndex', () => {
    for (const backend of BACKENDS) {
      it(`opens a stack at the image of the mount option on the ${backend.toUpperCase()}`, async function () {
        const series = await createSeries({ id: `indexStack-${backend}` });
        const viewport = createNextViewport(renderingEngine, 'indexStack');
        const displaySetId = register(`indexStack:${backend}`, series);

        await viewport.setDisplaySets({
          displaySetId,
          options: { initialImageIdIndex: 3, renderBackend: backend },
        });
        await renderAndWait(viewport);

        expect(viewport.getCurrentMode()).toBe('stack');
        expect(viewport.getCurrentImageIdIndex()).toBe(3);
        expect(viewport.getCurrentImageId()).toBe(series.imageIds[3]);
      });

      it(`opens a volume in its acquisition plane at the slice of the image of the mount option on the ${backend.toUpperCase()}`, async function () {
        const series = await createSeries({ id: `indexVolume-${backend}` });
        const viewport = createNextViewport(renderingEngine, 'indexVolume');
        const displaySetId = register(`indexVolume:${backend}`, series);

        await viewport.setDisplaySets({
          displaySetId,
          options: {
            mode: 'volume',
            orientation: OrientationAxis.ACQUISITION,
            initialImageIdIndex: 5,
            renderBackend: backend,
          },
        });
        await renderAndWait(viewport);

        expect(viewport.getCurrentMode()).toBe('volume');
        expect(viewport.getCurrentImageId()).toBe(series.imageIds[5]);
      });
    }

    it('refuses a descriptor that carries initialImageIdIndex, with a message that names the mount option', async function () {
      const series = await createSeries({ id: 'indexRefused' });
      const viewport = createNextViewport(renderingEngine, 'indexRefused');

      displaySetRegistry.add('indexRefused', {
        imageIds: series.imageIds,
        initialImageIdIndex: 2,
      });

      await expectAsync(
        viewport.setDisplaySets({ displaySetId: 'indexRefused' })
      ).toBeRejectedWithError(
        '[PlanarViewport] The display set "indexRefused" is registered with initialImageIdIndex, which is a mount option: remove it from the descriptor and pass it on the mount, setDisplaySets({ displaySetId, options: { initialImageIdIndex } })'
      );
      expect(viewport.getCurrentMode()).toBe('empty');
    });
  });

  describe('appearance', () => {
    for (const backend of BACKENDS) {
      it(`draws a stack with the appearance of the mount as often as a stack without one, and fires DISPLAY_SET_APPEARANCE_CHANGED once with cause mount, on the ${backend.toUpperCase()}`, async function () {
        const series = await createSeries({ id: `appearance-${backend}` });
        const plain = createNextViewport(renderingEngine, 'appearancePlain');
        const viewport = createNextViewport(renderingEngine, 'appearanceMount');
        const plainId = register(`appearancePlain:${backend}`, series);
        const displaySetId = register(`appearanceMount:${backend}`, series);
        const plainRecord = await mountAndRecord(plain, plainId, {
          renderBackend: backend,
        });
        const record = await mountAndRecord(viewport, displaySetId, {
          renderBackend: backend,
          appearance: { voiRange: MOUNT_WINDOW, invert: true },
        });

        expect(record.draws).toBe(plainRecord.draws);
        expect(record.windowAtFirstDraw).toEqual(MOUNT_WINDOW);
        expect(record.appearance.map(({ cause }) => cause)).toEqual(['mount']);
        expect(record.appearance[0].overrides).toEqual({
          voiRange: MOUNT_WINDOW,
          invert: true,
        });
        expect(record.appearance[0].effective.voiRange).toEqual(MOUNT_WINDOW);
        expect(viewport.getDisplaySetAppearance(displaySetId)).toEqual({
          voiRange: MOUNT_WINDOW,
          invert: true,
        });
        expect(viewport.getDisplaySets()[0].options.appearance).toBeUndefined();
      });
    }

    it('merges the appearance of the mount over the overrides set before the mount', async function () {
      const series = await createSeries({ id: 'appearanceMerge' });
      const viewport = createNextViewport(renderingEngine, 'appearanceMerge');
      const displaySetId = register('appearanceMerge', series);

      viewport.setDisplaySetAppearance(displaySetId, {
        invert: true,
        voiRange: { lower: 0, upper: 10 },
      });

      const record = await mountAndRecord(viewport, displaySetId, {
        appearance: { voiRange: MOUNT_WINDOW },
      });

      expect(viewport.getDisplaySetAppearance(displaySetId)).toEqual({
        invert: true,
        voiRange: MOUNT_WINDOW,
      });
      expect(record.appearance.map(({ cause }) => cause)).toEqual(['mount']);
    });

    it('shows a display set as a volume, with no remount, when the mount asks for a slab and for no mode', async function () {
      const series = await createSeries({ id: 'appearanceSlab' });
      const viewport = createNextViewport(renderingEngine, 'appearanceSlab');
      const displaySetId = register('appearanceSlab', series);
      const record = await mountAndRecord(viewport, displaySetId, {
        appearance: { slabThickness: 6 },
      });
      const [layer] = viewport.getRenderPlan();

      expect(viewport.getCurrentMode()).toBe('volume');
      expect(layer.slice).toBe('gpuVolume');
      expect(layer.reason).toBe('slab');
      expect(record.plans.map(({ slice }) => slice)).toEqual(['gpuVolume']);
      expect(record.pipelines).toBe(0);
      expect(viewport.getDisplaySetAppearance(displaySetId)).toEqual({
        slabThickness: 6,
      });
      expect(viewport.getDisplaySets()[0].options.mode).toBe('volume');
    });

    it('takes the slab of the mount for the first render path of a volume with slice first on, with no remount', async function () {
      const series = await createSeries({ id: 'appearanceSlabSliceFirst' });
      const viewport = createNextViewport(
        renderingEngine,
        'appearanceSlabSliceFirst'
      );
      const plain = createNextViewport(renderingEngine, 'appearanceNoSlab');
      const displaySetId = register('appearanceSlabSliceFirst', series);
      const plainId = register('appearanceNoSlab', series);
      const plainRecord = await mountAndRecord(plain, plainId, {
        mode: 'volume',
        sliceFirst: true,
        renderBackend: 'gpu',
      });
      const record = await mountAndRecord(viewport, displaySetId, {
        mode: 'volume',
        sliceFirst: true,
        renderBackend: 'gpu',
        appearance: { slabThickness: 6 },
      });

      expect(plainRecord.plans.map(({ slice }) => slice)).toEqual(['cpu']);
      expect(record.plans.map(({ slice, reason }) => [slice, reason])).toEqual([
        ['gpuVolume', 'slab'],
      ]);
      expect(record.pipelines).toBe(0);
    });

    it('leaves a stack a stack when the mount gives no slab, and the slab set later does not change its mode', async function () {
      const series = await createSeries({ id: 'appearanceLaterSlab' });
      const viewport = createNextViewport(
        renderingEngine,
        'appearanceLaterSlab'
      );
      const displaySetId = register('appearanceLaterSlab', series);

      await mountAndRecord(viewport, displaySetId, {});
      viewport.setDisplaySetAppearance(displaySetId, { slabThickness: 6 });
      setRenderBackend('cpu');
      await frames(8);
      await renderAndWait(viewport);

      expect(viewport.getCurrentMode()).toBe('stack');
      expect(viewport.getRenderPlan()[0].draw).toBe('cpu');
    });
  });

  describe('the registration after the mount', () => {
    it('leaves a mounted viewport alone when the display set is registered again or removed, through a render backend switch and an orientation check, until it is mounted again', async function () {
      const series = await createSeries({ id: 'snapshotFirst' });
      const other = await createSeries({ id: 'snapshotOther' });
      const viewport = createNextViewport(renderingEngine, 'snapshot');
      const displaySetId = register('snapshot', series);

      await viewport.setDisplaySets({
        displaySetId,
        options: { initialImageIdIndex: 1 },
      });
      await renderAndWait(viewport);

      displaySetRegistry.add(displaySetId, {
        imageIds: other.imageIds.slice(0, 3),
        volumeId: other.volumeId,
      });

      expect(viewport.getImageIds()).toEqual(series.imageIds);
      expect(
        viewport.canRenderOrientation(OrientationAxis.ACQUISITION, displaySetId)
      ).toBe(true);
      expect(
        viewport.canRenderOrientation(OrientationAxis.SAGITTAL, displaySetId)
      ).toBe(false);

      setRenderBackend('cpu');
      await waitFor(() => viewport.getRenderPlan()[0]?.draw === 'cpu');
      await renderAndWait(viewport);

      expect(viewport.getCurrentMode()).toBe('stack');
      expect(viewport.getImageIds()).toEqual(series.imageIds);
      expect(viewport.getCurrentImageId()).toBe(series.imageIds[1]);

      displaySetRegistry.remove(displaySetId);
      setRenderBackend('gpu');
      await waitFor(() => viewport.getRenderPlan()[0]?.draw === 'gpu');
      await renderAndWait(viewport);

      expect(viewport.getImageIds()).toEqual(series.imageIds);
      expect(
        viewport.getDisplaySets().map((entry) => entry.displaySetId)
      ).toEqual([displaySetId]);

      displaySetRegistry.add(displaySetId, {
        imageIds: other.imageIds,
        volumeId: other.volumeId,
      });
      await viewport.setDisplaySets({ displaySetId });
      await renderAndWait(viewport);

      expect(viewport.getImageIds()).toEqual(other.imageIds);
    });
  });

  describe('the segmentation overlays of a setDisplaySets that replaces the source', () => {
    /**
     * Shows `sourceId` in `mode` with a labelmap overlay of a segmentation,
     * mounted out of band as the segmentation display tool mounts it.
     */
    async function showWithLabelmap(viewport, sourceId, mode, labelmap) {
      await viewport.setDisplaySets({
        displaySetId: sourceId,
        options: { mode },
      });
      displaySetRegistry.add('labelmapOverlay', {
        imageIds: labelmap.imageIds,
        volumeId: labelmap.volumeId,
        reference: {
          kind: 'segmentation',
          segmentationId: 'overlayRule',
          representationUID: 'labelmapOverlay',
          labelmapId: 'overlayRuleLabelmap',
        },
      });
      await viewport.addDisplaySet('labelmapOverlay', {
        mode,
        role: 'overlay',
      });
      await renderAndWait(viewport);
    }

    for (const [label, nextSource, nextMode, keeps] of [
      ['the same source in the same mode', 'ruleCT', 'volume', true],
      ['the same source in the other mode', 'ruleCT', 'stack', false],
      ['another source in the same mode', 'rulePT', 'volume', false],
      ['another source in the other mode', 'rulePT', 'stack', false],
    ]) {
      it(`${keeps ? 'keeps' : 'removes'} them for ${label}`, async function () {
        const ct = await createSeries({ id: 'ruleCT' });
        const pt = await createSeries({ id: 'rulePT' });
        const labelmap = await createSeries({ id: 'ruleLabelmap' });
        const viewport = createNextViewport(renderingEngine, 'overlayRule');

        register('ruleCT', ct);
        register('rulePT', pt);
        await showWithLabelmap(viewport, 'ruleCT', 'volume', labelmap);

        expect(
          viewport.getDisplaySets().map((entry) => entry.displaySetId)
        ).toEqual(['ruleCT', 'labelmapOverlay']);

        await viewport.setDisplaySets({
          displaySetId: nextSource,
          options: { mode: nextMode },
        });
        await renderAndWait(viewport);

        expect(viewport.getCurrentMode()).toBe(nextMode);
        expect(viewport.getSourceDisplaySetId()).toBe(nextSource);
        expect(
          viewport
            .getDisplaySets()
            .map(({ displaySetId, options }) => [displaySetId, options.role])
        ).toEqual(
          keeps
            ? [
                ['labelmapOverlay', 'overlay'],
                [nextSource, 'source'],
              ]
            : [[nextSource, 'source']]
        );
      });
    }
  });

  describe('an overlay listed before its source in one setDisplaySets call', () => {
    for (const backend of BACKENDS) {
      it(`shows the slice of the source on the overlay from the mount on, on the ${backend.toUpperCase()}`, async function () {
        const ct = await createSeries({ id: `overlayFirstCT-${backend}` });
        const pt = await createSeries({ id: `overlayFirstPT-${backend}` });
        const viewport = createNextViewport(renderingEngine, 'overlayFirst');

        displaySetRegistry.add('overlayFirst:ct', { imageIds: ct.imageIds });
        displaySetRegistry.add('overlayFirst:pt', { imageIds: pt.imageIds });
        await viewport.setDisplaySets(
          {
            displaySetId: 'overlayFirst:pt',
            options: {
              role: 'overlay',
              initialImageIdIndex: 3,
              renderBackend: backend,
            },
          },
          {
            displaySetId: 'overlayFirst:ct',
            options: {
              role: 'source',
              initialImageIdIndex: 3,
              renderBackend: backend,
            },
          }
        );
        await frames();
        await renderAndWait(viewport);

        const renderings = Object.fromEntries(
          viewport
            .getDebugBindings()
            .map(({ displaySetId, rendering }) => [
              displaySetId,
              rendering.currentImageIdIndex,
            ])
        );

        expect(viewport.getCurrentImageIdIndex()).toBe(3);
        expect(renderings).toEqual({
          'overlayFirst:pt': 3,
          'overlayFirst:ct': 3,
        });
        expect(viewport.getScalarRange('overlayFirst:pt')).toEqual(
          viewport.getScalarRange('overlayFirst:ct')
        );
      });
    }
  });

  describe('the messages of a mount that has no data', () => {
    it('names the registry for an id that nothing is registered under', async function () {
      const viewport = createNextViewport(renderingEngine, 'notRegistered');

      await expectAsync(
        viewport.setDisplaySets({ displaySetId: 'notRegistered' })
      ).toBeRejectedWithError(
        '[PlanarViewport] No display set is registered under "notRegistered": register it with displaySetRegistry.add(displaySetId, descriptor)'
      );
    });

    it('names the volume of a display set that names a volume only when the cache does not hold it', async function () {
      const viewport = createNextViewport(renderingEngine, 'volumeNotCached');

      displaySetRegistry.add('volumeNotCached', { volumeId: 'notCached' });

      await expectAsync(
        viewport.setDisplaySets({ displaySetId: 'volumeNotCached' })
      ).toBeRejectedWithError(
        '[PlanarViewport] The display set "volumeNotCached" names the volume "notCached" and no imageIds, and the cache does not hold that volume: create the volume before the mount, or register the imageIds'
      );
    });
  });
});
