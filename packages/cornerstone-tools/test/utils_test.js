import math from '../src/util/math'

// Todo: replace isEqual with vec3.equals
describe('Cornerstone-tools Utilities:', function () {
  it('Should correctly determines equality between values of two arrays', () => {
    expect(math.vec3.isEqual([0, 0, 0], [1, 1, 1])).toBe(false)
    expect(math.vec3.isEqual([0, 0, 0], [0, 0, 0])).toBe(true)
    expect(math.vec3.isEqual([0, 0, 0], [0.0000000001, 0, 0])).toBe(true)

    expect(math.vec2.isEqual([0, 0], [1, 1])).toBe(false)
    expect(math.vec2.isEqual([0, 0], [0, 0])).toBe(true)
    expect(math.vec2.isEqual([0, 0], [0.000000001, 0])).toBe(true)
  })

  it('Should correctly determines equality between values of two arrays', () => {
    expect(math.vec3.isOpposite([0, 0, 0], [0, 0, 0])).toBe(true)
    expect(math.vec3.isOpposite([-1, -1, -1], [1, 1, 1])).toBe(true)
    expect(
      math.vec3.isOpposite([-0.0000000001, 0, 0], [0.0000000001, 0, 0])
    ).toBe(true)
  })

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
