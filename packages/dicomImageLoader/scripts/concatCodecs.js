const fs = require('fs-extra');
const concat = require('concat');
const codecFiles = [
    './codecs/charLS-FixedMemory-browser.js',
    './codecs/jpeg.js',
    './codecs/jpegLossless.js',
    './codecs/jpx.min.js',
    './codecs/openJPEG-FixedMemory.js',
    './codecs/pako.min.js'
];
const outputFile = './dist/cornerstoneWADOImageLoaderCodecs.js';

const buildCodecs = () => {
    fs.ensureDirSync('./dist');
    fs.removeSync(outputFile);
    concat(codecFiles, outputFile);
}

buildCodecs();