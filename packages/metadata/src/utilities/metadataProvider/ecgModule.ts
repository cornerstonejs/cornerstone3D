/**
 * ECG module is provided from instance data (INSTANCE_ORIG) via registerTagModules(),
 * the same way as other tag-based modules. Use metaData.get(MetadataModules.ECG, imageId)
 * to retrieve it when instance is in cache.
 */
export type { EcgModuleMetadata } from '../../types';
