export { version } from './version';
export * as utilities from './utilities';
export * as logging from './utilities/logging';

export { asArray, asArrayFirst, asMultiValueArray } from './utilities/object';
export {
  toNumber,
  toFiniteNumber,
  toFiniteFirst,
  toFiniteVector,
  isEqual,
  isEqualNegative,
  isEqualAbs,
  isNumber,
  DEFAULT_EPSILON,
  areNumbersEqualWithTolerance,
} from './utilities/math';
export type { Logger } from './utilities/logging';
