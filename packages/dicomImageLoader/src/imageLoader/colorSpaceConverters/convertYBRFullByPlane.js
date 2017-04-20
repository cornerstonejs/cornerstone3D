"use strict";

function convertYBRFullByPlane(imageFrame, rgbaBuffer) {
  if (imageFrame === undefined) {
    throw "decodeRGB: ybrBuffer must not be undefined";
  }
  if (imageFrame.length % 3 !== 0) {
    throw "decodeRGB: ybrBuffer length must be divisble by 3";
  }


  var numPixels = imageFrame.length / 3;
  var rgbaIndex = 0;
  var yIndex = 0;
  var cbIndex = numPixels;
  var crIndex = numPixels * 2;
  for (var i = 0; i < numPixels; i++) {
    var y = imageFrame[yIndex++];
    var cb = imageFrame[cbIndex++];
    var cr = imageFrame[crIndex++];
    rgbaBuffer[rgbaIndex++] = y + 1.40200 * (cr - 128);// red
    rgbaBuffer[rgbaIndex++] = y - 0.34414 * (cb - 128) - 0.71414 * (cr - 128); // green
    rgbaBuffer[rgbaIndex++] = y + 1.77200 * (cb - 128); // blue
    rgbaBuffer[rgbaIndex++] = 255; //alpha
  }
}
export default convertYBRFullByPlane;
