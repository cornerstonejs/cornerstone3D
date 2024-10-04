/**
 * Deeply compares two objects to determine if they are equal.
 * @param obj1 - The first object to compare.
 * @param obj2 - The second object to compare.
 * @returns True if the objects are deeply equal, false otherwise.
 */
export function deepEqual(obj1: unknown, obj2: unknown): boolean {
  // Special case: if both objects are null or undefined, they're equal
  if (obj1 === obj2) {
    return true;
  }

  // If either object is null or undefined (but not both), they're not equal
  if (obj1 == null || obj2 == null) {
    return false;
  }

  // Use JSON.stringify for deep comparison
  try {
    return JSON.stringify(obj1) === JSON.stringify(obj2);
  } catch (error) {
    // If JSON.stringify throws an error (e.g., for circular references),
    // fall back to a simple comparison
    console.debug('Error in JSON.stringify during deep comparison:', error);
    return obj1 === obj2;
  }
}
