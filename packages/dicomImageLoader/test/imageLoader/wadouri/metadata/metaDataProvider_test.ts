/* eslint import/extensions: 0 */
import { expect } from 'chai';
import external from '../../../../src/externalModules.js';
import { loadImage } from '../../../../src/imageLoader/wadouri/loadImage.js';
import configure from '../../../../src/imageLoader/configure.js';
import webWorkerManager from '../../../../src/imageLoader/webWorkerManager.js';

external.cornerstone = window.cornerstone;

describe('#wadouri > metadataProvider', function () {
  // Initialize the web worker manager
  const config = {
    maxWebWorkers: 1,
    startWebWorkersOnDemand: true,
    taskConfiguration: {
      decodeTask: {
        initializeCodecsOnStartup: true,
      },
    },
  };

  webWorkerManager.initialize(config);

  configure({
    strict: false,
    decodeConfig: {},
  });

  const imageId =
    'dicomweb://localhost:9876/base/testImages/no-pixel-spacing.dcm';

  it('should return columnPixelSpacing undefined if pixelSpacing is undefined', function (done) {
    this.timeout(5000);
    loadImage(imageId).promise.then(() => {
      const imagePlaneModule = external.cornerstone.metaData.get(
        'imagePlaneModule',
        imageId
      );
      const { columnPixelSpacing } = imagePlaneModule;

      try {
        expect(columnPixelSpacing).to.be.equal(null);
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  it('should return rowPixelSpacing undefined if pixelSpacing is undefined', function (done) {
    this.timeout(5000);
    loadImage(imageId).promise.then(() => {
      const imagePlaneModule = external.cornerstone.metaData.get(
        'imagePlaneModule',
        imageId
      );
      const { rowPixelSpacing } = imagePlaneModule;

      try {
        expect(rowPixelSpacing).to.be.equal(null);
        done();
      } catch (error) {
        console.log(error);
        done(error);
      }
    });
  });

  it('should return window width and center from frame voi lut sequence if sequence is defined', function (done) {
    this.timeout(5000);
    const imageIdFrameVoiLutSequence =
      'dicomweb://localhost:9876/base/testImages/frame-voi-lut-sequence-image.dcm';

    loadImage(imageIdFrameVoiLutSequence).promise.then(() => {
      const voiLutModule = external.cornerstone.metaData.get(
        'voiLutModule',
        imageIdFrameVoiLutSequence
      );

      const { windowWidth, windowCenter } = voiLutModule;

      try {
        expect(windowCenter).to.eql([2098, 2073, 2130]);
        expect(windowWidth).to.eql([567, 509, 640]);
        done();
      } catch (error) {
        console.log(error);
        done(error);
      }
    });
  });

  it('should return basic window width and center if frame voi lut sequence is not defined', function (done) {
    this.timeout(5000);
    const basicImageId =
      'dicomweb://localhost:9876/base/testImages/CTImage.dcm';

    loadImage(basicImageId).promise.then(() => {
      const voiLutModule = external.cornerstone.metaData.get(
        'voiLutModule',
        basicImageId
      );

      const { windowWidth, windowCenter } = voiLutModule;

      try {
        expect(windowCenter).to.eql([40]);
        expect(windowWidth).to.eql([400]);
        done();
      } catch (error) {
        console.log(error);
        done(error);
      }
    });
  });

  it('should return voi lut function from frame voi lut sequence if sequence is defined', function (done) {
    this.timeout(5000);
    const imageIdFrameVoiLutSequence =
      'dicomweb://localhost:9876/base/testImages/frame-voi-lut-sequence-image.dcm';

    loadImage(imageIdFrameVoiLutSequence).promise.then(() => {
      const voiLutModule = external.cornerstone.metaData.get(
        'voiLutModule',
        imageIdFrameVoiLutSequence
      );

      const { voiLUTFunction } = voiLutModule;

      try {
        expect(voiLUTFunction).to.equal('SIGMOID');
        done();
      } catch (error) {
        console.log(error);
        done(error);
      }
    });
  });

  it('should return undefined as voi lut function if frame voi lut sequence is not defined', function (done) {
    this.timeout(5000);
    const basicImageId =
      'dicomweb://localhost:9876/base/testImages/CTImage.dcm';

    loadImage(basicImageId).promise.then(() => {
      const voiLutModule = external.cornerstone.metaData.get(
        'voiLutModule',
        basicImageId
      );

      const { voiLUTFunction } = voiLutModule;

      try {
        expect(voiLUTFunction).to.equal(undefined);
        done();
      } catch (error) {
        console.log(error);
        done(error);
      }
    });
  });
});
