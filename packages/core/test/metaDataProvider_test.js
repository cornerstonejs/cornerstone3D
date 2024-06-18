import * as cornerstone3D from '../src/index.js';

// import { User } from ... doesn't work right now since we don't have named exports set up
const { metaData } = cornerstone3D;

// First metaData provider for scheme : provider1
const metadataProvider1 = (type, imageId) => {
  if (type === 'imagePixelModule') {
    return {
      pixelRepresentation: 1,
    };
  } else if (type === 'generalSeriesModule') {
    return {
      modality: '1',
    };
  } else if (type === 'imagePlaneModule') {
    return {
      imageOrientationPatient: [1, 1, 1],
      pixelSpacing: [1, 1],
      rows: 1,
      columns: 1,
    };
  } else if (type === 'voiLutModule') {
    return {
      windowWidth: [1],
      windowCenter: [1],
    };
  } else if (type === 'modalityLutModule') {
    return {
      rescaleSlope: 1,
      rescaleIntercept: 1,
    };
  }
};

// Second metaData provider for scheme : provider1
const metadataProvider2 = (type, imageId) => {
  if (type === 'imagePixelModule') {
    return {
      pixelRepresentation: 2,
    };
  } else if (type === 'generalSeriesModule') {
    return {
      modality: '2',
    };
  } else if (type === 'imagePlaneModule') {
    return {
      imageOrientationPatient: [2, 2, 2],
      pixelSpacing: [2, 2],
      rows: 2,
      columns: 2,
    };
  } else if (type === 'voiLutModule') {
    return {
      windowWidth: [2],
      windowCenter: [2],
    };
  } else if (type === 'modalityLutModule') {
    return {
      rescaleSlope: 2,
      rescaleIntercept: 2,
    };
  }
};

describe('metaData Provider', function () {
  beforeEach(() => {
    metaData.removeAllProviders();
  });

  it('addProvider: can add provider to the list of providers', () => {
    //
    metaData.addProvider(metadataProvider1);
    const result = metaData.get('modalityLutModule', 'imageId');
    expect(result.rescaleSlope).toBe(1);
  });

  it('addProvider with priority: can add another provider with different priority', () => {
    //
    metaData.addProvider(metadataProvider1);
    metaData.addProvider(metadataProvider2, 100);
    const result = metaData.get('modalityLutModule', 'imageId');
    expect(result.rescaleSlope).toBe(2);
  });

  it('addProvider correct priority: can put the provider at correct spot wrt priorities', () => {
    //
    metaData.addProvider(metadataProvider1);
    metaData.addProvider(metadataProvider2, 100);
    metaData.addProvider(metadataProvider1, 1000);

    const result = metaData.get('modalityLutModule', 'imageId');
    expect(result.rescaleSlope).toBe(1);
  });

  it('removeProvider: can remove provider after adding it', () => {
    metaData.addProvider(metadataProvider1);
    let result = metaData.get('modalityLutModule', 'imageId');
    expect(result.rescaleSlope).toBe(1);
    metaData.removeProvider(metadataProvider1);
    result = metaData.get('modalityLutModule', 'imageId');
    expect(result).toBe(undefined);
  });

  it('removeAllProviders: can remove all providers', () => {
    metaData.addProvider(metadataProvider1);
    metaData.addProvider(metadataProvider2);

    metaData.removeAllProviders();
    const result = metaData.get('modalityLutModule', 'imageId');
    expect(result).toBe(undefined);
  });
});
