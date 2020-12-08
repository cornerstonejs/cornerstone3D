/**
 * Returns the first argument if defined, otherwise returns the second
 *
 * @param {*} value
 * @param {*} defaultValue
 * @returns {*}
 */
export default function(value, defaultValue) {
  return value === undefined ? defaultValue : value;
}
