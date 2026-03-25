import type { DataProvider, LoadedData } from '../ViewportArchitectureTypes';
import type { ECGWaveformPayload } from './ECGViewportNextTypes';
import { loadECGWaveform } from '../../../utilities/ECGUtilities';
import { getViewportNextSourceDataId } from '../viewportNextDataSetAccess';

export class DefaultECGDataProvider implements DataProvider {
  async load(dataId: string): Promise<LoadedData<ECGWaveformPayload>> {
    const sourceDataId = getViewportNextSourceDataId(dataId);
    const { waveform } = await loadECGWaveform(sourceDataId);

    return {
      id: dataId,
      type: 'ecg',
      ...(waveform as ECGWaveformPayload),
    };
  }
}
