import { initialize as initializeJPEG2000 } from '../shared/decoders/decodeJPEG2000.js';
import { initialize as initializeJPEGLS } from '../shared/decoders/decodeJPEGLS.js';
import calculateMinMax from '../shared/calculateMinMax.js';
import decodeImageFrame from '../shared/decodeImageFrame.js';

// the configuration object for the decodeTask
let decodeConfig;

/**
 * Function to control loading and initializing the codecs
 * @param config
 */
function loadCodecs(config) {
  // Initialize the codecs
  if (config.decodeTask.initializeCodecsOnStartup) {
    initializeJPEG2000(config.decodeTask);
    initializeJPEGLS(config.decodeTask);
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
async function handler(data, doneCallback) {
  // Load the codecs if they aren't already loaded
  loadCodecs(decodeConfig);

  const strict =
    decodeConfig && decodeConfig.decodeTask && decodeConfig.decodeTask.strict;

  // convert pixel data from ArrayBuffer to Uint8Array since web workers support passing ArrayBuffers but
  // not typed arrays
  const pixelData = new Uint8Array(data.data.pixelData);

  const imageFrame = await decodeImageFrame(
    data.data.imageFrame,
    data.data.transferSyntax,
    pixelData,
    // decodeTask are webworker specific, but decodeConfig are the configs
    // that are passed in from the user. We need to merge them together
    Object.assign(decodeConfig.decodeTask, data.data.decodeConfig),
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

  doneCallback?.(imageFrame, [imageFrame.pixelData]);

  return {
    result: imageFrame,
    transferList: [imageFrame.pixelData],
  };
}

export default {
  taskType: 'decodeTask',
  handler,
  initialize,
};
