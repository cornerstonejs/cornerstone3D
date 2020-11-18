import RenderingEngine from './RenderingEngine.ts';
import renderingEngineCache from './renderingEngineCache.ts';

function getRenderingEngine(uid) {
  return renderingEngineCache.get(uid);
}

export { getRenderingEngine };

export default RenderingEngine;
