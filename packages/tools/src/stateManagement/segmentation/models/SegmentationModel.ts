import type { Segmentation } from '../../../types/SegmentationStateTypes';
import type { LabelmapLayer } from '../../../types/LabelmapTypes';
import SegmentModel from './SegmentModel';
import {
  ensureLabelmapState,
  getLabelmaps,
  getSegmentBinding,
} from '../helpers/labelmapSegmentationState';

export default class SegmentationModel {
  constructor(private readonly state: Segmentation) {
    ensureLabelmapState(state);
  }

  get segmentationId(): string {
    return this.state.segmentationId;
  }

  get segments(): SegmentModel[] {
    return Object.values(this.state.segments).map(
      (segment) => new SegmentModel(this.state, segment)
    );
  }

  getLabelmaps(): LabelmapLayer[] {
    return getLabelmaps(this.state);
  }

  getBinding(segmentIndex: number) {
    return getSegmentBinding(this.state, segmentIndex);
  }

  toState(): Segmentation {
    return this.state;
  }
}
