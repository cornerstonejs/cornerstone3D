/**
 * Returns the values as an array of javascript numbers
 *
 * @param val - The javascript object for the specified element in the metadata
 * @returns {*}
 */
export function toNumber(val) {
  if (Array.isArray(val)) {
    return [...val].map((v) => (v !== undefined ? Number(v) : v));
  } else {
    return val !== undefined ? Number(val) : val;
  }
}

export default toNumber;
