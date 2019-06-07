/* eslint import/extensions: 0 */
import { expect } from 'chai';
import external from '../../../src/externalModules.js';
import { loadImage } from '../../../src/imageLoader/wadouri/loadImage.js';
import configure from '../../../src/imageLoader/configure.js';
import webWorkerManager from '../../../src/imageLoader/webWorkerManager.js';

external.cornerstone = window.cornerstone;

describe('#wadouri > getImagePixelSpacing', function () {
  // Initialize the web worker manager
  const config = {
    maxWebWorkers: 1,
    startWebWorkersOnDemand: true,
    webWorkerPath: '/base/dist/cornerstoneWADOImageLoaderWebWorker.js',
    taskConfiguration: {
      decodeTask: {
        loadCodecsOnStartup: true,
        initializeCodecsOnStartup: true,
        codecsPath: '/base/dist/cornerstoneWADOImageLoaderCodecs.js',
        usePDFJS: false
      }
    }
  };

  webWorkerManager.initialize(config);

  configure({
    strict: false,
    useWebWorkers: false,
    decodeConfig: {
      usePDFJS: false
    }
  });

  const imageId = 'dicomweb://localhost:9876/base/testImages/no-pixel-spacing-yes-image-pixel-spacing.dcm';

  it('should return imagePixelSpacing.column... as columnPixelSpacing if pixelSpacing is undefined', function (done) {
    this.timeout(5000);
    loadImage(imageId).promise.then(image => {
      const imagePlaneModule = external.cornerstone.metaData.get('imagePlaneModule', imageId);
      const { columnPixelSpacing } = imagePlaneModule;

      try {
        expect(columnPixelSpacing).to.be.equal(null);
        expect(image.columnPixelSpacing).to.be.closeTo(0.2, 1e-9);
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  it('should return imagePixelSpacing.rowPix... as rowPixelSpacing if pixelSpacing is undefined', function (done) {
    this.timeout(5000);
    loadImage(imageId).promise.then(image => {
      const imagePlaneModule = external.cornerstone.metaData.get('imagePlaneModule', imageId);
      const { rowPixelSpacing } = imagePlaneModule;

      try {
        expect(rowPixelSpacing).to.be.equal(null);
        expect(image.rowPixelSpacing).to.be.closeTo(0.2, 1e-9);
        done();
      } catch (error) {
        console.log(error);
        done(error);
      }
    });
  });
});


