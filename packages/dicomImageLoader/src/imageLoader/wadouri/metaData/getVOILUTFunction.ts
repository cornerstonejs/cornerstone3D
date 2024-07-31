function getVOILUTFunction(sharedFunctionalGroupsSequence) {
  if (
    !sharedFunctionalGroupsSequence ||
    !sharedFunctionalGroupsSequence.items ||
    !sharedFunctionalGroupsSequence.items.length
  ) {
    return;
  }

  const frameVOILUTSequence =
    sharedFunctionalGroupsSequence?.items[0]?.dataSet?.elements?.x00289132
      ?.items[0];
  const voiLUTFunction = frameVOILUTSequence?.dataSet?.string('x00281056');

  return voiLUTFunction;
}

export default getVOILUTFunction;
