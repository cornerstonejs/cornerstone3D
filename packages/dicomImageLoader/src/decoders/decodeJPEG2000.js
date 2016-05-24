(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function decodeJpx(dataSet, frame) {
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

  function decodeOpenJpeg2000(dataSet, frame) {
    var height = dataSet.uint16('x00280010');
    var width = dataSet.uint16('x00280011');

    var encodedImageFrame = cornerstoneWADOImageLoader.getEncodedImageFrame(dataSet, frame);

    var image = Module.opj_decode(encodedImageFrame);
    var j2kWidth = image.sx;
    var j2kHeight = image.sy;

    if(j2kWidth !== width) {
      throw 'JPEG2000 decoder returned width of ' + j2kWidth + ', when ' + width + ' is expected';
    }
    if(j2kHeight !== height) {
      throw 'JPEG2000 decoder returned width of ' + j2kHeight + ', when ' + height + ' is expected';
    }

    var pixelData = new Int16Array(image.pixelData);
    return pixelData;
  }

  function decodeJPEG2000(dataSet, frame)
  {
    // OpenJPEG2000 https://github.com/jpambrun/openjpeg
    if(Module && Module.opj_decode) {
      return decodeOpenJpeg2000(dataSet, frame);
    }

    // OHIF image-JPEG2000 https://github.com/OHIF/image-JPEG2000
    if(JpxImage) {
      return decodeJpx(dataSet, frame);
    }
    throw 'No JPEG2000 decoder loaded';
  }

  cornerstoneWADOImageLoader.decodeJPEG2000 = decodeJPEG2000;
}($, cornerstone, cornerstoneWADOImageLoader));