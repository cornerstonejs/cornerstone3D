// currently hard-coded singleton for a page
// * imageloader grabs dcmjs namespace in cornerstone
//
// currently only handles single frame images with segmentation overlay
//

/**
 * Calculate the minimum and maximum values in an Array
 *
 * @param {Number[]} storedPixelData
 * @return {{min: Number, max: Number}}
 */
function getMinMax(storedPixelData) {
  // we always calculate the min max values since they are not always
  // present in DICOM and we don't want to trust them anyway as cornerstone
  // depends on us providing reliable values for these
  let min = Number.MAX_VALUE;
  let max = Number.MIN_VALUE;
  let storedPixel;
  const numPixels = storedPixelData.length;

  for (let index = 1; index < numPixels; index++) {
    storedPixel = storedPixelData[index];
    min = Math.min(min, storedPixel);
    max = Math.max(max, storedPixel);
  }

  return {
    min,
    max
  };
}

/**
 * Converts a float pixel array to a int 8 bit array.
 *
 * @param {Int8Array} floatPixelData
 * @return {{min, max, intPixelData, slope, intercept}}
 */
function convertToInt8PixelData(floatPixelData) {
  const floatMinMax = getMinMax(floatPixelData);
  const floatRange = Math.abs(floatMinMax.max - floatMinMax.min);
  const intRange = 255;
  const slope = floatRange / intRange;
  const intercept = floatMinMax.min;
  const numPixels = floatPixelData.length;
  const intPixelData = new Uint8Array(numPixels);
  let min = 255;
  let max = 0;

  for (let i = 0; i < numPixels; i++) {
    let rescaledPixel = 0;
    if (floatPixelData[i] > 0) {
      rescaledPixel = Math.floor((floatPixelData[i] - intercept) / slope);
    }

    intPixelData[i] = rescaledPixel;
    min = Math.min(min, rescaledPixel);
    max = Math.max(max, rescaledPixel);
  }

  return {
    min,
    max,
    intPixelData,
    slope,
    intercept
  };
}

/**
 * Converts a float pixel array to a int 16 bit array.
 *
 * @param {Int8Array} floatPixelData
 * @return {{min, max, intPixelData, slope, intercept}}
 */
function convertToInt16PixelData(floatPixelData) {
  const floatMinMax = getMinMax(floatPixelData);
  const floatRange = Math.abs(floatMinMax.max - floatMinMax.min);
  const intRange = 65535;
  const slope = floatRange / intRange;
  const intercept = floatMinMax.min;
  const numPixels = floatPixelData.length;
  const intPixelData = new Uint16Array(numPixels);
  let min = 65535;
  let max = 0;

  for (let i = 0; i < numPixels; i++) {
    let rescaledPixel = 0;
    if (floatPixelData[i] > 0) {
      rescaledPixel = Math.floor((floatPixelData[i] - intercept) / slope);
    }

    intPixelData[i] = rescaledPixel;
    min = Math.min(min, rescaledPixel);
    max = Math.max(max, rescaledPixel);
  }

  return {
    min,
    max,
    intPixelData,
    slope,
    intercept
  };
}

class Viewer {
  constructor(datasets, options = {}) {
    this.status = options.status || function() {};
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

  render() {
    // Force the stack renderer to draw
    this.renderer.render(this.element);
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
    let index = Number(imageId.slice(imageId.lastIndexOf("/") + 1));
    let image;
    if (index >= 0 && index < this.datasets.length) {
      let dataset = this.datasets[index];
      // only handle BitsAllocated == 16, signed BitsStored for now
      let pixelData = new Int16Array(dataset.PixelData);
      let [min, max] = [Number.MAX_VALUE, Number.MIN_VALUE];
      for (let pixelIndex = 0; pixelIndex < pixelData.length; pixelIndex++) {
        if (pixelData[pixelIndex] > max) {
          max = pixelData[pixelIndex];
        }
        if (pixelData[pixelIndex] < min) {
          min = pixelData[pixelIndex];
        }
      }
      let [wc, ww] = [dataset.WindowCenter, dataset.WindowWidth];
      if (Array.isArray(wc)) {
        wc = wc[0];
      }
      if (Array.isArray(ww)) {
        ww = ww[0];
      }
      if (wc === undefined || ww === undefined) {
        wc = (max + min) / 2;
        ww = max - min;
      }
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
        getPixelData: function() {
          return pixelData;
        }
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
        deferred.reject({ error: "bad index" });
      }
    }, 0);

