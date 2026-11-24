import React, { useEffect } from 'react';
import { getRenderingEngine, utilities } from '@cornerstonejs/core';

export function VideoPane({ videoImageId, onPlan }) {
  useEffect(() => {
    const viewport = getRenderingEngine('engine').getViewport('video');

    utilities.genericViewportDisplaySetMetadataProvider.add('video', {
      kind: 'video',
      sourceDataId: videoImageId,
    });
    viewport.setDisplaySets({ displaySetId: 'video' }).then(() => {
      onPlan(viewport.getViewReference().dataId);
    });

    return () => viewport.removeData('video');
  }, [videoImageId]);

  return <div className="video-pane" data-id="video" />;
}
