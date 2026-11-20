import {
  RenderingEngine,
  volumeLoader,
  utilities,
} from '@cornerstonejs/core';

const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const volumeId = `${volumeLoaderScheme}:CT_VOLUME_ID`;
const viewportIds = ['CT_AXIAL', 'CT_SAGITTAL', 'CT_CORONAL'];

async function run() {
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: 'x',
  });
  const renderingEngine = new RenderingEngine('engine');
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  volume.load();

  const viewports = viewportIds.map((viewportId) => {
    const viewport = renderingEngine.getViewport(viewportId);

    if (!viewport) {
      throw new Error(`Viewport with Id ${viewportId} does not exist`);
    }

    return viewport;
  });

  utilities.genericViewportDisplaySetMetadataProvider.add(volumeId, {
    kind: 'planar',
    imageIds,
    volumeId,
  });

  await Promise.all(
    viewports.map((viewport) => viewport.setDisplaySets({ displaySetId: volumeId }))
  );

  renderingEngine.renderViewports(viewportIds);
}

run();
