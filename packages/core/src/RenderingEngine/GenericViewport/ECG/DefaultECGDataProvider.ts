import type { DataProvider, LoadedData } from '../ViewportArchitectureTypes';
import type { ECGWaveformPayload } from './ECGViewportTypes';
import { loadECGWaveform } from './ecgWaveform';
import { getGenericViewportSourceDataId } from '../genericViewportDisplaySetAccess';

export class DefaultECGDataProvider implements DataProvider {
  async load(
    dataId: string,
    options?: { multiplexGroupIndex?: number }
  ): Promise<LoadedData<ECGWaveformPayload>> {
    const sourceDataId = getGenericViewportSourceDataId(dataId);
    const { waveform } = await loadECGWaveform(sourceDataId, {
      multiplexGroupIndex: options?.multiplexGroupIndex,
    });

    return {
      id: dataId,
      type: 'ecg',
      ...(waveform as ECGWaveformPayload),
    };
  }
}
