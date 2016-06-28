/**
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function decodeImageFrame(imageFrame) {
``    
    var start = new Date().getTime();

    // Implicit VR Little Endian
    if( imageFrame.transferSyntax === "1.2.840.10008.1.2") {
      imageFrame = imageFrame;
    }
    // Explicit VR Little Endian
    else if( imageFrame.transferSyntax === "1.2.840.10008.1.2.1") {
      imageFrame = imageFrame;
    }
    // Explicit VR Big Endian (retired)
    else if ( imageFrame.transferSyntax === "1.2.840.10008.1.2.2" ) {
      imageFrame = cornerstoneWADOImageLoader.decodeBigEndian(imageFrame);
    }
    // Deflate transfer syntax (deflated by dicomParser)
    else if(imageFrame.transferSyntax === '1.2.840.10008.1.2.1.99') {
      imageFrame = imageFrame;
    }
    // RLE Lossless
    else if (imageFrame.transferSyntax === "1.2.840.10008.1.2.5" )
    {
      imageFrame = cornerstoneWADOImageLoader.decodeRLE(imageFrame);
    }
    // JPEG Baseline lossy process 1 (8 bit)
    else if (imageFrame.transferSyntax === "1.2.840.10008.1.2.4.50")
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGBaseline(imageFrame);
    }
    // JPEG Baseline lossy process 2 & 4 (12 bit)
    else if (imageFrame.transferSyntax === "1.2.840.10008.1.2.4.51")
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGBaseline(imageFrame);
    }
    // JPEG Lossless, Nonhierarchical (Processes 14)
    else if (imageFrame.transferSyntax === "1.2.840.10008.1.2.4.57")
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGLossless(imageFrame);
    }
    // JPEG Lossless, Nonhierarchical (Processes 14 [Selection 1])
    else if (imageFrame.transferSyntax === "1.2.840.10008.1.2.4.70" )
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGLossless(imageFrame);
    }
    // JPEG-LS Lossless Image Compression
    else if (imageFrame.transferSyntax === "1.2.840.10008.1.2.4.80" )
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGLS(imageFrame);
    }
    // JPEG-LS Lossy (Near-Lossless) Image Compression
    else if (imageFrame.transferSyntax === "1.2.840.10008.1.2.4.81" )
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGLS(imageFrame);
    }
     // JPEG 2000 Lossless
    else if(imageFrame.transferSyntax === "1.2.840.10008.1.2.4.90")
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEG2000(imageFrame);
    }
    // JPEG 2000 Lossy
    else if(imageFrame.transferSyntax === "1.2.840.10008.1.2.4.91")
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEG2000(imageFrame);
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
    else
    {
      if(console && console.log) {
        console.log("Image cannot be decoded due to Unsupported transfer syntax " + transferSyntax);
      }
      throw "no decoder for transfer syntax " + transferSyntax;
    }
    
    var end = new Date().getTime();
    imageFrame.decodeTimeInMS = end - start;

    return imageFrame;

  }

  cornerstoneWADOImageLoader.decodeImageFrame = decodeImageFrame;
}($, cornerstone, cornerstoneWADOImageLoader));