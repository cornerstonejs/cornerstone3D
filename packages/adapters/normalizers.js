
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes
class Normalizer {
  constructor (datasets) {
    this.datasets = datasets;
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
    });
  }

  normalize() {
    return("No normalization defined");
  }

  static normalizeToDataset(datasets) {
    let sopClass = Normalizer.consistentSOPClass(datasets);
    let normalizerClass = Normalizer.sopClassMap()[sopClass];
    if (!normalizerClass) {
      return(undefined);
    }
    let normalizer = new normalizerClass(datasets);
    return(normalizer.normalize());
  }
}

class ImageNormalizer extends Normalizer {
  normalize() {
    let dataset = this.datasets[0];
    if (!dataset.PixelRepresentation) {
      // Required tag: guess signed
      dataset.PixelRepresentation = 1;
    }
    if (!dataset.NumberOfFrames) {
      dataset.NumberOfFrames = 1;
    }
    if (!Array.isArray(dataset.WindowCenter)) {
      if (dataset.WindowCenter) {
        // assume both are specified as single string value
        dataset.WindowCenter = [dataset.WindowCenter];
        dataset.WindowWidth = [dataset.WindowWidth];
      } else {
        // pick a probably bad default
        dataset.WindowCenter = ["200"];
        dataset.WindowWidth = ["500"];
      }
    }
    return(dataset);
  }
}

class MRImageNormalizer extends ImageNormalizer {
  normalize() {
    let dataset = super.normalize();
    return(dataset);
  }
}

class EnhancedMRImageNormalizer extends ImageNormalizer {
  normalize() {
    if (this.datasets.length != 1) {
      return(undefined);
    }
    let dataset = this.datasets[0];

    // provide a volume-level window/level estimate
    let wcww = {center: 0, width: 0};
    dataset.PerFrameFunctionalGroups.forEach(function(functionalGroup) {
      wcww.center += Number(functionalGroup.FrameVOILUT.WindowCenter);
      wcww.width += Number(functionalGroup.FrameVOILUT.WindowWidth);
    });
    dataset.WindowCenter = [String(wcww.center / Number(dataset.NumberOfFrames))];
    dataset.WindowWidth = [String(wcww.width / Number(dataset.NumberOfFrames))];

    return(dataset);
  }
}

class CTImageNormalizer extends ImageNormalizer {
  normalize() {
    let dataset = super.normalize();
    return(dataset);
  }
}

class PETImageNormalizer extends ImageNormalizer {
  normalize() {
    return("PETImageNormalizer");
  }
}
