/* eslint import/extensions: 0 */
import { expect } from 'chai';
import { getTransferSyntaxForContentType } from '../../../src/imageLoader/wadors/loadImage.js';

describe('#getTransferSyntaxForContentType', function() {
  it('should extract transfer-syntax from content-type, or ILE by default', function() {
    // Test default case for missing or unspecified TS
    expect(getTransferSyntaxForContentType()).to.equal('1.2.840.10008.1.2');
    expect(getTransferSyntaxForContentType(null)).to.equal('1.2.840.10008.1.2');
    expect(getTransferSyntaxForContentType('')).to.equal('1.2.840.10008.1.2');
    expect(
      getTransferSyntaxForContentType(
        'multipart/related; type="application/octet-stream"'
      )
    ).to.equal('1.2.840.10008.1.2');
    expect(
      getTransferSyntaxForContentType(
        'multipart/related; type="application/octet-stream"; transfer-syntax= '
      )
    ).to.equal('1.2.840.10008.1.2');

    // Test TS extraction
    expect(
      getTransferSyntaxForContentType(
        'multipart/related; type=image/dicom+jpeg; transfer-syntax=1.2.840.10008.1.2.4.70'
      )
    ).to.equal('1.2.840.10008.1.2.4.70');
    expect(
      getTransferSyntaxForContentType(
        'multipart/related; image/dicom+jpx; transfer-syntax=1.2.840.10008.1.2.4.93'
      )
    ).to.equal('1.2.840.10008.1.2.4.93');
    expect(
      getTransferSyntaxForContentType(
        'multipart/related; video/mpeg; transfer-syntax=1.2.840.10008.1.2.4.100'
      )
    ).to.equal('1.2.840.10008.1.2.4.100');

    // Test case where transfer-syntax is not explicitly provided
    expect(
      getTransferSyntaxForContentType('multipart/related; type="image/jpeg"')
    ).to.equal('1.2.840.10008.1.2.4.70');
    expect(
      getTransferSyntaxForContentType('multipart/related; type="image/x-jls"')
    ).to.equal('1.2.840.10008.1.2.4.80');
    expect(
      getTransferSyntaxForContentType(
        'multipart/related; type="image/x-dicom-rle"'
      )
    ).to.equal('1.2.840.10008.1.2.5');
    expect(
      getTransferSyntaxForContentType('multipart/related; type="image/jp2"')
    ).to.equal('1.2.840.10008.1.2.4.90');
    expect(
      getTransferSyntaxForContentType('multipart/related; type="image/jpx"')
    ).to.equal('1.2.840.10008.1.2.4.92');
  });
});
