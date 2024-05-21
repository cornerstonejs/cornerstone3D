import { ByteArray, DataSet, ByteStream, readSequenceItem } from 'dicom-parser';
import external from '../../externalModules';

/**
 * Function to deal with extracting an image frame from an encapsulated data set.
 */

function framesAreFragmented(dataSet: DataSet) {
  const numberOfFrames = dataSet.intString('x00280008');
  const pixelDataElement = dataSet.elements.x7fe00010;

  return numberOfFrames !== pixelDataElement.fragments.length;
}

export default function getEncapsulatedImageFrame(
  dataSet: DataSet,
  frameIndex: number
): ByteArray {
  const { dicomParser } = external;

  if (
    dataSet.elements.x7fe00010 &&
    dataSet.elements.x7fe00010.basicOffsetTable.length
  ) {
    // Basic Offset Table is not empty
    return dicomParser.readEncapsulatedImageFrame(
      dataSet,
      dataSet.elements.x7fe00010,
      frameIndex
    );
  }

  // Empty basic offset table

  if (framesAreFragmented(dataSet)) {
    const basicOffsetTable = dicomParser.createJPEGBasicOffsetTable(
      dataSet,
      dataSet.elements.x7fe00010
    );

    return dicomParser.readEncapsulatedImageFrame(
      dataSet,
      dataSet.elements.x7fe00010,
      frameIndex,
      basicOffsetTable
    );
  }

  // the following code is pretty much a duplicate of the logic here
  // https://github.com/cornerstonejs/dicomParser/blob/master/src/readEncapsulatedPixelDataFromFragments.js
  // but it takes care of slicing the array buffer to be sent to the worker. We can't
  // get a view of the buffer because the buffer since it will still have the
  // array buffer, which can be in some cases huge to be sent to the worker.
  // Todo: a better approach would be to transfer the buffer to the worker by having the
  // transferPixelData option set to true, but for some reason it is giving an error
  // in the dicomParser library.
  const fragments = dataSet.elements.x7fe00010.fragments;

  // create byte stream on the data for this pixel data element
  const byteStream = new ByteStream(
    dataSet.byteArrayParser,
    dataSet.byteArray,
    dataSet.elements.x7fe00010.dataOffset
  );

  // seek past the basic offset table (no need to parse it again since we already have)
  const basicOffsetTable = readSequenceItem(byteStream);

  if (basicOffsetTable.tag !== 'xfffee000') {
    throw 'dicomParser.readEncapsulatedPixelData: missing basic offset table xfffee000';
  }

  byteStream.seek(basicOffsetTable.length);

  const fragmentZeroPosition = byteStream.position;

  // we should check that the number of frames + 1 is equal to the number of fragments
  // since there might be a situation where any frame before the one we are looking for
  // here is split into multiple fragments
  if (frameIndex + 1 > fragments.length) {
    throw 'dicomParser.readEncapsulatedPixelData: frame exceeds number of fragments';
  }

  const fragmentHeaderSize = 8;
  const byteOffset =
    fragmentZeroPosition + fragments[frameIndex].offset + fragmentHeaderSize;
  const length = fragments[frameIndex].length;

  // Grab ONLY the portion of the byteArray containing the frame for decoding since
  // it will be impossible to decode the entire image everytime (this return will go
  // to the decodeImageFrame function in cornerstoneWADOImageLoader which runs in a
  // web worker)
  return new Uint8Array(
    byteStream.byteArray.buffer.slice(
      byteStream.byteArray.byteOffset + byteOffset,
      byteStream.byteArray.byteOffset + byteOffset + length
    )
  );
}
