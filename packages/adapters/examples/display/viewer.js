
class Viewer {

  constructor(datasets) {
    this.datasets = datasets;
    this.metaData = {};
    this.element = undefined;
  }

  addElement(parentID) {
    let elementCode = `
    <div id="cornerstoneContainer" class="row">
        <div class="col-xs-9">
            <div style="width:512px;height:512px;position:relative;display:inline-block;"
                 oncontextmenu="return false"
                 class='cornerstone-enabled-image'
                 unselectable='on'
                 onselectstart='return false;'
                 onmousedown='return false;'>
                <div id="dicomViewer"
                     style="width:512px;height:512px;top:0px;left:0px; position:absolute;">
                </div>
            </div>
    </div>
    `;

    $(parentID).append(elementCode);
    this.element = document.getElementById('dicomViewer');
  }

  removeElement() {
    $('#cornerstoneContainer').remove();
  }

  //
  // cornerstone metadata provides a hook to
  // associate per-frame position with cornerstone imageID
  // so that correct overlay is selected when scrolling
  // through the stack
  //
  metaDataProvider(type, imageId) {
    if (!this.metaData[imageId]) {
      return;
    }
    return this.metaData[imageId][type];
  }

  addMetaData(type, imageId, data) {
    this.metaData[imageId] = this.metaData[imageId] || {};
    this.metaData[imageId][type] = data;
  }

  //
  // make a cornerstone ImageObject from a dataset
  // imageId is dcmjs://# where # is index in this.datasets
  //
  dcmjsImageLoader(imageId) {

    let index = Number(imageId.slice(imageId.lastIndexOf('/')+1));
    let image;
    if (index >= 0 && index < this.datasets.length-1) {
      let dataset = this.datasets[index];
      let pixelData = new Int16Array(dataset.PixelData);
      let [min,max] = [Number.MAX_VALUE, Number.MIN_VALUE];
      for (let pixelIndex = 0; pixelIndex < pixelData.length; pixelIndex++) {
        if (pixelData[pixelIndex] > max) { max = pixelData[pixelIndex]; }
        if (pixelData[pixelIndex] < min) { min = pixelData[pixelIndex]; }
      }
      let [wc,ww] = [dataset.WindowCenter,dataset.WindowWidth];
      if (Array.isArray(wc)) { wc = wc[0]; }
      if (Array.isArray(ww)) { ww = ww[0]; }
      image = {
        imageId: imageId,
        minPixelValue: min,
        maxPixelValue: max,
        slope: Number(dataset.RescaleSlope || 1),
        intercept: Number(dataset.RescaleIntercept || 0),
        windowCenter: Number(wc),
        windowWidth: Number(ww),
        rows: Number(dataset.Rows),
        columns: Number(dataset.Columns),
        height: Number(dataset.Rows),
        width: Number(dataset.Columns),
        columnPixelSpacing: Number(dataset.PixelSpacing[0]),
        rowPixelSpacing: Number(dataset.PixelSpacing[1]),
        invert: false,
        sizeInBytes: pixelData.byteLength,
        getPixelData: function () { return(pixelData); },
      };
    }

    //
    // create a deferred object and resolve it asynchronously
    //
    let deferred = $.Deferred();
    setTimeout(() => { 
      if (image) {
        deferred.resolve(image);
      } else {
        deferred.reject({error: 'bad index'});
      }
    },0);

    // return the pending deferred object to cornerstone so it can setup callbacks to be 
    // invoked asynchronously for the success/resolve and failure/reject scenarios.
    return (deferred);
  }

  display(parentID, options) {
    this.addElement(parentID);
    cornerstone.disable(this.element);
    cornerstone.enable(this.element);
    cornerstone.registerImageLoader('dcmjs', this.dcmjsImageLoader.bind(this)); // TODO: add instance #
    cornerstone.metaData.addProvider(this.metaDataProvider);

    var imageIds = [];
    for (let index = 0; index < this.datasets.length; index++) {
      imageIds.push('dcmjs://'+index);
    }
    this.baseStack = {
      imageIds: imageIds,
      currentImageIdIndex: 0,
      options: {
        name: 'Referenced Image'
      }
    };

    //
    // create a FusionRenderer and provide it with a function
    // to find the closest overlay image based on z position
    //
    this.renderer = new cornerstoneTools.stackRenderers.FusionRenderer();
    this.renderer.findImageFn = function(imageIds, targetImageId) {
      var minDistance = 1;
      var targetImagePlane = cornerstone.metaData.get('imagePlane', targetImageId);
      var imagePositionZ = targetImagePlane.imagePositionPatient.z;
      var closest;
      imageIds.forEach(function(imageId) {
        var imagePlane = cornerstone.metaData.get('imagePlane', imageId);
        var imgPosZ = imagePlane.imagePositionPatient.z;
        var distance = Math.abs(imgPosZ - imagePositionZ);
        if (distance < minDistance) {
          minDistance = distance;
          closest = imageId;
        }
      });
      return closest;
    };

    //
    // request that the first image be loaded and then
    // set up the element to draw with selected tools
    let setupElement = function(image) {
      cornerstone.displayImage(this.element, image);

      cornerstoneTools.addStackStateManager(this.element, ['stack']);
      cornerstoneTools.addToolState(this.element, 'stackRenderer', this.renderer);
      cornerstoneTools.addToolState(this.element, 'stack', this.baseStack);

      cornerstoneTools.mouseInput.enable(this.element);
      cornerstoneTools.mouseWheelInput.enable(this.element);
      cornerstoneTools.keyboardInput.enable(this.element);

      cornerstoneTools.wwwc.activate(this.element, 1);
      cornerstoneTools.pan.activate(this.element, 2);
      cornerstoneTools.zoom.activate(this.element, 4);
      cornerstoneTools.stackScrollWheel.activate(this.element);
      cornerstoneTools.stackScrollKeyboard.activate(this.element);
    };
    cornerstone.loadAndCacheImage(this.baseStack.imageIds[0]).then(setupElement.bind(this));
  }

  set index(newIndex) {
    cornerstoneTools.scrollToIndex(this.element, newIndex);
  }

  get index() {
    let returnValue = 0;
    let stack = cornerstoneTools.getToolState(this.element, 'stack');
    if (stack && stack.data) {
      returnValue = stack.data[0].currentImageIdIndex;
    }
    return (returnValue);
  }
}
