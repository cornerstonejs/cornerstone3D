import {
  Enums,
  RenderingEngine,
  volumeLoader,
  displaySetRegistry,
} from '@cornerstonejs/core';
import type { PlanarViewport } from '@cornerstonejs/core';

const displaySetId = 'ct';
const ptDisplaySetId = 'pt';

async function run(imageIds: string[], ptImageIds: string[]) {
  const renderingEngine = new RenderingEngine('engine');
  const volumeId = 'cornerstoneStreamingImageVolume:CT';
  const ptVolumeId = 'cornerstoneStreamingImageVolume:PT';

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds });

  displaySetRegistry.add(displaySetId, { imageIds, volumeId });
  displaySetRegistry.add(ptDisplaySetId, {
    imageIds: ptImageIds,
    volumeId: ptVolumeId,
  });

  const axial = renderingEngine.getViewport<PlanarViewport>('CT_AXIAL');

  await axial.setDisplaySets({ displaySetId, options: { mode: 'volume' } });

  const sagittal = renderingEngine.getViewport('CT_SAGITTAL') as PlanarViewport;

  await sagittal.setDisplaySets(
    {
      displaySetId,
      options: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        mode: 'volume',
      },
    },
    { displaySetId: ptDisplaySetId, options: { role: 'overlay', mode: 'volume' } }
  );

  const coronal = renderingEngine.getViewport('CT_CORONAL');

  await coronal.setDisplaySets({ displaySetId, options: { mode: 'volume' } });
  await coronal.addDisplaySet(ptDisplaySetId, { mode: 'volume' });

  let mpr = renderingEngine.getViewport<PlanarViewport>('MPR_1');
  mpr = renderingEngine.getViewport<PlanarViewport>('MPR_2');

  const entries = [{ displaySetId, options: { mode: 'volume' } }];

  entries.push({ displaySetId: ptDisplaySetId, options: { mode: 'volume' } });
  await mpr.setDisplaySets(...entries);

  await renderingEngine
    .getViewport<PlanarViewport>('CHAINED')
    .setDisplaySets({ displaySetId, options: { mode: 'volume' } });

  let typed: PlanarViewport;
  typed = renderingEngine.getViewport('TYPED');
  await typed.setDisplaySets({ displaySetId, options: { mode: 'volume' } });
}

run(['a', 'b'], ['c', 'd']);
