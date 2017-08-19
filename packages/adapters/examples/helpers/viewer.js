// currently hard-coded singleton for a page
// * cornerstoneContainer used as an id
// * imageloader grabs dcmjs namespace in cornerstone
//
// currently only handles single frame iamges with segmentation overlay
//
class Viewer {

  constructor(datasets, options={}) {
    this.datasets = datasets;
    this.metaData = {};
    this.element = undefined;

    this.id = Viewer.nextId;
    Viewer.nextId += 1;

    this.width = options.width || 512;
    this.height = options.height || 512;
  }

  geometryString() {
    return `width:${this.width}px;height:${this.height}px`;
  }

  addElement(parentID) {
    let elementCode = `
    <div id="cornerstoneContainer${this.id}" class="row">
        <div class="col-xs-9">
            <div style="${this.geometryString()};position:relative;display:inline-block;"
                 oncontextmenu="return false"
                 class='cornerstone-enabled-image'
                 unselectable='on'
                 onselectstart='return false;'
                 onmousedown='return false;'>
                <div id="dicomViewer${this.id}"
                     style="${this.geometryString()};top:0px;left:0px;position:absolute;">
                </div>
            </div>
    </div>
    `;

    $(parentID).append(elementCode);
    this.element = document.getElementById(`dicomViewer${this.id}`);
  }

