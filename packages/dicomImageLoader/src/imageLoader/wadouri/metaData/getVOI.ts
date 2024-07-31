import getNumberValues from './getNumberValues';

function getVOI(dataSet) {
  if (!dataSet || !dataSet.elements || !dataSet.elements.x52009229) {
    return {
      windowWidth: undefined,
      windowCenter: undefined,
    };
  }

  const sharedFunctionalGroupsSequence = dataSet.elements.x52009229?.items[0];
  const frameVOILUTSequence =
    sharedFunctionalGroupsSequence?.dataSet?.elements?.x00289132?.items[0]
      ?.dataSet;

  return {
    windowWidth: frameVOILUTSequence
      ? getNumberValues(frameVOILUTSequence, 'x00281051', 1)
      : undefined,
    windowCenter: frameVOILUTSequence
      ? getNumberValues(frameVOILUTSequence, 'x00281050', 1)
      : undefined,
  };
}

export default getVOI;
