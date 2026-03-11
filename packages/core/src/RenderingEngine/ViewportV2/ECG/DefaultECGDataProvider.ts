import type {
  DataProvider,
  LogicalDataObject,
} from '../ViewportArchitectureTypes';
import type { ECGWaveformPayload } from './ECGViewportV2Types';
import { loadECGWaveform } from '../../../utilities/ECGUtilities';
import { getViewportV2SourceDataId } from '../viewportV2DataSetAccess';

export class DefaultECGDataProvider implements DataProvider {
  async load(dataId: string): Promise<LogicalDataObject> {
    const sourceDataId = getViewportV2SourceDataId(dataId);
    const { waveform, calibration } = await loadECGWaveform(sourceDataId);

    return {
      id: dataId,
      type: 'ecg',
      metadata: {
        calibration,
      },
      payload: waveform as ECGWaveformPayload,
    };
  }
}
