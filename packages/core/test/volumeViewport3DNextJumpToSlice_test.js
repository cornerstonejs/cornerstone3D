import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader, utilities, cache } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * Makes and caches a volume of the fake volume loader: 40 columns, 30 rows
 * and 12 slices 2 mm apart.
 */
async function createVolume(name) {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name,
    id: name,
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

/**
 * The 5.x 3D viewport had one slice and gave null as its slice index, so
 * `utilities.jumpToSlice` scrolled by nothing on it, as `utilities.scroll`
 * does on a direct next 3D viewport.
 */
describe('utilities.jumpToSlice on a direct next 3D viewport -- ', () => {
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

  it('does not throw and leaves the view as it is, as on the 5.x 3D viewport', async function () {
    testUtils.createViewports(renderingEngine, {
      viewportId: 'jump3D',
      viewportType: ViewportType.VOLUME_3D,
      orientation: OrientationAxis.SAGITTAL,
      width: 400,
      height: 300,
      useEnableElement: true,
    });

    const viewport = renderingEngine.getViewport('jump3D');
    const volumeId = await createVolume('jump3DVolume');

    cornerstone3D.displaySetRegistry.add('jump3D:volume', {
      imageIds: cache.getVolume(volumeId).imageIds,
      volumeId,
    });
    await viewport.setDisplaySets({
      displaySetId: 'jump3D:volume',
      options: { renderMode: 'vtkVolume3d' },
    });

    const viewState = JSON.stringify(viewport.getViewState());
    let error;

    try {
      await utilities.jumpToSlice(viewport.element, { imageIndex: 3 });
    } catch (thrown) {
      error = thrown;
    }

    expect(error).toBeUndefined();
    expect(JSON.stringify(viewport.getViewState())).toBe(viewState);
  });
});
