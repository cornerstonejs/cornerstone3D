/**
 * Function to deal with extracting an image frame from an encapsulated data set.
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function isMultiFrame(imageFrame) {
    return imageFrame.numberOfFrames > 1;
  }

  function isFragmented(imageFrame, pixelDataElement) {
    if(imageFrame.numberOfFrames != pixelDataElement.fragments.length) {
      return true;
    }
  }

  function getEncodedImageFrameEmptyBasicOffsetTable(dataSet, imageFrame, pixelDataElement, frameIndex) {

    if(isMultiFrame(imageFrame)) {
      if(isFragmented(imageFrame, pixelDataElement)) {
        // decoding multi-frame with an empty basic offset table requires parsing the fragments
        // to find frame boundaries.
        throw 'multi-frame sop instance with no basic offset table is not currently supported';
      }

      // not fragmented, a frame maps to the fragment
      return dicomParser.readEncapsulatedPixelDataFromFragments(dataSet, pixelDataElement, frameIndex);
    }

    // Single frame - all fragments are for the one image frame
    var startFragment = 0;
    var numFragments = pixelDataElement.fragments.length;
    return dicomParser.readEncapsulatedPixelDataFromFragments(dataSet, pixelDataElement, startFragment, numFragments);
  }

  function getEncapsulatedImageFrame(dataSet, imageFrame, pixelDataElement, frameIndex) {
    // Empty basic offset table
    if(!pixelDataElement.basicOffsetTable.length) {
      imageFrame.pixelData = getEncodedImageFrameEmptyBasicOffsetTable(dataSet, imageFrame, pixelDataElement, frameIndex);
      return imageFrame;
    }

    // Basic Offset Table is not empty
    imageFrame.pixelData = dicomParser.readEncapsulatedImageFrame(dataSet, pixelDataElement, frameIndex);
    return imageFrame;
  }
  cornerstoneWADOImageLoader.getEncapsulatedImageFrame = getEncapsulatedImageFrame;
}($, cornerstone, cornerstoneWADOImageLoader));