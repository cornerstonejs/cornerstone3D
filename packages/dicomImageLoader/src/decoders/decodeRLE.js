/**
 */
(function (cornerstoneWADOImageLoader) {

  function decodeRLE(imageFrame, pixelData) {

    if(imageFrame.bitsAllocated === 8) {
      return decode8(imageFrame, pixelData);
    } else if( imageFrame.bitsAllocated === 16) {
      return decode16(imageFrame, pixelData);
    } else {
      throw 'unsupported pixel format for RLE'
    }
  }

  function decode8(imageFrame, pixelData ) {
    var frameData = pixelData;
    var frameSize = imageFrame.rows * imageFrame.columns;
    var outFrame = new ArrayBuffer(frameSize*imageFrame.samplesPerPixel);
    var header=new DataView(frameData.buffer, frameData.byteOffset);
    var data=new DataView( frameData.buffer, frameData.byteOffset );
    var out=new DataView( outFrame );

    var outIndex=0;
    var numSegments = header.getInt32(0,true);
    for( var s=0 ; s < numSegments ; ++s ) {
      outIndex = s;

      var inIndex=header.getInt32( (s+1)*4,true);
      var maxIndex=header.getInt32( (s+2)*4,true);
      if( maxIndex===0 )
        maxIndex = frameData.length;

      var endOfSegment = frameSize * numSegments;

      while( inIndex < maxIndex ) {
        var n=data.getInt8(inIndex++);
        if( n >=0 && n <=127 ) {
          // copy n bytes
          for( var i=0 ; i < n+1 && outIndex < endOfSegment; ++i ) {
            out.setInt8(outIndex, data.getInt8(inIndex++));
            outIndex+=imageFrame.samplesPerPixel;
          }
        } else if( n<= -1 && n>=-127 ) {
          var value=data.getInt8(inIndex++);
          // run of n bytes
          for( var j=0 ; j < -n+1 && outIndex < endOfSegment; ++j ) {
            out.setInt8(outIndex, value );
            outIndex+=imageFrame.samplesPerPixel;
          }
        } else if (n===-128)
          ; // do nothing
      }
    }
    imageFrame.pixelData = new Uint8Array(outFrame);
    return imageFrame;
  }

  function decode16( imageFrame, pixelData ) {
    var frameData = pixelData;
    var frameSize = imageFrame.rows * imageFrame.columns;
    var outFrame = new ArrayBuffer(frameSize*imageFrame.samplesPerPixel*2);

    var header=new DataView(frameData.buffer, frameData.byteOffset);
    var data=new DataView( frameData.buffer, frameData.byteOffset );
    var out=new DataView( outFrame );

    var numSegments = header.getInt32(0,true);
    for( var s=0 ; s < numSegments ; ++s ) {
      var outIndex=0;
      var highByte=( s===0 ? 1 : 0);

      var inIndex=header.getInt32( (s+1)*4,true);
      var maxIndex=header.getInt32( (s+2)*4,true);
      if( maxIndex===0 )
        maxIndex = frameData.length;

      while( inIndex < maxIndex ) {
        var n=data.getInt8(inIndex++);
        if( n >=0 && n <=127 ) {
          for( var i=0 ; i < n+1 && outIndex < frameSize ; ++i ) {
            out.setInt8( (outIndex*2)+highByte, data.getInt8(inIndex++) );
            outIndex++;
          }
        } else if( n<= -1 && n>=-127 ) {
          var value=data.getInt8(inIndex++);
          for( var j=0 ; j < -n+1 && outIndex < frameSize ; ++j ) {
            out.setInt8( (outIndex*2)+highByte, value );
            outIndex++;
          }
        } else if (n===-128)
          ; // do nothing
      }
    }
    if(imageFrame.pixelRepresentation === 0) {
      imageFrame.pixelData = new Uint16Array(outFrame);
    } else {
      imageFrame.pixelData = new Int16Array(outFrame);
    }
    return imageFrame;
  }

  // module exports
  cornerstoneWADOImageLoader.decodeRLE = decodeRLE;

}(cornerstoneWADOImageLoader));