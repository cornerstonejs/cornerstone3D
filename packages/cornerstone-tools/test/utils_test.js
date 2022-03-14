import math from '../src/util/math'

describe('Cornerstone-tools Utilities:', function () {
  it('Should successfully find the closest point to the target point', () => {
    const points = [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ]
    const target = [5, 5]

    const point = math.vec2.findClosestPoint(points, target)
    expect(point).toBeDefined()
    expect(point[0]).toBe(4)
    expect(point[1]).toBe(4)
  })
})
