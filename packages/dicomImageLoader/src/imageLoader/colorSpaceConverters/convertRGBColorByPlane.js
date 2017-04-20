"use strict";

function convertRGBColorByPlane(imageFrame, rgbaBuffer) {
  if(imageFrame === undefined) {
    throw "decodeRGB: rgbBuffer must not be undefined";
  }
  if(imageFrame.length % 3 !== 0) {
    throw "decodeRGB: rgbBuffer length must be divisible by 3";
  }

  var numPixels = imageFrame.length / 3;
  var rgbaIndex = 0;
  var rIndex = 0;
  var gIndex = numPixels;
  var bIndex = numPixels*2;
  for(var i= 0; i < numPixels; i++) {
    rgbaBuffer[rgbaIndex++] = imageFrame[rIndex++]; // red
    rgbaBuffer[rgbaIndex++] = imageFrame[gIndex++]; // green
    rgbaBuffer[rgbaIndex++] = imageFrame[bIndex++]; // blue
    rgbaBuffer[rgbaIndex++] = 255; //alpha
  }
}

export default convertRGBColorByPlane;
