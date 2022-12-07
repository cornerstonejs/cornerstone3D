function isJPEGBaseline8BitColor(imageFrame, transferSyntax) {
  transferSyntax = transferSyntax || imageFrame.transferSyntax;

  if (
    imageFrame.bitsAllocated === 8 &&
    transferSyntax === '1.2.840.10008.1.2.4.50' &&
    (imageFrame.samplesPerPixel === 3 || imageFrame.samplesPerPixel === 4)
  ) {
    return true;
  }
}

export default isJPEGBaseline8BitColor;
