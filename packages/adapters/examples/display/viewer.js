
class Viewer {

  constructor(datasets) {
    this.datasets = datasets;
    this.metaData = {};
    this.element = undefined;

  }

  addElement(parentID) {
    let elementCode = `
    <div class="row">
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
    console.log('requsted', imageId);

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
      image = {
        imageId: imageId,
        minPixelValue: min,
        maxPixelValue: max,
        slope: Number(dataset.RescaleSlope || 1),
        intercept: Number(dataset.RescaleIntercept || 0),
        windowCenter: Number(dataset.WindowCenter[0]),
        windowWidth: Number(dataset.WindowWidth[0]),
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
        console.log('resolving with', image);
        deferred.resolve(image);
      } else {
        deferred.reject({error: 'bad index'});
      }
    },0);

    // return the pending deferred object to cornerstone so it can setup callbacks to be 
    // invoked asynchronously for the success/resolve and failure/reject scenarios.
    console.log(image);
    console.log(deferred);
    return (deferred);
  }

  display(parentID, options) {
    this.addElement(parentID);
    cornerstone.enable(this.element);
    cornerstone.registerImageLoader('dcmjs', this.dcmjsImageLoader.bind(this)); // TODO: add instance #
    cornerstone.metaData.addProvider(this.metaDataProvider);

    var imageIds = [];
    for (let index = 0; index < this.datasets.length; index++) {
      imageIds.push('dcmjs://'+index);
    }
    this. baseStack = {
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

    return;



    //
    // uses cornerstone caching to access a bytearray of the
    // part10 dicom, then uses dcmjs to parse this
    // into javascript object and populates the
    // metadata for the per-frame imageIDs.
    //
    function loadMultiFrameAndPopulateMetadata(baseImageId) {
      var promise = new Promise(function (resolve, reject) {
        var multiframe;
        cornerstone.loadAndCacheImage(baseImageId).then(function(image) {
          var arrayBuffer = image.data.byteArray.buffer;
          dicomData = DCMJS.data.DicomMessage.readFile(arrayBuffer);
          let dataset = DCMJS.data.DicomMetaDictionary.naturalizeDataset(dicomData.dict);
          dataset._meta = DCMJS.data.DicomMetaDictionary.namifyDataset(dicomData.meta);

          multiframe = DCMJS.normalizers.Normalizer.normalizeToDataset([dataset]);

          const numFrames = Number(multiframe.NumberOfFrames);
          for (let i=0; i < numFrames; i++) {
            const imageId = baseImageId + '?frame=' + i;

            var functionalGroup = multiframe.PerFrameFunctionalGroupsSequence[i];
            var imagePositionArray = functionalGroup.PlanePositionSequence.ImagePositionPatient;

            this.addMetaData('imagePlane', imageId, {
              imagePositionPatient: {
                x: imagePositionArray[0],
                y: imagePositionArray[1],
                z: imagePositionArray[2],
              }
            });
          }

          resolve(multiframe);
        });
      });
      return promise;
    }

    //
    // creates an array of per-frame imageIds in the form needed for cornerstone processing.
    // If segmentNumber is provided, then only create imageIds for the frames where the 
    // segment is defined.
    //
    function getImageIds(multiframe, baseImageId, segmentNumber) {
      const imageIds = [];
      const numFrames = Number(multiframe.NumberOfFrames);
      for (let i=0; i < numFrames; i++) {
        let segNum;
        if (multiframe.PerFrameFunctionalGroupsSequence[i].SegmentIdentificationSequence) {
          segNum = multiframe.PerFrameFunctionalGroupsSequence[i].SegmentIdentificationSequence.ReferencedSegmentNumber;
        }

        if ((segmentNumber && segNum && segNum === segmentNumber) ||
            segmentNumber === undefined) {
          const imageId = baseImageId + '?frame=' + i;
          imageIds.push(imageId);
        }
      }
      return imageIds;
    }

    function downloadAndDisplaySampleData() {
      cornerstone.disable(this.element);
      cornerstone.enable(this.element);
      cornerstoneTools.clearToolState(this.element, 'stack');

      const urlRoot = 'https://s3.amazonaws.com/IsomicsPublic/SampleData/rsna2017/seg/task2/'

      const baseImageId = 'dicomweb:' + urlRoot + 'PT-multiframe.dcm';
      var dataPromise = loadMultiFrameAndPopulateMetadata(baseImageId);

      const segBaseImageId = 'dicomweb:' + urlRoot + 'SEG/tumor_User1_Manual_Trial1.dcm';
      var segPromise = loadMultiFrameAndPopulateMetadata(segBaseImageId);

      //
      // once the images have been loaded
      //
      Promise.all([dataPromise, segPromise]).then(values => {
        const multiframe = values[0];
        const segMultiframe = values[1];

        // make the base image layer
        var baseImageIds = getImageIds(multiframe, baseImageId);
        this.baseStack = {
          imageIds: baseImageIds,
          currentImageIdIndex: 0,
          options: {
            name: 'Referenced Image'
          }
        };

        //
        // make the set of layers associated with the segmentations
        //
        const segStacks = [];
        segMultiframe.SegmentSequence.forEach(segment => {
          // first, map the dicom color into a cornerstone colormap
          const cielab = segment.RecommendedDisplayCIELabValue;
          let rgba = DCMJS.data.Colors.dicomlab2RGB(cielab).map(x => x * 255);
          rgba.push(255);
          const colormapId = 'Colormap_' + segment.SegmentNumber;
          var colormap = cornerstone.colors.getColormap(colormapId);
          colormap.setNumberOfColors(2);
          colormap.insertColor(0, [0, 0, 255, 0]);
          colormap.insertColor(1, rgba);
          // define a stack based on the image ids, color, and segment name
          const segImageIds = getImageIds(segMultiframe, segBaseImageId, segment.SegmentNumber);
          const segStack = {
            imageIds: segImageIds,
            currentImageIdIndex: 0,
            options: {
              opacity: 0.7,
              visible: true,
              colormap: colormapId,
              name: segment.SegmentLabel
            }
          };
          segStacks.push(segStack);
        });

        //
        // create a FusionRenderer and provide it with a function
        // to find the closest overlay image based on z position
        //
        var renderer = new cornerstoneTools.stackRenderers.FusionRenderer();
        renderer.findImageFn = function(imageIds, targetImageId) {
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
        // now setup the cornerstone element with out base image
        // and enable the tools we want to have work on it
        //
        cornerstone.loadAndCacheImage(this.baseStack.imageIds[0]).then(function(image) {
          cornerstone.displayImage(this.element, image);

          cornerstoneTools.addStackStateManager(this.element, ['stack']);
          cornerstoneTools.addToolState(this.element, 'stackRenderer', renderer);
          cornerstoneTools.addToolState(this.element, 'stack', this.baseStack);

          segStacks.forEach(segStack => {
            cornerstoneTools.addToolState(this.element, 'stack', segStack);
          });


          cornerstoneTools.mouseInput.enable(this.element);
          cornerstoneTools.mouseWheelInput.enable(this.element);
          cornerstoneTools.keyboardInput.enable(this.element);

          cornerstoneTools.wwwc.activate(this.element, 1);
          //cornerstoneTools.pan.activate(this.element, 2);
          //cornerstoneTools.zoom.activate(this.element, 4);
          cornerstoneTools.stackScrollWheel.activate(this.element);
          cornerstoneTools.stackScrollKeyboard.activate(this.element);

          // Update dropdown size to make all layers name visible
          $('#layers').prop('size', layers.length);

          cornerstoneTools.scrollToIndex(this.element, 51);

          // Listen to `change` event to set the selected layer as active
          $("#layers").change(function(event) {
            var layerId = event.currentTarget.value;
            if (layerId === "") {
              return;
            }

            cornerstone.setActiveLayer(this.element, layerId);
          });

          window.addEventListener('resize', function() {
            cornerstone.resize(this.element, true);
          });
          window.dispatchEvent(new Event('resize'));

        });
      });
    }
  }
}
