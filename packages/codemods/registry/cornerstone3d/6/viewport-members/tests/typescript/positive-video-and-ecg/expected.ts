import type { ECGViewport, VideoViewport } from '@cornerstonejs/core';

function update(videoViewport: VideoViewport, ecgViewport: ECGViewport) {
  videoViewport.setViewState({ frameRange: [5, 10] });
  videoViewport.setDisplaySetPresentation({ averageWhite: [255, 255, 255] });
  videoViewport.setDisplaySetPresentation({ loop: true, muted: true });

  ecgViewport.setViewState({ visibleChannels: [0, 1], traceLayout: 'grid' });
  ecgViewport.setDisplaySetPresentation({ showAmplitudeLabels: true });
  ecgViewport.resetViewState();

  return [videoViewport.getFrameRate(), videoViewport.getNumberOfFrames(), videoViewport.id];
}

console.log(update);
