import RenderingEngine from './RenderingEngine';
import renderingEngineCache from './renderingEngineCache';
import renderingEventTarget from './renderingEventTarget';

function getRenderingEngine(uid) {
  return renderingEngineCache.get(uid);
}

export { getRenderingEngine, renderingEventTarget, RenderingEngine };

export default RenderingEngine;
