import type { IRenderingEngine } from '../types';

const cache = {};

const renderingEngineCache = {
  /**
   * Returns the `RenderingEngine` instance with the given `id`.
   *
   * @param id - The `id` of the `RenderingEngine` instance to fetch.
   * @returns The `RenderingEngine` instance.
   */
  get: (id: string): IRenderingEngine => {
    return cache[id];
  },
  /**
   * Adds the `RenderingEngine` instance to the cache.
   *
   * @param re - The `RenderingEngine` to add.
   */
  set: (re: IRenderingEngine): void => {
    const renderingEngineId = re.id;

    cache[renderingEngineId] = re;
  },
  /**
   * Deletes the `RenderingEngine` instance from the cache.
   *
   * @param id - The `id` of the `RenderingEngine` instance to delete.
   * @returns True if the delete was successful.
   */
  delete: (id: string) => {
    return delete cache[id];
  },

  getAll: (): Array<IRenderingEngine> => {
    const renderingEngineIds = Object.keys(cache);
    const renderingEngines = renderingEngineIds.map((id) => cache[id]);

    return renderingEngines;
  },
};

export default renderingEngineCache;
