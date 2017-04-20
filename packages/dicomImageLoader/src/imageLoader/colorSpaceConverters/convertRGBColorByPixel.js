"use strict";

function convertRGBColorByPixel(imageFrame, rgbaBuffer) {
    if(imageFrame === undefined) {
        throw "decodeRGB: rgbBuffer must not be undefined";
    }
    if(imageFrame.length % 3 !== 0) {
        throw "decodeRGB: rgbBuffer length must be divisible by 3";
    }

    var numPixels = imageFrame.length / 3;
    var rgbIndex = 0;
    var rgbaIndex = 0;
    for(var i= 0; i < numPixels; i++) {
        rgbaBuffer[rgbaIndex++] = imageFrame[rgbIndex++]; // red
        rgbaBuffer[rgbaIndex++] = imageFrame[rgbIndex++]; // green
        rgbaBuffer[rgbaIndex++] = imageFrame[rgbIndex++]; // blue
        rgbaBuffer[rgbaIndex++] = 255; //alpha
    }
}

export default convertRGBColorByPixel;
