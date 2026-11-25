import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
} from './utils/planarSeriesBothModes';

const { Enums, utilities, cache, displaySetRegistry } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/** Makes a direct 3D viewport of 300 by 300 pixels, coronal. */
function create3DViewport(renderingEngine, viewportId) {
  testUtils.createViewports(renderingEngine, {
    viewportId,
    viewportType: ViewportType.VOLUME_3D,
    orientation: OrientationAxis.CORONAL,
    width: 300,
    height: 300,
    useEnableElement: true,
  });

  return renderingEngine.getViewport(viewportId);
}

/** Registers the images of a series, without a volume id, under an id. */
function registerImages(displaySetId, series) {
  displaySetRegistry.add(displaySetId, { imageIds: series.imageIds });

  return displaySetId;
}

/**
 * The display sets of `viewport` with the options of their mounts and the
 * appearance of each, as an application copies the layers of a viewport.
 */
function displaySetsWithAppearance(viewport) {
  return viewport.getDisplaySets().map(({ displaySetId, options }) => ({
    displaySetId,
    options: {
      ...options,
      appearance: viewport.getDisplaySetAppearance(displaySetId),
    },
  }));
}

/** The effective appearance of each display set of a viewport. */
function effectiveAppearances(viewport) {
  return viewport
    .getDisplaySets()
    .map(({ displaySetId }) =>
      viewport.getEffectiveDisplaySetAppearance(displaySetId)
    );
}

/** The volumes of the cache, by id. */
function cachedVolumeIds() {
  return Array.from(cache._volumeCache.keys()).sort();
}

describe('getDisplaySets gives what other.setDisplaySets(...viewport.getDisplaySets()) needs to show the same layers of the same data -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({ renderingEngineId });
  });

  it('on a planar viewport: two volumes of the mount options, in volume mode, with no other volume loaded', async function () {
    const ct = await createSeries({ id: 'roundTripPlanarCT' });
    const pt = await createSeries({ id: 'roundTripPlanarPT' });
    const source = createNextViewport(renderingEngine, 'roundTripPlanarA');
    const target = createNextViewport(renderingEngine, 'roundTripPlanarB');
    const ctId = registerImages('roundTripPlanarCT', ct);
    const ptId = registerImages('roundTripPlanarPT', pt);

    await source.setDisplaySets(
      {
        displaySetId: ctId,
        options: {
          mode: 'volume',
          volumeId: ct.volumeId,
          orientation: OrientationAxis.AXIAL,
          appearance: { voiRange: { lower: 20, upper: 180 } },
        },
      },
      {
        displaySetId: ptId,
        options: {
          mode: 'volume',
          volumeId: pt.volumeId,
          appearance: { opacity: 0.4 },
        },
      }
    );
    await renderAndWait(source);

    const volumesBefore = cachedVolumeIds();

    expect(source.getDisplaySets()).toEqual([
      {
        displaySetId: ctId,
        options: {
          mode: 'volume',
          volumeId: ct.volumeId,
          orientation: OrientationAxis.AXIAL,
          role: 'source',
        },
      },
      {
        displaySetId: ptId,
        options: { mode: 'volume', volumeId: pt.volumeId, role: 'overlay' },
      },
    ]);

    await target.setDisplaySets(...source.getDisplaySets());
    await renderAndWait(target);

    expect(target.getDisplaySets()).toEqual(source.getDisplaySets());
    expect(target.getCurrentMode()).toBe('volume');
    expect(target.getVolumeIds()).toEqual([ct.volumeId, pt.volumeId]);
    expect(cachedVolumeIds()).toEqual(volumesBefore);
    expect(
      cache.getVolume(utilities.getDefaultVolumeId(ct.imageIds))
    ).toBeUndefined();

    await target.setDisplaySets(...displaySetsWithAppearance(source));
    await renderAndWait(target);

    expect(target.getDisplaySets()).toEqual(source.getDisplaySets());
    expect(effectiveAppearances(target)).toEqual(effectiveAppearances(source));
  });

  it('on a planar viewport: a stack keeps its mode and the image of its mount', async function () {
    const series = await createSeries({ id: 'roundTripPlanarStack' });
    const source = createNextViewport(renderingEngine, 'roundTripStackA');
    const target = createNextViewport(renderingEngine, 'roundTripStackB');
    const displaySetId = registerImages('roundTripPlanarStack', series);

    await source.setDisplaySets({
      displaySetId,
      options: { initialImageIdIndex: 3 },
    });
    await renderAndWait(source);
    await target.setDisplaySets(...source.getDisplaySets());
    await renderAndWait(target);

    expect(source.getDisplaySets()).toEqual([
      {
        displaySetId,
        options: { initialImageIdIndex: 3, mode: 'stack', role: 'source' },
      },
    ]);
    expect(target.getDisplaySets()).toEqual(source.getDisplaySets());
    expect(target.getCurrentMode()).toBe('stack');
    expect(target.getCurrentImageId()).toBe(series.imageIds[3]);
  });

  it('on a 3D viewport: the volume of the mount option and the volume of the registration, with no other volume loaded', async function () {
    const ct = await createSeries({ id: 'roundTrip3DCT' });
    const pt = await createSeries({ id: 'roundTrip3DPT' });
    const source = create3DViewport(renderingEngine, 'roundTrip3DA');
    const target = create3DViewport(renderingEngine, 'roundTrip3DB');
    const ctId = registerImages('roundTrip3DCT', ct);

    displaySetRegistry.add('roundTrip3DPT', {
      imageIds: pt.imageIds,
      volumeId: pt.volumeId,
    });
    await source.setDisplaySets(
      {
        displaySetId: ctId,
        options: { volumeId: ct.volumeId, appearance: { opacity: 0.8 } },
      },
      { displaySetId: 'roundTrip3DPT' }
    );
    await renderAndWait(source);

    const volumesBefore = cachedVolumeIds();

    expect(source.getDisplaySets()).toEqual([
      {
        displaySetId: ctId,
        options: { role: 'source', volumeId: ct.volumeId },
      },
      {
        displaySetId: 'roundTrip3DPT',
        options: { role: 'overlay', volumeId: pt.volumeId },
      },
    ]);

    await target.setDisplaySets(...source.getDisplaySets());
    await renderAndWait(target);

    expect(target.getDisplaySets()).toEqual(source.getDisplaySets());
    expect(target.getVolumeIds()).toEqual([ct.volumeId, pt.volumeId]);
    expect(cachedVolumeIds()).toEqual(volumesBefore);
    expect(
      cache.getVolume(utilities.getDefaultVolumeId(ct.imageIds))
    ).toBeUndefined();

    await target.setDisplaySets(...displaySetsWithAppearance(source));
    await renderAndWait(target);

    expect(target.getDisplaySetAppearance(ctId)).toEqual({ opacity: 0.8 });
    expect(effectiveAppearances(target)).toEqual(effectiveAppearances(source));
  });
});
