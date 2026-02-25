/**
 * @deprecated Import from `@cornerstonejs/metadata` instead.
 * This module re-exports the metadata provider chain from `@cornerstonejs/metadata`.
 */
import { metaData } from '@cornerstonejs/metadata';

export const {
  addProvider,
  removeProvider,
  removeAllProviders,
  getMetaData,
  get,
  getNormalized,
  toUpperCamelTag,
  toLowerCamelTag,
} = metaData;
