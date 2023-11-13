import {
  SegToolsEditData,
  SegToolsEditDataStack,
  SegToolsEditDataVolume,
} from '../../../../types';

function isStackSegmentation(
  editData: SegToolsEditData
): editData is SegToolsEditDataStack {
  return (editData as SegToolsEditDataStack).imageIds !== undefined;
}

function isVolumeSegmentation(
  editData: SegToolsEditData
): editData is SegToolsEditDataVolume {
  return (editData as SegToolsEditDataVolume).imageVolume !== undefined;
}

export { isStackSegmentation, isVolumeSegmentation };
