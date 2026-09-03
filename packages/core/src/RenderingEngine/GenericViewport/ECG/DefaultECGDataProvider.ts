import type { DataProvider, LoadedData } from '../ViewportArchitectureTypes';
import type { ECGWaveformPayload } from './ECGViewportTypes';
import { loadECGWaveform } from '../../../utilities/ECGUtilities';
import { getGenericViewportSourceDataId } from '../genericViewportDisplaySetAccess';

export class DefaultECGDataProvider implements DataProvider {
  async load(dataId: string): Promise<LoadedData<ECGWaveformPayload>> {
    const sourceDataId = getGenericViewportSourceDataId(dataId);
    const { waveform } = await loadECGWaveform(sourceDataId);

    return {
      id: dataId,
      type: 'ecg',
      ...(waveform as ECGWaveformPayload),
    };
  }
}
