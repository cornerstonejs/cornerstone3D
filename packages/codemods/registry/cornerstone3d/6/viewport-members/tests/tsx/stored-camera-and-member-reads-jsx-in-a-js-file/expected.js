import { getRenderingEngine } from '@cornerstonejs/core';

export function ZoomButton({ engineId }) {
  const viewport = getRenderingEngine(engineId).getViewport('ct');
  const onClick = () => {
    viewport.setZoom(viewport.getZoom() * 2, true);
    viewport.setPan([0, 0]);
  };

  return <button disabled={!viewport.getAllVolumeIds} onClick={onClick} />;
}
