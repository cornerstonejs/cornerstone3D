import {
  Enums,
  RenderingEngine,
  utilities,
  volumeLoader,
} from '@cornerstonejs/core';
import type { PlanarViewport } from '@cornerstonejs/core';

const displaySetId = 'ct';
const ptDisplaySetId = 'pt';

async function run(imageIds: string[], ptImageIds: string[]) {
  const renderingEngine = new RenderingEngine('engine');
  const volumeId = 'cornerstoneStreamingImageVolume:CT';
  const ptVolumeId = 'cornerstoneStreamingImageVolume:PT';

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds });

  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, { imageIds, volumeId });
  utilities.genericViewportDisplaySetMetadataProvider.add(ptDisplaySetId, {
    imageIds: ptImageIds,
    volumeId: ptVolumeId,
  });

  const axial = renderingEngine.getViewport<PlanarViewport>('CT_AXIAL');

  await axial.setDisplaySets({ displaySetId });

  const sagittal = renderingEngine.getViewport('CT_SAGITTAL') as PlanarViewport;

  await sagittal.setDisplaySets(
    {
      displaySetId,
      options: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
    { displaySetId: ptDisplaySetId, options: { role: 'overlay' } }
  );

  const coronal = renderingEngine.getViewport('CT_CORONAL');

  await coronal.setDisplaySets({ displaySetId, options: {} });
  await coronal.addDisplaySet(ptDisplaySetId);

  let mpr = renderingEngine.getViewport<PlanarViewport>('MPR_1');
  mpr = renderingEngine.getViewport<PlanarViewport>('MPR_2');

  const entries = [{ displaySetId }];

  entries.push({ displaySetId: ptDisplaySetId });
  await mpr.setDisplaySets(...entries);

  await renderingEngine
    .getViewport<PlanarViewport>('CHAINED')
    .setDisplaySets({ displaySetId });

  let typed: PlanarViewport;
  typed = renderingEngine.getViewport('TYPED');
  await typed.setDisplaySets({ displaySetId });
}

run(['a', 'b'], ['c', 'd']);
