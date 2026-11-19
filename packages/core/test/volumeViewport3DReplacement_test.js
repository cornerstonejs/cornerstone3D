import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader, utilities, cache } = cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;

const renderingEngineId = utilities.uuidv4();

/** Makes a direct 3D viewport of 300 by 300 pixels, coronal. */
function createViewport(renderingEngine) {
  testUtils.createViewports(renderingEngine, {
    viewportId: 'replacement3D',
    viewportType: ViewportType.VOLUME_3D,
    orientation: OrientationAxis.CORONAL,
    width: 300,
    height: 300,
    useEnableElement: true,
  });

  return renderingEngine.getViewport('replacement3D');
}

/** Renders the viewport and resolves at its next IMAGE_RENDERED event. */
function renderAndWait(viewport) {
  return new Promise((resolve) => {
    viewport.element.addEventListener(Events.IMAGE_RENDERED, resolve, {
      once: true,
    });
    viewport.render();
  });
}

/** Registers a display set of a fake volume of the given size. */
async function registerVolume(displaySetId, { rows, columns, slices }) {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: displaySetId,
    id: displaySetId,
    rows,
    columns,
    slices,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });

  return volumeId;
}

/** The picture on the canvas of the viewport. */
function pictureOf(viewport) {
  return viewport.canvas.toDataURL();
}

describe('A failed replacement of the display sets of a 3D viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();
  });

  it('rejects and keeps the scene that was shown, as the legacy setVolumes did when a volume was missing', async function () {
    const viewport = createViewport(renderingEngine);
    const shownVolumeId = await registerVolume('replacement3D:shown', {
      rows: 30,
      columns: 40,
      slices: 12,
    });

    await registerVolume('replacement3D:first', {
      rows: 10,
      columns: 10,
      slices: 4,
    });
    await viewport.setDisplaySets({
      displaySetId: 'replacement3D:shown',
      options: { renderMode: 'vtkVolume3d' },
    });
    await renderAndWait(viewport);

    const shownPicture = pictureOf(viewport);
    const newVolumeEvents = [];

    viewport.element.addEventListener(Events.VOLUME_VIEWPORT_NEW_VOLUME, () =>
      newVolumeEvents.push(true)
    );

    let error;

    try {
      await viewport.setDisplaySets(
        {
          displaySetId: 'replacement3D:first',
          options: { renderMode: 'vtkVolume3d' },
        },
        {
          displaySetId: 'replacement3D:missing',
          options: { renderMode: 'vtkVolume3d' },
        }
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeDefined();
    expect(viewport.getDisplaySets()).toEqual([
      { displaySetId: 'replacement3D:shown', options: { role: 'source' } },
    ]);
    expect(
      viewport.getActors().map(({ referencedId }) => referencedId)
    ).toEqual([shownVolumeId]);
    expect(newVolumeEvents.length).toBe(0);

    await renderAndWait(viewport);

    expect(pictureOf(viewport)).toBe(shownPicture);
  });
});
