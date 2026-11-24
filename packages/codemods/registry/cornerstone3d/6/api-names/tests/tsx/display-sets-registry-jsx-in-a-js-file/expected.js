import React, { useEffect } from 'react';
import { getRenderingEngine, displaySetRegistry } from '@cornerstonejs/core';

export function VideoPane({ videoImageId, onPlan }) {
  useEffect(() => {
    const viewport = getRenderingEngine('engine').getViewport('video');

    displaySetRegistry.add('video', {
      imageId: videoImageId,
    });
    viewport.setDisplaySets({ displaySetId: 'video' }).then(() => {
      onPlan(viewport.getViewReference().displaySetId);
    });

    return () => viewport.removeDisplaySet('video');
  }, [videoImageId]);

  return <div className="video-pane" data-id="video" />;
}
