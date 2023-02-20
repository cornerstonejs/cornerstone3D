import { expect } from 'chai';
import { getTransferSyntaxForContentType } from './loadImage.js';

const cases = [
  // Test default case for missing or unspecified TS
  [undefined, '1.2.840.10008.1.2'],
  [null, '1.2.840.10008.1.2'],
  ['', '1.2.840.10008.1.2'],
  ['multipart/related; type="application/octet-stream"', '1.2.840.10008.1.2'],
  [
    'multipart/related; type="application/octet-stream"; transfer-syntax= ',
    '1.2.840.10008.1.2',
  ],
  // Test TS extraction
  [
    'multipart/related; type=image/dicom+jpeg; transfer-syntax=1.2.840.10008.1.2.4.70',
    '1.2.840.10008.1.2.4.70',
  ],
  [
    'multipart/related; image/dicom+jpx; transfer-syntax=1.2.840.10008.1.2.4.93',
    '1.2.840.10008.1.2.4.93',
  ],
  [
    'multipart/related; video/mpeg; transfer-syntax=1.2.840.10008.1.2.4.100',
    '1.2.840.10008.1.2.4.100',
  ],
  // Test case where transfer-syntax is not explicitly provided
  ['multipart/related; type="image/jpeg"', '1.2.840.10008.1.2.4.50'],
  ['multipart/related; type="image/x-jls"', '1.2.840.10008.1.2.4.80'],
  ['multipart/related; type="image/x-dicom-rle"', '1.2.840.10008.1.2.5'],
  ['multipart/related; type="image/jp2"', '1.2.840.10008.1.2.4.90'],
  ['multipart/related; type="image/jpx"', '1.2.840.10008.1.2.4.92'],
];

describe('#getTransferSyntaxForContentType', function () {
  cases.forEach(function (testCase) {
    const contentType = testCase[0];
    const expectedTransferSyntax = testCase[1];

    it(`given a content type of ${contentType}, should return ${expectedTransferSyntax}`, () => {
      const transferSyntax = getTransferSyntaxForContentType(contentType);

      console.log(transferSyntax);
      console.log(expectedTransferSyntax);

      expect(transferSyntax).to.be.equal(expectedTransferSyntax);
    });
  });
});
