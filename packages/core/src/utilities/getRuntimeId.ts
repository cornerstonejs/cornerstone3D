const LAST_RUNTIME_ID = Symbol('LastRuntimeId');
const GLOBAL_CONTEXT = {};
const DEFAULT_MAX = 0xffffffff; // Max 32-bit integer
const DEFAULT_SEPARATOR = '-';

/**
 * Generate a unique numeric ID string valid during a single runtime session;
 *
 * @param context - An optional object to be used as context.
 *  Defaults to a global context;
 * @param separator - The component separator. Defaults to "-";
 * @param max - The maximum component value. Defaults to 4294967295;
 * @returns The string representation of the the unique ID;
 */
export default function getRuntimeId(
  context?: unknown,
  separator?: string,
  max?: number
): string {
  return getNextRuntimeId(
    // @ts-ignore
    context !== null && typeof context === 'object' ? context : GLOBAL_CONTEXT,
    LAST_RUNTIME_ID,
    (typeof max === 'number' && max > 0 ? max : DEFAULT_MAX) >>> 0
  ).join(typeof separator === 'string' ? separator : DEFAULT_SEPARATOR);
}

/*
 * Helpers
 */

function getNextRuntimeId(
  context: Record<symbol, Array<number>>,
  symbol: symbol,
  max: number
): Array<number> {
  let idComponents = context[symbol];
  if (!(idComponents instanceof Array)) {
    idComponents = [0];
    Object.defineProperty(context, symbol, { value: idComponents });
  }
  for (let carry = true, i = 0; carry && i < idComponents.length; ++i) {
    let n = idComponents[i] | 0;
    if (n < max) {
      carry = false;
      n = n + 1;
    } else {
      n = 0;
      if (i + 1 === idComponents.length) {
        idComponents.push(0);
      }
    }
    idComponents[i] = n;
  }
  return idComponents;
}
