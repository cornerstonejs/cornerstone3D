/* eslint import/extensions: 0 */
import * as cornerstone from '@cornerstonejs/core';
import { should } from 'chai';
import * as dicomParser from 'dicom-parser';
import configure from '../src/imageLoader/configure';
import createImage from '../src/imageLoader/createImage';
import xhrRequest from '../src/imageLoader/internal/xhrRequest';
import dataSetCacheManager from '../src/imageLoader/wadouri/dataSetCacheManager';
import getPixelData from '../src/imageLoader/wadouri/getPixelData';
import parseImageId from '../src/imageLoader/wadouri/parseImageId';

import external from '../src/externalModules';

external.dicomParser = dicomParser;
external.cornerstone = cornerstone;

should();

const transferSyntaxes = {
  '1.2.840.10008.1.2': 'LittleEndianImplicitTransferSyntax',
  '1.2.840.10008.1.2.1': 'LittleEndianExplicitTransferSyntax',
  '1.2.840.10008.1.2.1.99': 'DeflatedExplicitVRLittleEndianTransferSyntax',

  '1.2.840.10008.1.2.2': 'BigEndianExplicitTransferSyntax',

  // retired? Do we care?
  // '1.2.840.10008.1.2.4.53': 'JPEGProcess6_8TransferSyntax',
  // '1.2.840.10008.1.2.4.55': 'JPEGProcess10_12TransferSyntax',

  '1.2.840.10008.1.2.4.57': 'JPEGProcess14TransferSyntax',
  '1.2.840.10008.1.2.4.70': 'JPEGProcess14SV1TransferSyntax',
  '1.2.840.10008.1.2.4.80': 'JPEGLSLosslessTransferSyntax',

  '1.2.840.10008.1.2.4.90': 'JPEG2000LosslessOnlyTransferSyntax',
  '1.2.840.10008.1.2.5': 'RLELosslessTransferSyntax',
};

const base = 'CTImage.dcm';
const url = `dicomweb://${window.location.host}/testImages/`;

describe('Test lossless TransferSyntaxes decoding', function () {
  let uncompressedPixelData = null;

  let uncompressedImage = null;

  beforeEach(async function () {
    // loads uncompressed study (the original one)
    const imageId = `${url}${base}`;
    const parsedImageId = parseImageId(imageId);

    configure({
      // callback allowing customization of the xhr (e.g. adding custom auth headers, cors, etc)
      beforeSend(/* xhr, imageId */) {},
      // callback allowing modification of newly created image objects
      imageCreated(/* image */) {},
      strict: false,
      decodeConfig: {},
    });

    const dataSet = await dataSetCacheManager.load(
      parsedImageId.url,
      xhrRequest,
      imageId
    );

    const transferSyntax = dataSet.string('x00020010');

    uncompressedPixelData = getPixelData(dataSet);

    const image = await createImage(
      imageId,
      uncompressedPixelData,
      transferSyntax,
      {}
    );
    uncompressedImage = image;
  }, 5000);

  afterEach(function () {
    dataSetCacheManager.purge();
  });

  Object.keys(transferSyntaxes).forEach((transferSyntaxUid) => {
    const name = transferSyntaxes[transferSyntaxUid];
    const filename = `${base}_${name}_${transferSyntaxUid}.dcm`;

    it(`should properly decode ${name}`, async function () {
      const imageId = `${url}${filename}`;
      const parsedImageId = parseImageId(imageId);
      const dataSetPromise = dataSetCacheManager.load(
        parsedImageId.url,
        xhrRequest,
        imageId
      );

      const dataSet = await dataSetPromise;
      const pixelData = getPixelData(dataSet);
      const curTransferSyntax = dataSet.string('x00020010');

      curTransferSyntax.should.to.be.equals(transferSyntaxUid);

      const image = await createImage(
        imageId,
        pixelData,
        curTransferSyntax,
        {}
      );
      const uncompressedImagePixelData = uncompressedImage.getPixelData();
      const curPixelData = image.getPixelData();

      uncompressedImagePixelData.length.should.to.be.equals(
        curPixelData.length
      );

      for (let i = 0; i < curPixelData.length - 1; i++) {
        if (curPixelData[i] !== uncompressedImagePixelData[i]) {
          curPixelData[i]
            .should(`Pixel data is not equal at position: ${i}`)
            .to.equal(uncompressedImagePixelData[i]);
        }
      }
    }, 5000);
  });
});
