
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes
class Normalizer {
  constructor (datasets) {
    this.datasets = datasets; // one or more dicom-like object instances
    this.dataset = undefined; // a normalized multiframe dicom object instance
  }

  static consistentSOPClass(datasets) {
    // return sopClass if all exist and match, otherwise undefined
    let sopClass;
    datasets.forEach(function(dataset) {
      if (!dataset.SOPClass) {
        return(undefined);
      }
      if (!sopClass) {
       sopClass = dataset.SOPClass;
      }
      if (dataset.SOPClass != sopClass) {
        console.log('inconsistent sopClasses: ', dataset.SOPClass, sopClass);
        return(undefined);
      }
    });
    return(sopClass);
  }

  static sopClassMap() {
    return ({
      "CTImage" : CTImageNormalizer,
      "MRImage" : MRImageNormalizer,
      "EnhancedMRImage" : EnhancedMRImageNormalizer,
      "PETImage" : PETImageNormalizer,
      "Segmentation" : SEGImageNormalizer,
    });
  }

  static isMultiframe(ds=this.dataset) {
    return ([
      "EnhancedMRImage",
      "EnhancedCTImage",
      "EnhancedUSImage",
      "EnhancedPETImage",
      "Segmentation",
    ].indexOf(ds.SOPClass) != -1);
  }

  normalize() {
    return("No normalization defined");
  }

  static normalizeToDataset(datasets) {
    let sopClass = Normalizer.consistentSOPClass(datasets);
    let normalizerClass = Normalizer.sopClassMap()[sopClass];
    if (!normalizerClass) {
      console.log('no normalizerClass for ', sopClass);
      return(undefined);
    }
    let normalizer = new normalizerClass(datasets);
    normalizer.normalize();
    return(normalizer.dataset);
  }
}

class ImageNormalizer extends Normalizer {
  normalize() {
    this.normalizeToMultiframe();
    this.normalizeMultiframe();
  }

  normalizeToMultiframe() {
    if (this.datasets.length == 1 && Normalizer.isMultiframe(this.datasets[0])) {
      // already a multiframe, so just pass use it
      this.dataset = this.datasets[0];
      return;
    }
    this.dataset = {};
    let ds = this.dataset;
    // create a new multiframe from the source datasets
    // fill in only those elements required to make a valid image
    // for volumetric processing
    let referenceDataset = this.datasets[0];
    ds.NumberOfFrames = this.datasets.length;

    // TODO: develop sets of elements to copy over in loops
    ds.SOPClass = referenceDataset.SOPClass;
    ds.Rows = referenceDataset.Rows;
    ds.Columns = referenceDataset.Columns;
    ds.BitsAllocated = referenceDataset.BitsAllocated;
    ds.PixelRepresentation = referenceDataset.PixelRepresentation;

    // sort
    // https://github.com/pieper/Slicer3/blob/master/Base/GUI/Tcl/LoadVolume.tcl
    // TODO: add spacing checks:
    // https://github.com/Slicer/Slicer/blob/master/Modules/Scripted/DICOMPlugins/DICOMScalarVolumePlugin.py#L228-L250
    // TODO: develop PixelToPatient and PatientToPixel transforms
    let referencePosition = vec3.create();
    referencePosition.set(referenceDataset.ImagePositionPatient);
    let rowVector = vec3.create();
    rowVector.set(referenceDataset.ImageOrientationPatient.slice(0,3));
    let columnVector = vec3.create();
    columnVector.set(referenceDataset.ImageOrientationPatient.slice(3,6));
    let scanAxis = vec3.create();
    vec3.cross(scanAxis,rowVector,columnVector);
    let distanceDatasetPairs = [];
    this.datasets.forEach(function(dataset) {
      let position = vec3.create();
      position.set(dataset.ImagePositionPatient);
      let positionVector = vec3.create();
      vec3.subtract(positionVector, position, referencePosition);
      let distance = vec3.dot(positionVector, scanAxis);
      distanceDatasetPairs.push([distance, dataset]);
    });
    distanceDatasetPairs.sort(function(a,b) {
      return (b[0]-a[0]);
    });

    // assign array buffers
    if (ds.BitsAllocated != 16) {
      alert('Only works with 16 bit data, not ' + String(dataset.BitsAllocated));
    }
    let frameSize = referenceDataset.PixelData.byteLength;
    ds.PixelData = new ArrayBuffer(ds.NumberOfFrames * frameSize);
    let frame = 0;
    distanceDatasetPairs.forEach(function(pair) {
      let [distance, dataset] = pair;
      let pixels = new Uint16Array(dataset.PixelData);
      let frameView = new Uint16Array(ds.PixelData, frame * frameSize, frameSize/2);
      frameView.set(pixels);
      frame++;
    });
  }

  normalizeMultiframe() {
    let ds = this.dataset;
    if (!ds.NumberOfFrames) {
      ds.NumberOfFrames = 1;
    }
    if (!ds.PixelRepresentation) {
      // Required tag: guess signed
      ds.PixelRepresentation = 1;
    }

    if (ds.WindowCenter && ds.WindowWidth) {
      // if they exist as single values, make them lists for consistency
      if (!Array.isArray(ds.WindowCenter)) {
        ds.WindowCenter = [ds.WindowCenter];
      }
      if (!Array.isArray(ds.WindowWidth)) {
        ds.WindowWidth = [ds.WindowWidth];
      }
    }
    if (!ds.WindowCenter || !ds.WindowWidth) {
      // if they don't exist, make them empty lists and try to initialize them
      ds.WindowCenter = []; // both must exist and be the same length
      ds.WindowWidth = [];
      // provide a volume-level window/level guess (mean of per-frame)
      if (ds.PerFrameFunctionalGroups) {
        let wcww = {center: 0, width: 0, count: 0};
        ds.PerFrameFunctionalGroups.forEach(function(functionalGroup) {
          if (functionalGroup.FrameVOILUT &&
              functionalGroup.FrameVOILUT.WindowCenter &&
              functionalGroup.FrameVOILUT.WindowWidth) {
            wcww.center += Number(functionalGroup.FrameVOILUT.WindowCenter);
            wcww.width += Number(functionalGroup.FrameVOILUT.WindowWidth);
            wcww.count++;
          }
        });
        if (wcww.count > 0) {
          ds.WindowCenter.push(String(wcww.center / wcww.count));
          ds.WindowWidth.push(String(wcww.width / wcww.count));
        }
      }
    }
    // last gasp, pick an arbitrary default
    if (ds.WindowCenter.length == 0) { ds.WindowCenter = [300] }
    if (ds.WindowWidth.length == 0) { ds.WindowWidth = [500] }
  }
}

class MRImageNormalizer extends ImageNormalizer {
  normalize() {
    super.normalize();
  }
}

class EnhancedMRImageNormalizer extends ImageNormalizer {
  normalize() {
    super.normalize();
  }
}

class CTImageNormalizer extends ImageNormalizer {
  normalize() {
    super.normalize();
  }
}

class PETImageNormalizer extends ImageNormalizer {
  normalize() {
    super.normalize();
  }
}

class SEGImageNormalizer extends ImageNormalizer {
  normalize() {
    super.normalize();
  }
}
