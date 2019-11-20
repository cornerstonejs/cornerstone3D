import { initializeJPEG2000 } from '../../shared/decoders/decodeJPEG2000.js';
import { initializeJPEGLS } from '../../shared/decoders/decodeJPEGLS.js';
import calculateMinMax from '../../shared/calculateMinMax.js';
import decodeImageFrame from '../../shared/decodeImageFrame.js';

// the configuration object for the decodeTask
let decodeConfig;

/**
 * Function to control loading and initializing the codecs
 * @param config
 */
function loadCodecs(config) {
  // Initialize the codecs
  if (config.decodeTask.initializeCodecsOnStartup) {
    // console.time('initializeCodecs');
    initializeJPEG2000(config.decodeTask);
    initializeJPEGLS(config.decodeTask);
    // console.timeEnd('initializeCodecs');
  }
}

/**
 * Task initialization function
 */
function initialize(config) {
  decodeConfig = config;

  loadCodecs(config);
}

/**
 * Task handler function
 */
function handler(data, doneCallback) {
  // Load the codecs if they aren't already loaded
  loadCodecs(decodeConfig);

  const strict =
    decodeConfig && decodeConfig.decodeTask && decodeConfig.decodeTask.strict;
  const imageFrame = data.data.imageFrame;

  // convert pixel data from ArrayBuffer to Uint8Array since web workers support passing ArrayBuffers but
  // not typed arrays
  const pixelData = new Uint8Array(data.data.pixelData);

  decodeImageFrame(
    imageFrame,
    data.data.transferSyntax,
    pixelData,
    decodeConfig.decodeTask,
    data.data.options
  );

  if (!imageFrame.pixelData) {
    throw new Error(
      'decodeTask: imageFrame.pixelData is undefined after decoding'
    );
  }

  calculateMinMax(imageFrame, strict);

  // convert from TypedArray to ArrayBuffer since web workers support passing ArrayBuffers but not
  // typed arrays
  imageFrame.pixelData = imageFrame.pixelData.buffer;

  // invoke the callback with our result and pass the pixelData in the transferList to move it to
  // UI thread without making a copy
  doneCallback(imageFrame, [imageFrame.pixelData]);
}

export default {
  taskType: 'decodeTask',
  handler,
  initialize,
};
