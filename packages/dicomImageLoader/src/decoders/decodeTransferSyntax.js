(function (cornerstoneWADOImageLoader) {

  "use strict";

  function decodeTransferSyntax(dataSet, frame) {
    var transferSyntax = dataSet.string('x00020010');

    // Implicit VR Little Endian
    if( transferSyntax === "1.2.840.10008.1.2") {
      return cornerstoneWADOImageLoader.extractUncompressedPixels(dataSet, frame);
    }
    // Explicit VR Little Endian
    else if( transferSyntax === "1.2.840.10008.1.2.1") {
      return cornerstoneWADOImageLoader.extractUncompressedPixels(dataSet, frame);
    }
    // Explicit VR Big Endian (retired)
    else if ( transferSyntax === "1.2.840.10008.1.2.2" )
    {
      return cornerstoneWADOImageLoader.extractUncompressedPixels(dataSet, frame, true);
    }
    // JPEG 2000 Lossless
    else if(transferSyntax === "1.2.840.10008.1.2.4.90")
    {
      return cornerstoneWADOImageLoader.decodeJPEG2000(dataSet, frame);
    }
    // JPEG 2000 Lossy
    else if(transferSyntax === "1.2.840.10008.1.2.4.91")
    {
      return cornerstoneWADOImageLoader.decodeJPEG2000(dataSet, frame);
    }
    /* Don't know if these work...
    // JPEG 2000 Part 2 Multicomponent Image Compression (Lossless Only)
    else if(transferSyntax === "1.2.840.10008.1.2.4.92")
    {
      return cornerstoneWADOImageLoader.decodeJPEG2000(dataSet, frame);
    }
    // JPEG 2000 Part 2 Multicomponent Image Compression
    else if(transferSyntax === "1.2.840.10008.1.2.4.93")
    {
      return cornerstoneWADOImageLoader.decodeJPEG2000(dataSet, frame);
    }
    */
    // RLE Lossless
    else if ( transferSyntax === "1.2.840.10008.1.2.5" )
    {
      return cornerstoneWADOImageLoader.decodeRLE( dataSet, frame);
    }
    // JPEG Baseline lossy process 1 (8 bit)
    else if ( transferSyntax === "1.2.840.10008.1.2.4.50" )
    {
      return cornerstoneWADOImageLoader.decodeJPEGBaseline(dataSet, frame);
    }
    // JPEG Baseline lossy process 2 & 4 (12 bit)
    else if ( transferSyntax === "1.2.840.10008.1.2.4.51" )
    {
      return cornerstoneWADOImageLoader.decodeJPEGBaseline(dataSet, frame);
    }
    // JPEG Lossless, Nonhierarchical (Processes 14)
    else if ( transferSyntax === "1.2.840.10008.1.2.4.57" )
    {
      return cornerstoneWADOImageLoader.decodeJPEGLossless(dataSet, frame);
    }
    // JPEG Lossless, Nonhierarchical (Processes 14 [Selection 1])
    else if ( transferSyntax === "1.2.840.10008.1.2.4.70" )
    {
      return cornerstoneWADOImageLoader.decodeJPEGLossless(dataSet, frame);
    }
    else
    {
      if(console && console.log) {
        console.log("Image cannot be decoded due to Unsupported transfer syntax " + transferSyntax);
      }
      throw "no decoder for transfer syntax " + transferSyntax;
    }
  }

  // module exports
  cornerstoneWADOImageLoader.decodeTransferSyntax = decodeTransferSyntax;

}(cornerstoneWADOImageLoader));