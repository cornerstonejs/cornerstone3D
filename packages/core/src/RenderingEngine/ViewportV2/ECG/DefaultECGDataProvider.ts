import type {
  DataProvider,
  LogicalDataObject,
} from '../ViewportArchitectureTypes';
import type { ECGWaveformPayload } from './ECGViewportV2Types';
import { loadECGWaveform } from '../../../utilities/ECGUtilities';

export class DefaultECGDataProvider implements DataProvider {
  private cache = new Map<string, LogicalDataObject>();

  async load(dataId: string): Promise<LogicalDataObject> {
    const cached = this.cache.get(dataId);

    if (cached) {
      return cached;
    }

    const { waveform, calibration } = await loadECGWaveform(dataId);

    const logicalDataObject: LogicalDataObject<ECGWaveformPayload> = {
      id: dataId,
      role: 'signal',
      kind: 'signal',
      metadata: {
        calibration,
      },
      payload: waveform as ECGWaveformPayload,
    };

    this.cache.set(dataId, logicalDataObject);
    return logicalDataObject;
  }
}
