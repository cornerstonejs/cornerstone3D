import dicomParser from 'dicom-parser';

/**
 * Function to deal with extracting an image frame from an encapsulated data set.
 */


function framesAreFragmented (dataSet) {
  const numberOfFrames = dataSet.intString('x00280008');
  const pixelDataElement = dataSet.elements.x7fe00010;

  if (numberOfFrames !== pixelDataElement.fragments.length) {
    return true;
  }
}

function getEncodedImageFrame (dataSet, frame) {
  // Empty basic offset table
  if (!dataSet.elements.x7fe00010.basicOffsetTable.length) {
    if (framesAreFragmented(dataSet)) {
      const basicOffsetTable = dicomParser.createJPEGBasicOffsetTable(dataSet, dataSet.elements.x7fe00010);


      return dicomParser.readEncapsulatedImageFrame(dataSet, dataSet.elements.x7fe00010, frame, basicOffsetTable);
    }

    return dicomParser.readEncapsulatedPixelDataFromFragments(dataSet, dataSet.elements.x7fe00010, frame);

  }

  // Basic Offset Table is not empty
  return dicomParser.readEncapsulatedImageFrame(dataSet, dataSet.elements.x7fe00010, frame);
}

function getEncapsulatedImageFrame (dataSet, frameIndex) {
  return getEncodedImageFrame(dataSet, frameIndex);
}

export default getEncapsulatedImageFrame;
