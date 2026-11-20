import {
  RenderingEngine,
  setVolumesForViewports,
  volumeLoader,
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

  setVolumesForViewports(renderingEngine, [{ volumeId }], viewportIds);

  renderingEngine.renderViewports(viewportIds);
}

run();
