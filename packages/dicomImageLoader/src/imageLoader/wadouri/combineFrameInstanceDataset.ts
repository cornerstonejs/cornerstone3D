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
  ).map((it) => (shared[it.tag] = it));

  const perFrame = {};

  (PerFrameFunctionalGroupsSequence
    ? Object.values(
        PerFrameFunctionalGroupsSequence.items[frameNumber - 1].dataSet.elements
      )
    : []
  ).map((it) => (perFrame[it.tag] = it));

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
    otherAttributtes,
  } = getMultiframeInformation(dataSet);

  if (PerFrameFunctionalGroupsSequence || NumberOfFrames > 1) {
    const { shared, perFrame } = getFrameInformation(
      PerFrameFunctionalGroupsSequence,
      SharedFunctionalGroupsSequence,
      frameNumber
    );

    // creating a new copy of the dataset to remove the two multiframe dicom tags
    const newDataset = {
      ...otherAttributtes,
      elements: {
        ...otherElements,
        ...shared,
        ...perFrame,
      },
    };

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
