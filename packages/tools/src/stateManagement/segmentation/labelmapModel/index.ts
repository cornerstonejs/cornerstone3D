export {
  SOURCE_REPRESENTATION_NAME,
  ensureLabelmapState,
  getPrimaryLabelmapId,
  getSegmentOrder,
} from './normalizeLabelmapSegmentationData';
export type { LabelmapSegmentationWithState } from './normalizeLabelmapSegmentationData';
export {
  getConstructorNameForLabelmap,
  getLabelmap,
  getLabelmapDataById,
  getLabelmapForImageId,
  getLabelmapForVolumeId,
  getLabelmapIds,
  getLabelmaps,
  getOrCreateLabelmapVolume,
  getScalarArrayLengthFromLabelmap,
  registerLabelmap,
  removeLabelmap,
} from './labelmapLayerStore';
export {
  getReferencedImageIdToCurrentImageIdMap,
  syncLegacyLabelmapData,
} from './labelmapLegacyAdapter';
export {
  getLabelmapForSegment,
  getLabelToSegmentIndex,
  getLabelValueForSegment,
  getSegmentBinding,
  getSegmentIndexForLabelValue,
  getSegmentsOnLabelmap,
  removeSegmentBinding,
  resolveLabelmapForSegment,
  setSegmentBinding,
} from './labelmapSegmentBindings';
export {
  createPrivateLabelmap,
  moveSegmentToPrivateLabelmap,
} from './privateLabelmap';
export {
  beginLabelmapEditTransaction,
  collectCrossLayerEraseBindings,
  eraseLabelmapEditTransactionOverwrites,
  getLabelmapLayerImageId,
  getLockedVoxelsOnOtherLayers,
  getProtectedSegmentIndicesForLayer,
  resolveLabelmapLayerEditTarget,
} from './labelmapEditTransaction';
export type {
  BeginLabelmapEditTransactionOptions,
  EraseLabelmapEditTransactionOptions,
  LabelmapEditTransaction,
  LabelmapLayerEditTarget,
  LockedLabelmapVoxels,
  ResolveLabelmapLayerEditTargetOptions,
} from './labelmapEditTransaction';
export { default as LabelmapImageReferenceResolver } from './labelmapImageReferenceResolver';
