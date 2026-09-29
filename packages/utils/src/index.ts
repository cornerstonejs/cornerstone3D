export { version } from './version';
export * as utilities from './utilities';
export * as logging from './utilities/logging';

export { asArray } from './utilities/object';
export { default as isColorImage } from './utilities/isColorImage';
export {
  toNumber,
  toFiniteNumber,
  isEqual,
  isEqualNegative,
  isEqualAbs,
  isNumber,
  DEFAULT_EPSILON,
  areNumbersEqualWithTolerance,
} from './utilities/math';
export type { Logger } from './utilities/logging';
