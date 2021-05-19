import RenderingEngine from './RenderingEngine';
/**
 * Method to retrieve a RenderingEngine by its unique identifier.
 *
 * @example
 * How to get a RenderingEngine that was created earlier:
 * ```
 * import { RenderingEngine, getRenderingEngine } from 'vtkjs-viewport';
 *
 * const renderingEngine = new RenderingEngine('my-engine');
 *
 * // getting reference to rendering engine later...
 * const renderingEngine = getRenderingEngine('my-engine');
 * ```
 *
 * @param uid The unique identifer that was used to create the RenderingEngine
 * @returns the matching RenderingEngine, or `undefined` if there is no match
 * @public
 */
export declare function getRenderingEngine(uid: string): RenderingEngine | undefined;
export declare function getRenderingEngines(): RenderingEngine[] | undefined;
export default getRenderingEngine;
