/**
 * Returns a random sample of elements from an array.
 * @param array - The input array.
 * @param size - The number of elements to sample.
 * @returns A new array containing the randomly sampled elements.
 */
export function getRandomSampleFromArray(array, size) {
  const result = [];
  const len = array.length;
  const set = new Set(); // Use a Set to track selected indices for O(1) lookups

  while (result.length < size) {
    const x = Math.floor(Math.random() * len);
    if (!set.has(x)) {
      set.add(x);
      result.push(array[x]);
    }
  }
  return result;
}
