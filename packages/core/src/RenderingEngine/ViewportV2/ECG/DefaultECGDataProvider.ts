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
    const { waveform } = await loadECGWaveform(sourceDataId);

    return {
      type: 'ecg',
      payload: waveform as ECGWaveformPayload,
    };
  }
}
