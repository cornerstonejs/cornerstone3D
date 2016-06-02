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

  var openJPEG;

  function decodeOpenJPEG(data, bytesPerPixel, signed) {
    var dataPtr = openJPEG._malloc(data.length);
    openJPEG.writeArrayToMemory(data, dataPtr);

    // create param outpout
    var imagePtrPtr=openJPEG._malloc(4);
    var imageSizePtr=openJPEG._malloc(4);
    var imageSizeXPtr=openJPEG._malloc(4);
    var imageSizeYPtr=openJPEG._malloc(4);
    var imageSizeCompPtr=openJPEG._malloc(4);

    var t0 = Date.now();
    var ret = openJPEG.ccall('jp2_decode','number', ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
      [dataPtr, data.length, imagePtrPtr, imageSizePtr, imageSizeXPtr, imageSizeYPtr, imageSizeCompPtr]);
    // add num vomp..etc
    if(ret !== 0){
      console.log('[opj_decode] decoding failed!')
      openJPEG._free(dataPtr);
      openJPEG._free(openJPEG.getValue(imagePtrPtr, '*'));
      openJPEG._free(imageSizeXPtr);
      openJPEG._free(imageSizeYPtr);
      openJPEG._free(imageSizePtr);
      openJPEG._free(imageSizeCompPtr);
      return undefined;
    }

    var imagePtr = openJPEG.getValue(imagePtrPtr, '*')

    var image = {
      length : openJPEG.getValue(imageSizePtr,'i32'),
      sx :  openJPEG.getValue(imageSizeXPtr,'i32'),
      sy :  openJPEG.getValue(imageSizeYPtr,'i32'),
      nbChannels : openJPEG.getValue(imageSizeCompPtr,'i32'), // hard coded for now
      perf_timetodecode : undefined,
      pixelData : undefined
    };

    // Copy the data from the EMSCRIPTEN heap into the correct type array
    var length = image.sx*image.sy*image.nbChannels;
    var src32 = new Uint32Array(openJPEG.HEAP32.buffer, imagePtr, length);
    if(bytesPerPixel === 1) {
      if(Uint8Array.from) {
        image.pixelData = Uint8Array.from(src32);
      } else {
        image.pixelData = new Uint8Array(length);
        for(var i=0; i < length; i++) {
          image.pixelData[i] = src32[i];
        }
      }
    } else {
      if (signed) {
        if(Int16Array.from) {
          image.pixelData = Int16Array.from(src32);
        } else {
          image.pixelData = new Int16Array(length);
          for(var i=0; i < length; i++) {
            image.pixelData[i] = src32[i];
          }
        }
      } else {
        if(Uint16Array.from) {
          image.pixelData = Uint16Array.from(src32);
        } else {
          image.pixelData = new Uint16Array(length);
          for(var i=0; i < length; i++) {
            image.pixelData[i] = src32[i];
          }
        }
      }
    }

    var t1 = Date.now();
    image.perf_timetodecode = t1-t0;

    // free
    openJPEG._free(dataPtr);
    openJPEG._free(imagePtrPtr);
    openJPEG._free(imagePtr);
    openJPEG._free(imageSizePtr);
    openJPEG._free(imageSizeXPtr);
    openJPEG._free(imageSizeYPtr);
    openJPEG._free(imageSizeCompPtr);

    return image;
  }

  function decodeOpenJpeg2000(dataSet, frame) {
    var height = dataSet.uint16('x00280010');
    var width = dataSet.uint16('x00280011');

    var encodedImageFrame = cornerstoneWADOImageLoader.getEncodedImageFrame(dataSet, frame);

    var bytesPerPixel = dataSet.uint16('x00280100') <= 8 ? 1 : 2;
    var signed = dataSet.uint16('x00280103') ? true : false;

    var image = decodeOpenJPEG(encodedImageFrame, bytesPerPixel, signed);
    var j2kWidth = image.sx;
    var j2kHeight = image.sy;

    if(j2kWidth !== width) {
      throw 'JPEG2000 decoder returned width of ' + j2kWidth + ', when ' + width + ' is expected';
    }
    if(j2kHeight !== height) {
      throw 'JPEG2000 decoder returned width of ' + j2kHeight + ', when ' + height + ' is expected';
    }
    return image.pixelData;
  }

  function decodeJPEG2000(dataSet, frame)
  {
    // Try to initialize OpenJPEG
    if(typeof OpenJPEG !== 'undefined' && !openJPEG) {
      openJPEG = OpenJPEG();
      if(!openJPEG || !openJPEG._jp2_decode) {
        throw 'OpenJPEG failed to initialize';
      }
    }

    // OpenJPEG2000 https://github.com/jpambrun/openjpeg
    if(openJPEG && openJPEG._jp2_decode) {
      return decodeOpenJpeg2000(dataSet, frame);
    }

    // OHIF image-JPEG2000 https://github.com/OHIF/image-JPEG2000
    if(typeof JpxImage !== 'undefined') {
      return decodeJpx(dataSet, frame);
    }
    throw 'No JPEG2000 decoder loaded';
  }

  cornerstoneWADOImageLoader.decodeJPEG2000 = decodeJPEG2000;
}($, cornerstone, cornerstoneWADOImageLoader));