import type { ECGViewport, VideoViewport } from '@cornerstonejs/core';

function update(videoViewport: VideoViewport, ecgViewport: ECGViewport) {
  videoViewport.setViewState({ frameRange: [5, 10] });
  videoViewport.setAverageWhite([255, 255, 255]);
  videoViewport.setProperties({ loop: true, muted: true });

  ecgViewport.setViewState({ visibleChannels: [0, 1], traceLayout: 'grid' });
  ecgViewport.setProperties({ showAmplitudeLabels: true });
  ecgViewport.resetViewState();

  return [videoViewport.getFrameRate(), videoViewport.getNumberOfFrames(), videoViewport.id];
}

console.log(update);