    // return the pending deferred object to cornerstone so it can setup callbacks to be
    // invoked asynchronously for the success/resolve and failure/reject scenarios.
    return deferred;
  }

  //
  // make a cornerstone ImageObject from a seg dataset
  // imageId is dcmjsSEG://# where # is index in this.datasets
  //
  dcmjsSEGImageLoader(imageId) {
    let index = Number(imageId.slice(imageId.lastIndexOf("/") + 1));
    let image;
    let dataset = this.segmentationDataset;
    if (
      index >= 0 &&
      index < dataset.PerFrameFunctionalGroupsSequence.length - 1
    ) {
      let sharedGroup = dataset.SharedFunctionalGroupsSequence;
      let pixelSpacing = sharedGroup.PixelMeasuresSequence.PixelSpacing;
      let [rows, columns] = [dataset.Rows, dataset.Columns].map(Number);

      // only handle BitsAllocated, BitsStored == 1 for now
      let packedPixelData = new Uint8Array(dataset.PixelData);
      let bytesPerRow = Math.ceil(rows / 8);
      let pixelData = new Uint8Array(rows * columns);
      let offset = (rows * columns * index) / 8;
      for (let row = 0; row < rows; row++) {
        let packedRowIndex = row * bytesPerRow;
        for (let column = 0; column < columns; column++) {
          let columnByteIndex = Math.floor(column / 8);
          let packedIndex = packedRowIndex + columnByteIndex;
          let columnBitIndex = column % 8;
          let mask = 1 << columnBitIndex;
          let unpackedValue =
            (packedPixelData[packedIndex + offset] & mask) >> columnBitIndex;
          pixelData[row * columns + column] = unpackedValue;
        }
      }

      image = {
        imageId: imageId,
        minPixelValue: 0,
        maxPixelValue: 1,
        rows: rows,
        columns: columns,
        height: rows,
        width: columns,
        columnPixelSpacing: Number(pixelSpacing[0]),
        rowPixelSpacing: Number(pixelSpacing[1]),
        invert: false,
        labelmap: true,
        sizeInBytes: pixelData.byteLength,
        getPixelData: function() {
          return pixelData;
        }
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
        deferred.reject({ error: "bad index" });
      }
    }, 0);

    // return the pending deferred object to cornerstone so it can setup callbacks to be
    // invoked asynchronously for the success/resolve and failure/reject scenarios.
    return deferred;
  }

  /**
   * Loader which treats the given imageId as 8Bit overlay.
   *
   * @param {*} imageId
   */
  dcmjsPMOverlayLoader(imageId) {
    let dataset = this.parametricMapDataset;
    let index = Number(imageId.slice(imageId.lastIndexOf("/") + 1));
    let image;
    if (index >= 0 && index < dataset.NumberOfFrames) {
      let framePixels = dataset.Rows * dataset.Columns;
      let startIndex = dataset.Rows * dataset.Columns * index;
      let endIndex = startIndex + framePixels;
      let pixelData = dataset.PMPixelData.slice(startIndex, endIndex);
      let [min, max] = [255, 0];

      for (let pixelIndex = 0; pixelIndex < pixelData.length; pixelIndex++) {
        let currentValue = pixelData[pixelIndex];
        max = Math.max(max, currentValue);
        min = Math.min(min, currentValue);
      }

      let pixelMeasures =
        dataset.SharedFunctionalGroupsSequence.PixelMeasuresSequence;
      image = {
        imageId: imageId,
        minPixelValue: min,
        maxPixelValue: max,
        rows: Number(dataset.Rows),
        columns: Number(dataset.Columns),
        height: Number(dataset.Rows),
        width: Number(dataset.Columns),
        columnPixelSpacing: Number(pixelMeasures.PixelSpacing[0]),
        rowPixelSpacing: Number(pixelMeasures.PixelSpacing[1]),
        invert: false,
        sizeInBytes: pixelData.byteLength,
        labelmap: true,
        getPixelData: function() {
          return pixelData;
        }
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
        deferred.reject({ error: "bad index" });
      }
    }, 0);

    // return the pending deferred object to cornerstone so it can setup callbacks to be
    // invoked asynchronously for the success/resolve and failure/reject scenarios.
    return deferred;
  }

  /**
   * Loader which treats the given imageId as 16Bit image
   *
   * @param {*} imageId
   */
  dcmjsPMImageLoader(imageId) {
    let dataset = this.parametricMapDataset;
    let index = Number(imageId.slice(imageId.lastIndexOf("/") + 1));
    let image;
    if (index >= 0 && index < dataset.NumberOfFrames) {
      let framePixels = dataset.Rows * dataset.Columns;
      let startIndex = framePixels * index;
      let endIndex = startIndex + framePixels;
      let pixelData = dataset.PMPixelData.slice(startIndex, endIndex);
      let [min, max] = [65535, 0];

      for (let pixelIndex = 0; pixelIndex < pixelData.length; pixelIndex++) {
        let currentValue = pixelData[pixelIndex];
        max = Math.max(max, currentValue);
        min = Math.min(min, currentValue);
      }

      let [wc, ww] = [dataset.WindowCenter, dataset.WindowWidth];
      if (Array.isArray(wc)) {
        wc = wc[0];
      }
      if (Array.isArray(ww)) {
        ww = ww[0];
      }
      if (wc === undefined || ww === undefined) {
        wc = (max + min) / 2;
        ww = max - min;
      }

      let pixelMeasures =
        dataset.SharedFunctionalGroupsSequence.PixelMeasuresSequence;
      image = {
        imageId: imageId,
        minPixelValue: min,
        maxPixelValue: max,
        rows: Number(dataset.Rows),
        columns: Number(dataset.Columns),
        height: Number(dataset.Rows),
        width: Number(dataset.Columns),
        columnPixelSpacing: Number(pixelMeasures.PixelSpacing[0]),
        rowPixelSpacing: Number(pixelMeasures.PixelSpacing[1]),
        invert: false,
        sizeInBytes: pixelData.byteLength,
        labelmap: true,
        getPixelData: function() {
          return pixelData;
        }
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
        deferred.reject({ error: "bad index" });
      }
    }, 0);

    // return the pending deferred object to cornerstone so it can setup callbacks to be
    // invoked asynchronously for the success/resolve and failure/reject scenarios.
    return deferred;
  }

  //
  // make a cornerstone ImageObject from a multiframe dataset
  // imageId is dcmjsMultiframe://# where # is index in this.datasets
  //
  dcmjsMultiframeImageLoader(imageId) {
    let dataset = this.multiframeDataset;
    let index = Number(imageId.slice(imageId.lastIndexOf("/") + 1));
    let image;
    if (index >= 0 && index < dataset.NumberOfFrames) {
      // only handle BitsAllocated == 16, signed BitsStored for now
      let frameBytes = dataset.Rows * dataset.Columns * 2;
      let frameOffset = frameBytes * index;
      let pixelData = new Int16Array(
        dataset.PixelData,
        frameOffset,
        frameBytes
      );
      let [min, max] = [Number.MAX_VALUE, Number.MIN_VALUE];
      for (let pixelIndex = 0; pixelIndex < pixelData.length; pixelIndex++) {
        if (pixelData[pixelIndex] > max) {
          max = pixelData[pixelIndex];
        }
        if (pixelData[pixelIndex] < min) {
          min = pixelData[pixelIndex];
        }
      }
      let [wc, ww] = [dataset.WindowCenter, dataset.WindowWidth];
      if (Array.isArray(wc)) {
        wc = wc[0];
      }
      if (Array.isArray(ww)) {
        ww = ww[0];
      }
      let pixelMeasures =
        dataset.SharedFunctionalGroupsSequence.PixelMeasuresSequence;
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
        columnPixelSpacing: Number(pixelMeasures.PixelSpacing[0]),
        rowPixelSpacing: Number(pixelMeasures.PixelSpacing[1]),
        invert: false,
        sizeInBytes: pixelData.byteLength,
        getPixelData: function() {
          return pixelData;
        }
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
        deferred.reject({ error: "bad index" });
      }
    }, 0);

    // return the pending deferred object to cornerstone so it can setup callbacks to be
    // invoked asynchronously for the success/resolve and failure/reject scenarios.
    return deferred;
  }

  display(parentID, options) {
    this.options = options || {};
    this.addElement(parentID);
    cornerstoneTools.init();
    cornerstone.disable(this.element);
    cornerstone.enable(this.element);
    // TODO: add instance #s to loaders to handle multiple viewers
    cornerstone.registerImageLoader(
      `dcmjs${this.id}`,
      this.dcmjsImageLoader.bind(this)
    );
    cornerstone.registerImageLoader(
      `dcmjsSEG${this.id}`,
      this.dcmjsSEGImageLoader.bind(this)
    );
    cornerstone.registerImageLoader(
      `dcmjsMultiframe${this.id}`,
      this.dcmjsMultiframeImageLoader.bind(this)
    );
    cornerstone.registerImageLoader(
      `dcmjsPM${this.id}`,
      this.dcmjsPMImageLoader.bind(this)
    );
    cornerstone.registerImageLoader(
      `dcmjsPMOverlay${this.id}`,
      this.dcmjsPMOverlayLoader.bind(this)
    );
    cornerstone.metaData.addProvider(this.metaDataProvider.bind(this));

    if (dcmjs.normalizers.Normalizer.isMultiframeDataset(this.datasets[0])) {
      if (options.multiframeIsPM) {
        this.baseStack = this.addParametricMap(this.datasets[0]);
      } else {
        this.baseStack = this.addMultiframe(this.datasets[0]);
      }
    } else {
      this.baseStack = this.addSingleframes(this.datasets);
    }

    //
    // create a FusionRenderer and provide it with a function
    // to find the closest overlay image based on position
    // TODO: this is only an approximation
    //
    this.renderer = new cornerstoneTools.stackRenderers.FusionRenderer();
    this.renderer.findImageFn = function(imageIds, targetImageId) {
      var minDistance = 1;
      var targetImagePlane = cornerstone.metaData.get(
        "imagePlane",
        targetImageId
      );
      var targetImagePosition = targetImagePlane.imagePositionPatient;
      var closest;
      imageIds.forEach(function(imageId) {
        var imagePosition = cornerstone.metaData.get("imagePlane", imageId)
          .imagePositionPatient;
        var distance = Math.sqrt(
          [
            imagePosition.x - targetImagePosition.x,
            imagePosition.y - targetImagePosition.y,
            imagePosition.z - targetImagePosition.z
          ]
            .map(e => e * e)
            .reduce((s, e) => s + e)
        );
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
    //
    let setupElement = function(image) {
      // Add stack renderer and stacks to tool state
      cornerstoneTools.addStackStateManager(this.element, ["stack"]);
      cornerstoneTools.addToolState(
        this.element,
        "stackRenderer",
        this.renderer
      );
      cornerstoneTools.addToolState(this.element, "stack", this.baseStack);

      // (Callback adds the segmentation stacks)
      if (options && options.callback) {
        options.callback();
      }

      // Force the stack renderer to draw
      this.renderer.render(this.element);

      // Enable tools
      // cornerstoneTools.wwwc.activate(this.element, 1);
      // cornerstoneTools.pan.activate(this.element, 2);
      //cornerstoneTools.stackScroll.activate(this.element, 4);
      // cornerstoneTools.zoom.activate(this.element, 4);
      // cornerstoneTools.stackScrollWheel.activate(this.element);
      // cornerstoneTools.stackScrollKeyboard.activate(this.element);

      // touch tools
      // TODO: this may not be ready to work yet
      // cornerstoneTools.touchInput.enable(this.element);
      // cornerstoneTools.zoomTouchPinch.activate(this.element);
      // cornerstoneTools.wwwcTouchDrag.activate(this.element);
      // cornerstoneTools.panMultiTouch.activate(this.element);
    };
    return cornerstone
      .loadAndCacheImage(this.baseStack.imageIds[0])
      .then(setupElement.bind(this));
  }

  addSingleframes(singleframeDatasets) {
    this.datasets = singleframeDatasets;
    var imageIds = [];
    for (let index = 0; index < this.datasets.length; index++) {
      let imageId = `dcmjs${this.id}://` + index;
      imageIds.push(imageId);
      this.addMetaData("imagePlane", imageId, {
        imagePositionPatient: {
          x: Number(this.datasets[index].ImagePositionPatient[0]),
          y: Number(this.datasets[index].ImagePositionPatient[1]),
          z: Number(this.datasets[index].ImagePositionPatient[2])
        }
      });
    }

    // use inverse video to display PT
    let ptClasses = [
      dcmjs.data.DicomMetaDictionary.sopClassUIDsByName.PETImage,
      dcmjs.data.DicomMetaDictionary.sopClassUIDsByName
        .LegacyConvertedEnhancedPETImage,
      dcmjs.data.DicomMetaDictionary.sopClassUIDsByName.EnhancedPETImage
    ];
    let invert = ptClasses.indexOf(this.datasets[0].SOPClassUID) >= 0;

    let stack = {
      imageIds: imageIds,
      currentImageIdIndex: 0,
      options: {
        name: "Referenced Image",
        viewport: {
          invert: invert
        }
      }
    };
    return stack;
  }

  //
  // make the set of stacks associated with segmentation segments
  // and add them to the stack tool
  //
  addMultiframe(multiframeDataset) {
    this.multiframeDataset = multiframeDataset;

    //
    // create stack with an imageId and position metadata
    // for each frame
    //
    let baseImageId = `dcmjsMultiframe${this.id}://`;
    let imageIds = [];
    let frameCount = Number(multiframeDataset.NumberOfFrames);
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      let perFrameGroup =
        multiframeDataset.PerFrameFunctionalGroupsSequence[frameIndex];

      const imageId = baseImageId + frameIndex;
      imageIds.push(imageId);

      let imagePositionPatient = perFrameGroup.PlanePositionSequence.ImagePositionPatient.map(
        Number
      );
      this.addMetaData("imagePlane", imageId, {
        imagePositionPatient: {
          x: imagePositionPatient[0],
          y: imagePositionPatient[1],
          z: imagePositionPatient[2]
        }
      });
    }

    let multiframeStack = {
      imageIds: imageIds,
      currentImageIdIndex: 0,
      options: {
        visible: true,
        name: multiframeDataset.SeriesDescription
      }
    };
    return multiframeStack;

    // then add the stack to cornerstone
    // cornerstoneTools.addToolState(this.element, 'stack', multiframeStack);
  }

  /**
   * Updates the colorbar with the given colormap and the corresponding element id
   * @param {*} colormap
   * @param {*} colorbarId
   */
  updateColorbar(colormap, colorbarId) {
    const lookupTable = colormap.createLookupTable();
    const canvas = document.getElementById(colorbarId);
    const ctx = canvas.getContext("2d");
    const height = canvas.height;
    const width = canvas.width;
    const colorbar = ctx.createImageData(512, 20);

    // Set the min and max values then the lookup table
    // will be able to return the right color for this range
    lookupTable.setTableRange(0, width);

    // Update the colorbar pixel by pixel
    for (let col = 0; col < width; col++) {
      const color = lookupTable.mapValue(col);

      for (let row = 0; row < height; row++) {
        const pixel = (col + row * width) * 4;
        colorbar.data[pixel] = color[0];
        colorbar.data[pixel + 1] = color[1];
        colorbar.data[pixel + 2] = color[2];
        colorbar.data[pixel + 3] = color[3];
      }
    }

    ctx.putImageData(colorbar, 0, 0);
  }

  /**
   * Adds a parametric map object to this viewer instance.
   *
   * @param {dataset} parametricMapDataset the data set which contains a multiframe dicom parametric map object
   */
  addParametricMap(parametricMapDataset, colorbarId) {
    this.parametricMapDataset = parametricMapDataset;

    let framePixels =
      this.parametricMapDataset.Rows *
      this.parametricMapDataset.Columns *
      this.parametricMapDataset.NumberOfFrames;
    let offset = 0;
    let pixelData = new Float32Array(
      this.parametricMapDataset.FloatPixelData[0],
      offset,
      framePixels
    );

    // pixel data conversion from float to int
    let result = convertToInt16PixelData(pixelData);

    // add int pixel data as typed array (!). float is still here with FloatPixelData (array buffer)
    this.parametricMapDataset.PMPixelData = result.intPixelData;

    //colormap stuff
    let colormapId = "myColorMap";
    let colormap = cornerstone.colors.getColormap(colormapId);
    let numberOfColors = 65535;
    colormap.setNumberOfColors(numberOfColors);
    colormap.insertColor(0, [0, 0, 0, 255]);
    for (let i = 1; i <= numberOfColors; i++) {
      var color = (i / numberOfColors) * 255;
      var rgba = [color, color, color, 255];
      colormap.setColor(i, rgba);
    }

    // then we create stack with an imageId and position metadata
    // for each frame that references this segment number
    //
    let baseImageId = `dcmjsPM${this.id}://`;

    let imageIds = [];
    let frameCount = Number(parametricMapDataset.NumberOfFrames);
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      let perFrameGroup =
        parametricMapDataset.PerFrameFunctionalGroupsSequence[frameIndex];

      const imageId = baseImageId + frameIndex;
      imageIds.push(imageId);

      let imagePositionPatient =
        perFrameGroup.PlanePositionSequence.ImagePositionPatient;
      this.addMetaData("imagePlane", imageId, {
        imagePositionPatient: {
          x: imagePositionPatient[0],
          y: imagePositionPatient[1],
          z: imagePositionPatient[2]
        }
      });
    }

    let parametricMapStack = {
      imageIds: imageIds,
      currentImageIdIndex: 0,
      options: {
        opacity: 1.0,
        visible: true,
        name: "parametricMap",
        viewport: {
          pixelReplication: true,
          colormap: colormapId,
          labelmap: true
        }
      }
    };
    // then add the stack to cornerstone
    //cornerstoneTools.addToolState(this.element, 'stack', parametricMapStack);

    if (colorbarId) {
      this.updateColorbar(colormap, colorbarId);
    }

    return parametricMapStack;
  }

  /**
   * Adds a parametric map object as overlay to this viewer instance.
   *
   * @param {dataset} parametricMapDataset the data set which contains a multiframe dicom parametric map object
   */
  addParametricMapOverlay(parametricMapDataset, colorbarId) {
    this.parametricMapDataset = parametricMapDataset;

    let framePixels =
      this.parametricMapDataset.Rows *
      this.parametricMapDataset.Columns *
      this.parametricMapDataset.NumberOfFrames;
    let offset = 0;
    let pixelData = new Float32Array(
      this.parametricMapDataset.FloatPixelData[0],
      offset,
      framePixels
    );

    // pixel data conversion from float to int
    let result = convertToInt8PixelData(pixelData);

    // add int pixel data as typed array (!). float is still here with FloatPixelData (array buffer)
    this.parametricMapDataset.PMPixelData = result.intPixelData;

    //colormap stuff
    let colormapId = "myColorMap";
    let colormap = cornerstone.colors.getColormap(colormapId);
    let numberOfColors = 255;
    colormap.setNumberOfColors(numberOfColors);
    colormap.insertColor(0, [0, 0, 0, 0]);
    for (let i = 1; i < numberOfColors; i++) {
      var red = Math.round((i / Number(numberOfColors)) * 255);
      var rgba = [
        Math.max(red * 1.3, 255),
        Math.max(255 - red * 1.3, 0),
        0,
        255
      ];
      colormap.insertColor(i, rgba);
    }

    // then we create stack with an imageId and position metadata
    // for each frame that references this segment number
    //
    let baseImageId = `dcmjsPMOverlay${this.id}://`;

    let imageIds = [];
    let frameCount = Number(parametricMapDataset.NumberOfFrames);
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      let perFrameGroup =
        parametricMapDataset.PerFrameFunctionalGroupsSequence[frameIndex];

      const imageId = baseImageId + frameIndex;
      imageIds.push(imageId);

      let imagePositionPatient =
        perFrameGroup.PlanePositionSequence.ImagePositionPatient;
      this.addMetaData("imagePlane", imageId, {
        imagePositionPatient: {
          x: imagePositionPatient[0],
          y: imagePositionPatient[1],
          z: imagePositionPatient[2]
        }
      });
    }

    let parametricMapStack = {
      imageIds: imageIds,
      currentImageIdIndex: 0,
      options: {
        opacity: 0.7,
        visible: true,
        name: "parametricMap",
        viewport: {
          pixelReplication: true,
          colormap: colormapId,
          labelmap: true
        }
      }
    };
    // then add the stack to cornerstone
    cornerstoneTools.addToolState(this.element, "stack", parametricMapStack);

    if (colorbarId) {
      this.updateColorbar(colormap, colorbarId);
    }
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
      let rgba = [0, 250, 100, 255];
      if (cielab) {
        rgba = dcmjs.data.Colors.dicomlab2RGB(cielab).map(x => x * 255);
        rgba.push(255);
      }
      const colormapId = "Colormap_" + segment.SegmentNumber;
      let colormap = cornerstone.colors.getColormap(colormapId);
      colormap.setNumberOfColors(2);
      colormap.insertColor(0, [0, 0, 0, 0]);
      colormap.insertColor(1, rgba);

      //
      // then we create stack with an imageId and position metadata
      // for each frame that references this segment number
      //
      let baseImageId = `dcmjsSEG${this.id}://`;
      let imageIds = [];
      let frameCount = Number(segmentationDataset.NumberOfFrames);
      for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
        let perFrameGroup =
          segmentationDataset.PerFrameFunctionalGroupsSequence[frameIndex];
        let referencedSegmentNumber;
        if (perFrameGroup.SegmentIdentificationSequence) {
          referencedSegmentNumber =
            perFrameGroup.SegmentIdentificationSequence.ReferencedSegmentNumber;
        }

        if (referencedSegmentNumber === segment.SegmentNumber) {
          const imageId = baseImageId + frameIndex;
          imageIds.push(imageId);

          let imagePositionPatient = perFrameGroup.PlanePositionSequence.ImagePositionPatient.map(
            Number
          );
          this.addMetaData("imagePlane", imageId, {
            imagePositionPatient: {
              x: imagePositionPatient[0],
              y: imagePositionPatient[1],
              z: imagePositionPatient[2]
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
          name: segment.SegmentLabel,
          viewport: {
            pixelReplication: true,
            colormap: colormapId,
            labelmap: true
          }
        }
      };

      // then add the stack to cornerstone
      cornerstoneTools.addToolState(this.element, "stack", segmentationStack);
    });
  }

  layerVisibility(layerNumber, visibility) {
    const layers = cornerstone.getLayers(this.element);
    const layer = layers[layerNumber];
    layer.options.visible = visibility;
    cornerstone.updateImage(this.element);
  }

  reset() {
    cornerstone.imageCache.purgeCache();
    cornerstoneTools.clearToolState(this.element, "stackRenderer");
    cornerstoneTools.clearToolState(this.element, "stack");

    // mouse tools
    cornerstoneTools.mouseInput.disable(this.element);
    cornerstoneTools.mouseWheelInput.disable(this.element);
    cornerstoneTools.keyboardInput.disable(this.element);

    cornerstoneTools.wwwc.deactivate(this.element, 1);
    cornerstoneTools.pan.deactivate(this.element, 2);
    cornerstoneTools.zoom.deactivate(this.element, 4);
    cornerstoneTools.stackScrollWheel.deactivate(this.element);
    cornerstoneTools.stackScrollKeyboard.deactivate(this.element);

    // Touch tools
    cornerstoneTools.touchInput.enable(this.element);
    cornerstoneTools.zoomTouchPinch.activate(this.element);
    cornerstoneTools.wwwcTouchDrag.activate(this.element);
    cornerstoneTools.panMultiTouch.activate(this.element);
  }

  set index(newIndex) {
    cornerstoneTools.scrollToIndex(this.element, Number(newIndex));
  }

  get index() {
    let returnValue = 0;
    let stack = cornerstoneTools.getToolState(this.element, "stack");
    if (stack && stack.data) {
      returnValue = stack.data[0].currentImageIdIndex;
    }
    return returnValue;
  }
}

Viewer.nextId = 0;
