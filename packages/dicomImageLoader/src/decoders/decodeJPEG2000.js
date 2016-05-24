(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";


  function decodeJPEG2000(dataSet, frame)
  {
    var height = dataSet.uint16('x00280010');
    var width = dataSet.uint16('x00280011');

    var encodedImageFrame = cornerstoneWADOImageLoader.getEncodedImageFrame(dataSet, frame);

    var jpxImage = new JpxImage();

    jpxImage.parse(encodedImageFrame);

    var j2kWidth = jpxImage.width;
    var j2kHeight = jpxImage.height;
    if(j2kWidth !== width) {
      throw 'JPEG2000 decoder returned width of ' + j2kWidth + ', when ' + width + ' is expected';
    }
    if(j2kHeight !== height) {
      throw 'JPEG2000 decoder returned width of ' + j2kHeight + ', when ' + height + ' is expected';
    }
    var tileCount = jpxImage.tiles.length;
    if(tileCount !== 1) {
      throw 'JPEG2000 decoder returned a tileCount of ' + tileCount + ', when 1 is expected';
    }
    var tileComponents = jpxImage.tiles[0];
    var pixelData = tileComponents.items;
    return pixelData;
  }

  cornerstoneWADOImageLoader.decodeJPEG2000 = decodeJPEG2000;
}($, cornerstone, cornerstoneWADOImageLoader));