function getDirectFrameInformation(dataSet, frame) {
  if (!dataSet) {
    return;
  }

  const {
    NumberOfFrames,
    PerFrameFunctionalGroupsSequence,
    SharedFunctionalGroupsSequence,
  } = getMultiframeInformation(dataSet);

  if (PerFrameFunctionalGroupsSequence || NumberOfFrames > 1) {
    const { shared, perFrame } = getFrameInformation(
      PerFrameFunctionalGroupsSequence,
      SharedFunctionalGroupsSequence,
      frame
    );

    return {
      NumberOfFrames,
      PerFrameFunctionalInformation: perFrame,
      SharedFunctionalInformation: shared,
    };
  }

  return {
    NumberOfFrames,
  };
}

function getFrameInformation(
  PerFrameFunctionalGroupsSequence,
  SharedFunctionalGroupsSequence,
  frameNumber
) {
  const shared = {};

  (SharedFunctionalGroupsSequence
    ? Object.values(SharedFunctionalGroupsSequence.items[0].dataSet.elements)
    : []
  )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((it: any) => (shared[it.tag] = it));

  const perFrame = {};

  (PerFrameFunctionalGroupsSequence
    ? Object.values(
        PerFrameFunctionalGroupsSequence.items[frameNumber - 1].dataSet.elements
      )
    : []
  )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((it: any) => (perFrame[it.tag] = it));

  return {
    shared,
    perFrame,
  };
}

function getMultiframeInformation(dataSet) {
  if (!dataSet) {
    return;
  }
  const { elements, ...otherAttributtes } = dataSet;
  const {
    x52009230: PerFrameFunctionalGroupsSequence,
    x52009229: SharedFunctionalGroupsSequence,
    ...otherElements
  } = elements;

  const NumberOfFrames = dataSet.intString('x00280008');

  return {
    NumberOfFrames,
    PerFrameFunctionalGroupsSequence,
    SharedFunctionalGroupsSequence,
    otherElements,
    otherAttributtes,
  };
}

/**
 * Recursively merges DICOM element objects. It gives precedence to per-frame elements,
 * but for nested sequences (SQ), it merges their contents instead of replacing them.
 */
function deepMergeElements(shared, perFrame) {
  // Start with a copy of the shared elements
  const merged = { ...shared };

  // Iterate over per-frame elements
  for (const tag in perFrame) {
    const sharedItem = merged[tag];
    const perFrameItem = perFrame[tag];

    // If the tag exists in both, and both are sequences (have .items),
    // we need to merge their contents recursively.
    if (
      sharedItem &&
      sharedItem.items &&
      perFrameItem.items &&
      sharedItem.items.length > 0 &&
      perFrameItem.items.length > 0 &&
      sharedItem.items[0].dataSet &&
      perFrameItem.items[0].dataSet
    ) {
      // Assuming sequences in this context have only one item, which is standard.
      // If there could be more, this logic would need to be more complex.
      const mergedSubElements = deepMergeElements(
        sharedItem.items[0].dataSet.elements,
        perFrameItem.items[0].dataSet.elements
      );

      // Modify the dataSet of the sharedItem in place.
      // This is necessary because we cannot create a new DataSet object with the correct prototype.
      sharedItem.items[0].dataSet.elements = mergedSubElements;

      // Create a new merged sequence item
      merged[tag] = {
        ...sharedItem,
      };
    } else {
      // Otherwise, the per-frame element takes precedence (overwrite or add).
      merged[tag] = perFrameItem;
    }
  }

  return merged;
}

// function that retrieves specific frame metadata information from multiframe
// metadata
function combineFrameInstanceDataset(frameNumber, dataSet) {
  if (!dataSet) {
    return;
  }

  const {
    NumberOfFrames,
    PerFrameFunctionalGroupsSequence,
    SharedFunctionalGroupsSequence,
    otherElements,
  } = getMultiframeInformation(dataSet);

  if (PerFrameFunctionalGroupsSequence || NumberOfFrames > 1) {
    const { shared, perFrame } = getFrameInformation(
      PerFrameFunctionalGroupsSequence,
      SharedFunctionalGroupsSequence,
      frameNumber
    );

    const mergedFrameElements = deepMergeElements(shared, perFrame);

    // creating a new copy of the dataset to remove the two multiframe dicom tags
    const newElements = {
      elements: {
        ...otherElements,
        ...mergedFrameElements,
      },
    };

    const clonedDataset = Object.create(dataSet);
    const newDataset = Object.assign(clonedDataset, newElements);

    return newDataset;
  }

  return dataSet;
}

export {
  combineFrameInstanceDataset,
  getMultiframeInformation,
  getFrameInformation,
  getDirectFrameInformation,
};
