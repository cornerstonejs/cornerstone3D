import RenderingEngine from './RenderingEngine.ts';
import renderingEngineCache from './renderingEngineCache.ts';
import renderingEventTarget, { EVENTS } from './renderingEventTarget.ts';

function getRenderingEngine(uid) {
  return renderingEngineCache.get(uid);
}

export { getRenderingEngine, renderingEventTarget, EVENTS, RenderingEngine };

export default RenderingEngine;
