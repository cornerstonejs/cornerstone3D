/**
 */
(function (cornerstoneWADOImageLoader) {

  function swap16(val) {
    return ((val & 0xFF) << 8)
      | ((val >> 8) & 0xFF);
  }


  function decodeBigEndian(imageFrame) {
    if(imageFrame.bitsAllocated === 8) {
      return imageFrame;
    }
    else if(imageFrame.bitsAllocated === 16) {
      for(var i=0; i < imageFrame.pixelData.length; i++) {
        imageFrame[i] = swap16(imageFrame.pixelData[i]);
      }
      return imageFrame;
    }
    throw 'unsupported bits allocated for big endian transfer syntax';
  }

  // module exports
  cornerstoneWADOImageLoader.decodeBigEndian = decodeBigEndian;

}(cornerstoneWADOImageLoader));