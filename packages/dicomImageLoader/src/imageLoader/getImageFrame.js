// TODO: import cornerstone from 'cornerstone';

"use strict";

function getImageFrame(imageId) {
  var imagePixelModule = cornerstone.metaData.get('imagePixelModule', imageId);

  return {
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
}

export default getImageFrame;
