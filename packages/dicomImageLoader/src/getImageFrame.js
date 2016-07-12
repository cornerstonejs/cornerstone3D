/**
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function getImageFrame(imageId, metaDataProvider) {
    var imagePixelModule = metaDataProvider('imagePixelModule', imageId);

    var imageFrame = {
      samplesPerPixel : imagePixelModule.samplesPerPixel,
      photometricInterpretation : imagePixelModule.photometricInterpretation,
      planarConfiguration : imagePixelModule.planarConfiguration,
      rows : imagePixelModule.rows,
      columns : imagePixelModule.columns,
      bitsAllocated : imagePixelModule.bitsAllocated,
      pixelRepresentation : imagePixelModule.pixelRepresentation, // 0 = unsigned,
      smallestPixelValue: imagePixelModule.smallestPixelValue,
      largestPixelValue: imagePixelModule.largestPixelValue,
      redPaletteColorLookupTableDescriptor : imagePixelModule.redPaletteColorLookupTableDescriptor,
      greenPaletteColorLookupTableDescriptor : imagePixelModule.greenPaletteColorLookupTableDescriptor,
      bluePaletteColorLookupTableDescriptor : imagePixelModule.bluePaletteColorLookupTableDescriptor,
      redPaletteColorLookupTableData : imagePixelModule.redPaletteColorLookupTableData,
      greenPaletteColorLookupTableData : imagePixelModule.greenPaletteColorLookupTableData,
      bluePaletteColorLookupTableData : imagePixelModule.bluePaletteColorLookupTableData,
      pixelData: undefined // populated later after decoding
    };

    return imageFrame;
  }

  cornerstoneWADOImageLoader.getImageFrame = getImageFrame;
}($, cornerstone, cornerstoneWADOImageLoader));