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

  utilities.genericViewportDisplaySetMetadataProvider.add(volumeId, {
    kind: 'planar',
    imageIds,
    volumeId,
  });

  await Promise.all(
    viewportIds.map((viewportId) =>
      renderingEngine.getViewport(viewportId).setDisplaySets({ displaySetId: volumeId })
    )
  );

  renderingEngine.renderViewports(viewportIds);
}

run();
