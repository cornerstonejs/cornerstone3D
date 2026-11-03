import { getDefaultVolumeVOIRange } from '../src/RenderingEngine/helpers/setDefaultVolumeVOI';
import * as metaData from '../src/metaData';
import { MetadataModules } from '../src/enums';

describe('getDefaultVolumeVOIRange from the VOI LUT module', () => {
  let voiLutModule;
  const provider = (type) =>
    type === MetadataModules.VOI_LUT ? voiLutModule : undefined;
  const imageVolume = { imageIds: ['wadors:image-0'], metadata: {} };

  beforeAll(() => metaData.addProvider(provider, 10000));
  afterAll(() => metaData.removeProvider(provider));

  // The providers give VOILUTFunction as a string; other metadata gives an array.
  it('applies the VOI LUT function of the metadata', async () => {
    for (const voiLUTFunction of ['LINEAR_EXACT', ['LINEAR_EXACT']]) {
      voiLutModule = { windowWidth: [400], windowCenter: [40], voiLUTFunction };
      expect(await getDefaultVolumeVOIRange(imageVolume)).toEqual({
        lower: -160,
        upper: 240,
      });
    }
  });

  it('uses LINEAR for an unknown VOI LUT function', async () => {
    voiLutModule = {
      windowWidth: [400],
      windowCenter: [40],
      voiLUTFunction: 'UNKNOWN',
    };
    expect(await getDefaultVolumeVOIRange(imageVolume)).toEqual({
      lower: -160,
      upper: 239,
    });
  });
});
