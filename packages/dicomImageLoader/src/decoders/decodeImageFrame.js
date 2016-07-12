/**
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function decodeImageFrame(imageFrame, transferSyntax, pixelData, canvas) {
    var start = new Date().getTime();

    // Implicit VR Little Endian
    if(transferSyntax === "1.2.840.10008.1.2") {
      imageFrame = cornerstoneWADOImageLoader.decodeLittleEndian(imageFrame, pixelData);
    }
    // Explicit VR Little Endian
    else if(transferSyntax === "1.2.840.10008.1.2.1") {
      imageFrame = cornerstoneWADOImageLoader.decodeLittleEndian(imageFrame, pixelData);
    }
    // Explicit VR Big Endian (retired)
    else if (transferSyntax === "1.2.840.10008.1.2.2" ) {
      imageFrame = cornerstoneWADOImageLoader.decodeBigEndian(imageFrame, pixelData);
    }
    // Deflate transfer syntax (deflated by dicomParser)
    else if(transferSyntax === '1.2.840.10008.1.2.1.99') {
      imageFrame = cornerstoneWADOImageLoader.decodeLittleEndian(imageFrame, pixelData);
    }
    // RLE Lossless
    else if (transferSyntax === "1.2.840.10008.1.2.5" )
    {
      imageFrame = cornerstoneWADOImageLoader.decodeRLE(imageFrame, pixelData);
    }
    // JPEG Baseline lossy process 1 (8 bit)
    else if (transferSyntax === "1.2.840.10008.1.2.4.50")
    {
      if(imageFrame.bitsAllocated === 8)
      {
        return cornerstoneWADOImageLoader.decodeJPEGBaseline8Bit(imageFrame, canvas);
      } else {
        imageFrame = cornerstoneWADOImageLoader.decodeJPEGBaseline(imageFrame, pixelData);
      }
    }
    // JPEG Baseline lossy process 2 & 4 (12 bit)
    else if (transferSyntax === "1.2.840.10008.1.2.4.51")
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGBaseline(imageFrame, pixelData);
    }
    // JPEG Lossless, Nonhierarchical (Processes 14)
    else if (transferSyntax === "1.2.840.10008.1.2.4.57")
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGLossless(imageFrame, pixelData);
    }
    // JPEG Lossless, Nonhierarchical (Processes 14 [Selection 1])
    else if (transferSyntax === "1.2.840.10008.1.2.4.70" )
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGLossless(imageFrame, pixelData);
    }
    // JPEG-LS Lossless Image Compression
    else if (transferSyntax === "1.2.840.10008.1.2.4.80" )
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGLS(imageFrame, pixelData);
    }
    // JPEG-LS Lossy (Near-Lossless) Image Compression
    else if (transferSyntax === "1.2.840.10008.1.2.4.81" )
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEGLS(imageFrame, pixelData);
    }
     // JPEG 2000 Lossless
    else if (transferSyntax === "1.2.840.10008.1.2.4.90")
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEG2000(imageFrame, pixelData);
    }
    // JPEG 2000 Lossy
    else if (transferSyntax === "1.2.840.10008.1.2.4.91")
    {
      imageFrame = cornerstoneWADOImageLoader.decodeJPEG2000(imageFrame, pixelData);
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

    // Convert color space for color images
    if(cornerstoneWADOImageLoader.isColorImage(imageFrame.photometricInterpretation)) {
      // setup the canvas context
      canvas.height = imageFrame.rows;
      canvas.width = imageFrame.columns;

      var context = canvas.getContext('2d');
      var imageData = context.createImageData(imageFrame.columns, imageFrame.rows);
      cornerstoneWADOImageLoader.convertColorSpace(imageFrame, imageData);
      imageFrame.imageData = imageData;
      imageFrame.pixelData = imageData.data;
    }
    
    var deferred = $.Deferred();
    deferred.resolve(imageFrame);
    return deferred.promise();
  }

  cornerstoneWADOImageLoader.decodeImageFrame = decodeImageFrame;
}($, cornerstone, cornerstoneWADOImageLoader));