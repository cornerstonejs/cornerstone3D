/**
 */
(function (cornerstoneWADOImageLoader) {

  function decodeRLE(dataSet, frame) {
    var height = dataSet.uint16('x00280010');
    var width = dataSet.uint16('x00280011');
    var samplesPerPixel = dataSet.uint16('x00280002');
    var pixelDataElement = dataSet.elements.x7fe00010;

    var frameData = dicomParser.readEncapsulatedPixelData(dataSet, pixelDataElement, frame);
    var pixelFormat = cornerstoneWADOImageLoader.getPixelFormat(dataSet);


    var frameSize = width*height;
    var buffer;
    if( pixelFormat===1 ) {
      buffer = new ArrayBuffer(frameSize*samplesPerPixel);
      decode8( frameData, buffer, frameSize);
      return new Uint8Array(buffer);
    } else if( pixelFormat===2 ) {
      buffer = new ArrayBuffer(frameSize*samplesPerPixel*2);
      decode16( frameData, buffer, frameSize );
      return new Uint16Array(buffer);
    } else if( pixelFormat===3 ) {
      buffer = new ArrayBuffer(frameSize*samplesPerPixel*2);
      decode16( frameData, buffer, frameSize );
      return new Int16Array(buffer);
    }
  }

  function decode8( frameData, outFrame, frameSize ) {
    var header=new DataView(frameData.buffer, frameData.byteOffset);
    var data=new DataView( frameData.buffer, frameData.byteOffset );
    var out=new DataView( outFrame );

    var outIndex=0;
    var numSegments = header.getInt32(0,true);
    for( var s=0 ; s < numSegments ; ++s ) {
      outIndex = s * frameSize;

      var inIndex=header.getInt32( (s+1)*4,true);
      var maxIndex=header.getInt32( (s+2)*4,true);
      if( maxIndex===0 )
        maxIndex = frameData.length;

      var endOfSegment = frameSize * numSegments;

      while( inIndex < maxIndex ) {
        var n=data.getInt8(inIndex++);
        if( n >=0 && n <=127 ) {
          for( var i=0 ; i < n+1 && outIndex < endOfSegment; ++i ) {
            out.setInt8(outIndex++, data.getInt8(inIndex++));
          }
        } else if( n<= -1 && n>=-127 ) {
          var value=data.getInt8(inIndex++);
          for( var j=0 ; j < -n+1 && outIndex < endOfSegment; ++j ) {
            out.setInt8(outIndex++, value );
          }
        } else if (n===-128)
          ; // do nothing
      }
    }
  }

  function decode16( frameData, outFrame, frameSize ) {
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
  }

  // module exports
  cornerstoneWADOImageLoader.decodeRLE = decodeRLE;

}(cornerstoneWADOImageLoader));