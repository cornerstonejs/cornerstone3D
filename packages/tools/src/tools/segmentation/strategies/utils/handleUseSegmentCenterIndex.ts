export function handleUseSegmentCenterIndex({
  operationData,
  existingValue,
  index,
}) {
  const {
    previewSegmentIndex,
    memo,
    centerSegmentIndexInfo,
    previewOnHover,
    segmentIndex,
    labelValue,
  } = operationData;
  const activeLabelValue = labelValue ?? segmentIndex;

  const {
    hasPreviewIndex,
    hasSegmentIndex,
    segmentIndex: centerSegmentIndex,
  } = centerSegmentIndexInfo;

  // Todo: these can get simplified but for now it is fine
  if (centerSegmentIndex === 0 && hasSegmentIndex && hasPreviewIndex) {
    if (existingValue === activeLabelValue) {
      return;
    }

    // Don't let previewOnHover override the value since basically there might be a
    // moment where we have the preview from the hover and that might get confused by
    // the actual segmentation
    if (previewOnHover) {
      return;
    }

    if (existingValue === previewSegmentIndex) {
      memo.voxelManager.setAtIndex(index, 0);
      return;
    }

    return;
  }

  if (centerSegmentIndex === 0 && hasSegmentIndex && !hasPreviewIndex) {
    if (existingValue === 0 || existingValue !== activeLabelValue) {
      return;
    }

    memo.voxelManager.setAtIndex(index, previewSegmentIndex);
    centerSegmentIndexInfo.changedIndices.push(index);
    return;
  }

  if (centerSegmentIndex === 0 && !hasSegmentIndex && hasPreviewIndex) {
    if (existingValue === activeLabelValue) {
      return;
    }

    // Don't let previewOnHover override the value since basically there might be a
    // moment where we have the preview from the hover and that might get confused by
    // the actual segmentation
    if (previewOnHover) {
      return;
    }

    if (existingValue === previewSegmentIndex) {
      memo.voxelManager.setAtIndex(index, 0);
      return;
    }

    return;
  }

  if (centerSegmentIndex === 0 && !hasSegmentIndex && !hasPreviewIndex) {
    if (existingValue === activeLabelValue) {
      return;
    }

    if (existingValue === previewSegmentIndex) {
      memo.voxelManager.setAtIndex(index, previewSegmentIndex);
      return;
    }

    return;
  }

  if (
    centerSegmentIndex === previewSegmentIndex &&
    hasSegmentIndex &&
    hasPreviewIndex
  ) {
    if (existingValue === activeLabelValue) {
      return;
    }

    memo.voxelManager.setAtIndex(index, previewSegmentIndex);

    return;
  }

  if (
    centerSegmentIndex === previewSegmentIndex &&
    !hasSegmentIndex &&
    hasPreviewIndex
  ) {
    if (existingValue === activeLabelValue) {
      return;
    }

    memo.voxelManager.setAtIndex(index, previewSegmentIndex);

    return;
  }

  if (
    centerSegmentIndex === activeLabelValue &&
    hasSegmentIndex &&
    hasPreviewIndex
  ) {
    if (existingValue === activeLabelValue) {
      return;
    }

    memo.voxelManager.setAtIndex(index, previewSegmentIndex);

    return;
  }
  if (
    centerSegmentIndex === activeLabelValue &&
    hasSegmentIndex &&
    !hasPreviewIndex
  ) {
    if (existingValue === activeLabelValue) {
      return;
    }

    memo.voxelManager.setAtIndex(index, previewSegmentIndex);

    return;
  }
}
