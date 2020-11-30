/* eslint no-bitwise: 0 */
import log from "./log.js";

const BitArray = {
    getBytesForBinaryFrame,
    pack,
    unpack
};

export { BitArray };
export default BitArray;

function getBytesForBinaryFrame(numPixels) {
    // Check whether the 1-bit pixels exactly fit into bytes
    const remainder = numPixels % 8;

    // Number of bytes that work on an exact fit
    let bytesRequired = Math.floor(numPixels / 8);

    // Add one byte if we have a remainder
    if (remainder > 0) {
        bytesRequired++;
    }

    return bytesRequired;
}

function pack(pixelData) {
    const numPixels = pixelData.length;

    log.log("numPixels: " + numPixels);

    const length = getBytesForBinaryFrame(numPixels);
    //log.log('getBytesForBinaryFrame: ' + length);

    const bitPixelData = new Uint8Array(length);

    let bytePos = 0;

    for (let i = 0; i < numPixels; i++) {
        // Compute byte position
        bytePos = Math.floor(i / 8);

        const pixValue = pixelData[i] !== 0;

        //log.log('i: ' + i);
        //log.log('pixValue: ' + pixValue);
        //log.log('bytePos: ' + bytePos);

        const bitPixelValue = pixValue << i % 8;
        //log.log('current bitPixelData: ' + bitPixelData[bytePos]);
        //log.log('this bitPixelValue: ' + bitPixelValue);

        bitPixelData[bytePos] |= bitPixelValue;

        //log.log('new bitPixelValue: ' + bitPixelData[bytePos]);
    }

    return bitPixelData;
}

// convert a packed bitwise pixel array into a byte-per-pixel
// array with 255 corresponding to each set bit in the bit array
function unpack(bitPixelArray) {
    const bitArray = new Uint8Array(bitPixelArray);
    const byteArray = new Uint8Array(8 * bitArray.length);

    for (let byteIndex = 0; byteIndex < byteArray.length; byteIndex++) {
        const bitIndex = byteIndex % 8;
        const bitByteIndex = Math.floor(byteIndex / 8);
        byteArray[byteIndex] =
            255 * ((bitArray[bitByteIndex] & (1 << bitIndex)) >> bitIndex);
    }

    return byteArray;
}
