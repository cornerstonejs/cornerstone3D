import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  showStack,
  showVolume,
} from './utils/planarSeriesBothModes';

const { utilities, Enums } = cornerstone3D;
const { OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/** The ids of the viewports, sorted. */
function idsOf(viewports) {
  return viewports.map(({ id }) => id).sort();
}

describe('utilities.getVolumeViewportsContainingSameVolumes on direct next planar viewports -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    utilities.genericViewportDisplaySetMetadataProvider.clear();
  });

  it('gives the planar viewports that show the same volume in any orientation, the target among them, as the 5.x volume viewports', async function () {
    const series = await createSeries({ id: 'sameVolumesFirst' });
    const other = await createSeries({ id: 'sameVolumesSecond' });
    const axial = createNextViewport(renderingEngine, 'axial');
    const copy = createNextViewport(renderingEngine, 'copy');
    const sagittal = createNextViewport(renderingEngine, 'sagittal');
    const otherVolume = createNextViewport(renderingEngine, 'otherVolume');
    const stack = createNextViewport(renderingEngine, 'stack');

    await showVolume(axial, series, 2);
    await showVolume(copy, series, 4);
    await showVolume(sagittal, series, 0, {
      orientation: OrientationAxis.SAGITTAL,
    });
    await showVolume(otherVolume, other, 2);
    await showStack(stack, series, 2);

    expect(axial.getCurrentMode()).toBe('volume');
    expect(stack.getCurrentMode()).toBe('stack');
    expect(
      idsOf(utilities.getVolumeViewportsContainingSameVolumes(axial))
    ).toEqual(['axial', 'copy', 'sagittal']);
    expect(
      idsOf(
        utilities.getVolumeViewportsContainingSameVolumes(
          sagittal,
          renderingEngineId
        )
      )
    ).toEqual(['axial', 'copy', 'sagittal']);
    expect(
      idsOf(utilities.getVolumeViewportsContainingSameVolumes(otherVolume))
    ).toEqual(['otherVolume']);
  });
});
