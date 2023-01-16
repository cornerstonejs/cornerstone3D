import { loadedDataSets } from './dataSetCacheManager.js';

function _get(uri) {
  if (!loadedDataSets[uri]) {
    return;
  }

  return loadedDataSets[uri];
}

function isMultiframeDataset(uri) {
  const dataSet = _get(uri);

  return _isMultiframeDataset(dataSet);
}

function _isMultiframeDataset(dataSet) {
  // Checks if dicomTag NumberOf Frames exists and it is greater than one
  if (!dataSet) {
    return false;
  }

  const numberOfFrames = dataSet.intString('x00280008');

  return numberOfFrames && numberOfFrames > 1;
}

function retrieveFrameParameterIndex(uri) {
  return uri.indexOf('&frame=');
}

function retrieveMultiframeDataset(uri) {
  const frameParameterIndex = retrieveFrameParameterIndex(uri);
  const multiframeURI =
    frameParameterIndex === -1 ? uri : uri.slice(0, frameParameterIndex);
  const frame = parseInt(uri.slice(frameParameterIndex + 7), 10) || 1;

  let dataSet;

  if (loadedDataSets[multiframeURI]) {
    dataSet = loadedDataSets[multiframeURI].dataSet;
  } else {
    dataSet = undefined;
  }

  return {
    dataSet,
    frame,
  };
}

function generateMultiframeWADOURIs(uri) {
  const listWADOURIs = [];

  const dataSet = _get(uri);

  if (_isMultiframeDataset(dataSet)) {
    const numberOfFrames = dataSet.intString('x00280008');

    for (let i = 1; i <= numberOfFrames; i++) {
      listWADOURIs.push(`${uri}&frame=${i}`);
    }
  } else {
    listWADOURIs.push(uri);
  }

  return listWADOURIs;
}

export default {
  _get,
  generateMultiframeWADOURIs,
  retrieveMultiframeDataset,
  isMultiframeDataset,
};
