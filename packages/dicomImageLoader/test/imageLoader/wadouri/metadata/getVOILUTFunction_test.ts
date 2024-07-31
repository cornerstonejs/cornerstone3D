/* eslint import/extensions: 0 */
import { expect } from 'chai';
import getVOILUTFunction from '../../../src/imageLoader/wadouri/metaData/getVOILUTFunction.js';
import xhrRequest from '../../../src/imageLoader/internal/xhrRequest.js';
import dataSetCacheManager from '../../../src/imageLoader/wadouri/dataSetCacheManager.js';
import parseImageId from '../../../src/imageLoader/wadouri/parseImageId.js';

describe('getVOILUTFunction', function () {
  it('should parse voi lut function from frame voi lut sequence', (done) => {
    this.timeout(5000);
    const imageId =
      'dicomweb://localhost:9876/base/testImages/frame-voi-lut-sequence-image.dcm';

    const parsedImageId = parseImageId(imageId);
    const dataSetPromise = dataSetCacheManager.load(
      parsedImageId.url,
      xhrRequest,
      imageId
    );

    dataSetPromise.then((dataSet) => {
      try {
        const sharedFunctionalGroupsSequence = dataSet.elements.x52009229;

        const voiLutFunction = getVOILUTFunction(
          sharedFunctionalGroupsSequence
        );

        expect(voiLutFunction).to.equal('SIGMOID');
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  it('should return undefined if no frame voi lut sequence present', (done) => {
    this.timeout(5000);
    const imageId = 'dicomweb://localhost:9876/base/testImages/CTImage.dcm';

    const parsedImageId = parseImageId(imageId);
    const dataSetPromise = dataSetCacheManager.load(
      parsedImageId.url,
      xhrRequest,
      imageId
    );

    dataSetPromise.then((dataSet) => {
      try {
        const voiLutFunction = getVOILUTFunction(dataSet);

        expect(voiLutFunction).to.equal(undefined);
        done();
      } catch (error) {
        done(error);
      }
    });
  });
});
