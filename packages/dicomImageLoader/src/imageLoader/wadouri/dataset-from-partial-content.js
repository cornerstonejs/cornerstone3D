import external from '../../externalModules.js';

function fixFragments(dataSet) {
  // The partially parsed pixelData element has incorrect fragment
  // lengths because the byte array is truncated, so we manually set
  // it to the actual length.
  const fragments = dataSet.elements.x7fe00010.fragments;
  const totalLength = dataSet.byteArray.length;

  for (const fragment of fragments) {
    const { position, length } = fragment;

    if (length > totalLength - position) {
      console.log(
        `Truncated fragment, changing fragment length from ${
          fragment.length
        } to ${totalLength - position}`
      );
      fragment.length = totalLength - position;
    }
  }

  return dataSet;
}

function parsePartialByteArray(byteArray) {
  const { dicomParser } = external;
  /**
   * First parse just up to pixelData. This will make sure the
   * metadata header is correctly parsed (assuming no other error is
   * thrown during parsing). Then, parse again using the whole partial
   * arraybuffer. This will error, but still kick out the parsed
   * partial pixel data in the error object.
   */

  let dataSet = dicomParser.parseDicom(byteArray, {
    untilTag: 'x7fe00010',
  });

  if (!dataSet.elements.x7fe00010) {
    console.warn('Pixel data not found!');
    // Re-fetch more of the file
  }

  let pixelDataSet;

  try {
    // This is expected to fail, since the file is incomplete, but
    // dicomParser helpfully spits out the parsed partial dataset in
    // the error object. The problem is, the dataset here is
    // incomplete, because dicomParser throws *before* combining the
    // metadata header and regular datasets, so transfer syntax and
    // other metadata headers aren't included.
    pixelDataSet = dicomParser.parseDicom(byteArray);
  } catch (err) {
    console.error(err);
    console.log('pixel data dataset:', err.dataSet);
    pixelDataSet = err.dataSet;
  }

  // Add the parsed partial pixel data element to the dataset
  // including the metadata headers.
  dataSet.elements.x7fe00010 = pixelDataSet.elements.x7fe00010;

  dataSet = fixFragments(dataSet);

  return dataSet;
}

export default async function dataSetFromPartialContent(
  byteArray,
  loadRequest,
  metadata
) {
  const dataSet = parsePartialByteArray(byteArray);
  const { uri, imageId, fileTotalLength } = metadata;

  // Allow re-fetching of more of the file
  dataSet.fetchMore = async function (fetchOptions) {
    // Default to fetching the rest of the file if no lengthToFetch is set. Also
    // default to fetching the same URI/imageId
    const _options = Object.assign(
      {
        uri,
        imageId,
        fetchedLength: byteArray.length, // Not sure if this would ever need to be configurable tbh
        lengthToFetch: fileTotalLength - byteArray.length,
      },
      fetchOptions
    );
    const { fetchedLength, lengthToFetch } = _options;

    // Use passed xhr loader to re-fetch new byte range
    const { arrayBuffer } = await loadRequest(uri, imageId, {
      byteRange: `${fetchedLength}-${fetchedLength + lengthToFetch}`,
    });

    // Combine byte ranges
    const byteArrayToAppend = new Uint8Array(arrayBuffer);
    const combinedByteArray = new Uint8Array(
      dataSet.byteArray.length + byteArrayToAppend.length
    );

    combinedByteArray.set(dataSet.byteArray);
    combinedByteArray.set(byteArrayToAppend, dataSet.byteArray.length);

    // Re-parse potentially partial byte range and return
    return dataSetFromPartialContent(combinedByteArray, loadRequest, metadata);
  };

  return dataSet;
}
