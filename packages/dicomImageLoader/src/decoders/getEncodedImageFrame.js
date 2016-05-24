/**
 * Function to deal with extracting an image frame from an encapsulated data set.
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function isMultiFrame(dataSet) {
    var numberOfFrames = dataSet.intString('x00280008');
    return numberOfFrames > 1;
  }

  function isFragmented(dataSet) {
    var numberOfFrames = dataSet.intString('x00280008');
    var pixelDataElement = dataSet.elements.x7fe00010;
    if(numberOfFrames != pixelDataElement.fragments.length) {
      return true;
    }
  }

  function getEncodedImageFrameEmptyBasicOffsetTable(dataSet, frame) {
    var pixelDataElement = dataSet.elements.x7fe00010;

    if(isMultiFrame(dataSet)) {
      if(isFragmented(dataSet)) {
        // decoding multi-frame with an empty basic offset table requires parsing the fragments
        // to find frame boundaries.
        throw 'multi-frame sop instance with no basic offset table is not currently supported';
      }

      // not fragmented, a frame maps to the fragment
      return dicomParser.readEncapsulatedPixelDataFromFragments(dataSet, pixelDataElement, frame);
    }

    // Single frame - all fragments are for the one image frame
    var startFragment = 0;
    var numFragments = pixelDataElement.fragments.length;
    return dicomParser.readEncapsulatedPixelDataFromFragments(dataSet, pixelDataElement, startFragment, numFragments);
  }

  function getEncodedImageFrame(dataSet, frame) {
    // Empty basic offset table
    if(!dataSet.elements.x7fe00010.basicOffsetTable.length) {
      return getEncodedImageFrameEmptyBasicOffsetTable(dataSet, frame);
    }

    // Basic Offset Table is not empty
    return dicomParser.readEncapsulatedImageFrame(dataSet, dataSet.elements.x7fe00010, frame);
  }
  cornerstoneWADOImageLoader.getEncodedImageFrame = getEncodedImageFrame;
}($, cornerstone, cornerstoneWADOImageLoader));