  removeElement() {
    $(`#cornerstoneContainer${this.id}`).remove();
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
    console.log('looking for ', imageId);
    let index = Number(imageId.slice(imageId.lastIndexOf('/')+1));
    let image;
    if (index >= 0 && index < this.datasets.length-1) {
      let dataset = this.datasets[index];
      // only handle BitsAllocated == 16, signed BitsStored for now
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

  //
  // make a cornerstone ImageObject from a seg dataset
  // imageId is dcmjsSEG://# where # is index in this.datasets
  //
  dcmjsSEGImageLoader(imageId) {
console.log('looking for ', imageId);
let coords = [];
    let index = Number(imageId.slice(imageId.lastIndexOf('/')+1));
    let image;
    let dataset = this.segmentationDataset;
    if (index >= 0 && index < dataset.PerFrameFunctionalGroupsSequence.length-1) {
      let sharedGroup = dataset.SharedFunctionalGroupsSequence;
      let pixelSpacing = sharedGroup.PixelMeasuresSequence.PixelSpacing;
      let [rows, columns] = [dataset.Rows, dataset.Columns].map(Number);

      // only handle BitsAllocated, BitsStored == 1 for now
      let packedPixelData = new Uint8Array(dataset.PixelData);
      let bytesPerRow = Math.ceil(rows/8);
      let pixelData = new Int8Array(rows*columns);
      for (let row = 0; row < rows; row++) {
        let packedRowIndex = row * bytesPerRow;
        for (let column = 0; column < columns; column++) {
          let columnByteIndex = Math.floor(column/8);
          let packedIndex = packedRowIndex + columnByteIndex;
          let columnBitIndex = column%8;
          let mask = 1 << columnBitIndex;
          let unpackedValue = (packedPixelData[packedIndex] & mask) >> columnBitIndex;
          pixelData[row*columns+column] = unpackedValue;
if (unpackedValue != 0) {
  coords.push([row,column, unpackedValue]);
}
        }
      }

/*
for (let row = 0; row < rows; row++) {
  for (let column = 0; column < columns; column++) {
    if ((row + column + index) % 5 == 0) {
      pixelData[row*columns+column] = 100;
    }
  }
}
*/

      image = {
        imageId: imageId,
        minPixelValue: 0,
        maxPixelValue: 1,
        windowCenter: 128,
        windowWidth: 255,
        rows: rows,
        columns: columns,
        height: rows,
        width: columns,
        columnPixelSpacing: Number(pixelSpacing[0]),
        rowPixelSpacing: Number(pixelSpacing[1]),
        invert: false,
        sizeInBytes: pixelData.byteLength,
        getPixelData: function () { return(pixelData); },
      };
/*
console.log(coords);
var canvas = document.getElementById('debugImage');
var ctx = canvas.getContext('2d');
var imageData = ctx.createImageData(columns, rows);
imageData.data.set(pixelData); // copy here
ctx.putImageData(imageData, 0, 0);
*/

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
    cornerstone.registerImageLoader('dcmjsSEG', this.dcmjsSEGImageLoader.bind(this)); // TODO: add instance #
    cornerstone.metaData.addProvider(this.metaDataProvider.bind(this));

    var imageIds = [];
    for (let index = 0; index < this.datasets.length; index++) {
      let imageId = 'dcmjs://'+index;
      imageIds.push(imageId);
      this.addMetaData('imagePlane', imageId, {
        imagePositionPatient: {
          x: this.datasets[index].ImagePositionPatient[0],
          y: this.datasets[index].ImagePositionPatient[1],
          z: this.datasets[index].ImagePositionPatient[2],
        }
      });
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

  //
  // make the set of stacks associated with segmentation segments
  // and add them to the stack tool
  //
  addSegmentation(segmentationDataset) {
    this.segmentationDataset = segmentationDataset;
    let segmentSequence = this.segmentationDataset.SegmentSequence;
    if (!Array.isArray(segmentSequence)) {
      segmentSequence = [segmentSequence];
    }
    segmentSequence.forEach(segment => {
      //
      // first, map the dicom color into a cornerstone colormap
      //
      const cielab = segment.RecommendedDisplayCIELabValue;
      let rgba = DCMJS.data.Colors.dicomlab2RGB(cielab).map(x => x * 255);
      rgba.push(255);
      const colormapId = 'Colormap_' + segment.SegmentNumber;
      let colormap = cornerstone.colors.getColormap(colormapId);
      colormap.setNumberOfColors(2);
      colormap.insertColor(0, [0, 0, 255, 0]);
      colormap.insertColor(1, rgba);
      //
      // then we create stack with an imageId and position metadata
      // for each frame that references this segment number
      //
      let baseImageId = 'dcmjsSEG://';
      let imageIds = [];
      let frameCount = Number(segmentationDataset.NumberOfFrames);
      for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
        let perFrameGroup = segmentationDataset.PerFrameFunctionalGroupsSequence[frameIndex];
        let referencedSegmentNumber;
        if (perFrameGroup.SegmentIdentificationSequence) {
          referencedSegmentNumber = perFrameGroup.SegmentIdentificationSequence.ReferencedSegmentNumber;
        }
        if (referencedSegmentNumber === segment.SegmentNumber) {
          const imageId = baseImageId + frameIndex;
          imageIds.push(imageId);
          let imagePositionPatient = perFrameGroup.PlanePositionSequence.ImagePositionPatient;
          this.addMetaData('imagePlane', imageId, {
            imagePositionPatient: {
              x: imagePositionPatient[0],
              y: imagePositionPatient[1],
              z: imagePositionPatient[2],
            }
          });
        }
      }
      let segmentationStack = {
        imageIds: imageIds,
        currentImageIdIndex: 0,
        options: {
          opacity: 0.7,
          visible: true,
          colormap: colormapId,
          name: segment.SegmentLabel
        }
      }
      // then add the stack to cornerstone
      console.log(segmentationStack);
      cornerstoneTools.addToolState(this.element, 'stack', segmentationStack);
    });
  }

  reset() {
    cornerstone.imageCache.purgeCache();
    cornerstoneTools.clearToolState(this.element, 'stackRenderer');
    cornerstoneTools.clearToolState(this.element, 'stack');

    cornerstoneTools.mouseInput.disable(this.element);
    cornerstoneTools.mouseWheelInput.disable(this.element);
    cornerstoneTools.keyboardInput.disable(this.element);

    cornerstoneTools.wwwc.deactivate(this.element, 1);
    cornerstoneTools.pan.deactivate(this.element, 2);
    cornerstoneTools.zoom.deactivate(this.element, 4);
    cornerstoneTools.stackScrollWheel.deactivate(this.element);
    cornerstoneTools.stackScrollKeyboard.deactivate(this.element);
  }

  set index(newIndex) {
    cornerstoneTools.scrollToIndex(this.element, Number(newIndex));
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

Viewer.nextId = 0;
