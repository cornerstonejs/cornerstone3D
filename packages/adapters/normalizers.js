
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes
class Normalizer {
  constructor (datasets) {
    this.datasets = datasets;
  }

  static consistentSOPClass(datasets) {
    // return sopClass if all exist and match, otherwise undefined
    var sopClass;
    datasets.forEach(function(dataset) {
      console.log(dataset);
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
    var sopClass = Normalizer.consistentSOPClass(datasets);
    var normalizerClass = Normalizer.sopClassMap()[sopClass];
    if (!normalizerClass) {
      return(undefined);
    }
    var normalizer = new normalizerClass(datasets);
    return(normalizer.normalize());
  }
}

class ImageNormalizer extends Normalizer {
}

class MRImageNormalizer extends ImageNormalizer {
  normalize() {
    return("MRImageNormalizer");
  }
}

class EnhancedMRImageNormalizer extends ImageNormalizer {
  normalize() {
    if (this.datasets.length != 1) {
      return(undefined);
    }
    return(this.datasets[0]);
  }
}

class CTImageNormalizer extends ImageNormalizer {
  normalize() {
    return("CTImageNormalizer");
  }
}

class PETImageNormalizer extends ImageNormalizer {
  normalize() {
    return("PETImageNormalizer");
  }
}
