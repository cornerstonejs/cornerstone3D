
(function () {
  var convolveConfig;

  function initialize(config) {
    convolveConfig = config;
  }

  function handler(data, doneCallback) {

    // convert pixel data from ArrayBuffer to Int16Array since web workers support passing ArrayBuffers but
    // not typed arrays
    var imageFrame = data.data.imageFrame;
    var typedArrayConstructor = self[imageFrame.typedArrayName];
    var pixelData = new typedArrayConstructor(data.data.pixelData);

    // get the kernel and calculate the origin
    var kernel = data.data.kernel;
    var multiplier = data.data.multiplier || 1;
    var origin = (kernel.length / 2) - ((kernel.length % 2) / 2);

    function getPixel(x,y) {
      // apply kernel origin
      x -= origin;
      y -= origin;

      // deal with borders by extending
      if(x < 0) {
        x = 0;
      }
      if(x >= imageFrame.width) {
        x = imageFrame.width-1;
      }
      if(y < 0) {
        y = 0;
      }
      if(y >= imageFrame.height) {
        y = imageFrame.height-1;
      }

      return pixelData[x + y * imageFrame.width];
    }

    function getConvolvedPixel(x,y){
      var convolvedPixel = 0;
      for(var i=0; i < kernel.length; i++) {
        for(var j=0; j < kernel[i].length; j++) {
          convolvedPixel += getPixel(x + j, y + i) * kernel[i][j] * multiplier;
        }
      }
      return convolvedPixel;
    }

    // convolve the kernel over the image
    var convolvedPixelData = new typedArrayConstructor(data.data.pixelData.length);
    for(var y=0; y < imageFrame.height; y++) {
      for(var x=0; x < imageFrame.width; x++) {
        var pixel = getConvolvedPixel(x,y);
        // clamp
        pixel = Math.max(Math.min(pixel, 32768), -32767);
        convolvedPixelData[x + y * imageFrame.width] = pixel;
      }
    }

    // once the task is done, we send a message back with our result and pass the pixeldata
    // via the transferList to avoid a copy
    doneCallback({
      pixelData: convolvedPixelData.buffer,
      minMax: cornerstoneWADOImageLoader.getMinMax(convolvedPixelData)
    }, [convolvedPixelData.buffer]);
  }

  // register ourselves to receive messages
  cornerstoneWADOImageLoaderWebWorker.registerTaskHandler({
    taskType :'convolveTask',
    handler: handler  ,
    initialize: initialize
  });

}());

