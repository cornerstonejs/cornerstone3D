import * as cornerstone3D from '../src'

// import { User } from ... doesn't work right now since we don't have named exports set up
const { cache, Utilities } = cornerstone3D

describe('cache', () => {
  beforeEach(() => {
    cache.purgeCache()
  })

  it('purged cache to have size zero', () => {
    const cacheSize = cache.getCacheSize()

    expect(cacheSize).toEqual(0)
  })
})
