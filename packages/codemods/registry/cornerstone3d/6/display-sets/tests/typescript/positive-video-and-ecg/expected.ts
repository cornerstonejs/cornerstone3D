import type { ECGViewport, VideoViewport } from '@cornerstonejs/core';
import { getRenderingEngine } from '@cornerstonejs/core';

async function show(videoImageId: string, ecgImageId: string) {
  const engine = getRenderingEngine('engine');
  const videoViewport = engine.getViewport<VideoViewport>('video');
  const ecgViewport = engine.getViewport<ECGViewport>('ecg');

  await videoViewport.setDisplaySets({ displaySetId: videoImageId, options: { frameNumber: 1 } });
  await ecgViewport.setDisplaySets({ displaySetId: ecgImageId });

  return videoViewport.setDisplaySets({ displaySetId: videoImageId });
}

show('video', 'ecg');
