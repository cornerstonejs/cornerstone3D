/**
 * Bridge for a package that depends on `@cornerstonejs/core` alone.
 * `@cornerstonejs/metadata` holds the implementation and the documentation.
 */
import { utilities } from '@cornerstonejs/metadata';

export const definedAttributesOf = utilities.definedAttributesOf;

export default definedAttributesOf;
