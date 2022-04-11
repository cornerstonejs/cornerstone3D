import renderingEngineCache from './renderingEngineCache';
import type { IRenderingEngine } from '../types';

/**
 * Method to retrieve a RenderingEngine by its unique identifier.
 *
 * @example
 * How to get a RenderingEngine that was created earlier:
 * ```javascript
 * import { RenderingEngine, getRenderingEngine } from 'vtkjs-viewport';
 *
 * const renderingEngine = new RenderingEngine('my-engine');
 *
 * // getting reference to rendering engine later...
 * const renderingEngine = getRenderingEngine('my-engine');
 * ```
 *
 * @param id - The identifier that was used to create the RenderingEngine
 * @returns the matching RenderingEngine, or `undefined` if there is no match
 * @public
 */
export function getRenderingEngine(id: string): IRenderingEngine | undefined {
  return renderingEngineCache.get(id);
}

/**
 * Get all the rendering engines that are currently registered
 * @returns An array of rendering engines.
 */
export function getRenderingEngines(): IRenderingEngine[] | undefined {
  return renderingEngineCache.getAll();
}

export default getRenderingEngine;
