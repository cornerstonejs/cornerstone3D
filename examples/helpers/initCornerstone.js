import dicomParser from 'dicom-parser';
import cornerstone from 'cornerstone-core';
import cornerstoneMath from 'cornerstone-math';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import cornerstoneTools from 'cornerstone-tools';
import Hammer from 'hammerjs';
import { register as registerVTKViewportLoaders } from '@vtk-viewport';

cornerstoneTools.external.cornerstone = cornerstone;
cornerstoneTools.external.Hammer = Hammer;
cornerstoneTools.external.cornerstoneMath = cornerstoneMath;

// TODO We may or may not need this, lets find out!

cornerstoneTools.init();

// Set the tool font and font size
// context.font = "[style] [variant] [weight] [size]/[line height] [font family]";
const fontFamily =
  'Work Sans, Roboto, OpenSans, HelveticaNeue-Light, Helvetica Neue Light, Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif';
cornerstoneTools.textStyle.setFont(`16px ${fontFamily}`);

// Set the tool width
cornerstoneTools.toolStyle.setToolWidth(2);

// Set color for inactive tools
cornerstoneTools.toolColors.setToolColor('rgb(255, 255, 0)');

// Set color for active tools
cornerstoneTools.toolColors.setActiveColor('rgb(0, 255, 0)');

cornerstoneTools.store.state.touchProximity = 40;

window.cornerstone = cornerstone;
window.cornerstoneWADOImageLoader = cornerstoneWADOImageLoader;

cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

cornerstoneWADOImageLoader.configure({ useWebWorkers: false });

var config = {
  maxWebWorkers: navigator.hardwareConcurrency || 1,
  startWebWorkersOnDemand: false,
  taskConfiguration: {
    decodeTask: {
      initializeCodecsOnStartup: false,
      usePDFJS: false,
      strict: false,
    },
  },
};
cornerstoneWADOImageLoader.webWorkerManager.initialize(config);

registerVTKViewportLoaders(cornerstone);
