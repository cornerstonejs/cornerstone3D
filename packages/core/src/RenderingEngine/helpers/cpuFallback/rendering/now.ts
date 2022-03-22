/**
 * Use the performance.now() method if possible, and if not, use Date.now()
 *
 * @return {number} Time elapsed since the time origin
 * @memberof Polyfills
 */
export default function (): number {
  if (window.performance) {
    return performance.now();
  }

  return Date.now();
}
