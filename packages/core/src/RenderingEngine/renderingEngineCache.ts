import RenderingEngine from './RenderingEngine'

const cache = {}

const renderingEngineCache = {
  /**
   * Returns the `RenderingEngine` instance with the given `uid`.
   *
   * @param uid - The `uid` of the `RenderingEngine` instance to fetch.
   * @returns The `RenderingEngine` instance.
   */
  get: (uid: string): RenderingEngine => {
    return cache[uid]
  },
  /**
   * Adds the `RenderingEngine` instance to the cache.
   *
   * @param re - The `RenderingEngine` to add.
   */
  set: (re: RenderingEngine): void => {
    const uid = re.uid

    cache[uid] = re
  },
  /**
   * Deletes the `RenderingEngine` instance from the cache.
   *
   * @param uid - The `uid` of the `RenderingEngine` instance to delete.
   * @returns True if the delete was successful.
   */
  delete: (uid: string) => {
    return delete cache[uid]
  },

  getAll: (): Array<RenderingEngine> => {
    const uids = Object.keys(cache)
    const renderingEngines = uids.map((uid) => cache[uid])

    return renderingEngines
  },
}

export default renderingEngineCache
