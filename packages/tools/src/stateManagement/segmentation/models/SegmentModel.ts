import type {
  Segment,
  Segmentation,
} from '../../../types/SegmentationStateTypes';
import type { SegmentLabelmapBindingState } from '../../../types/LabelmapTypes';
import { getSegmentBinding } from '../helpers/labelmapSegmentationState';

export default class SegmentModel {
  constructor(
    private readonly segmentation: Segmentation,
    private readonly state: Segment
  ) {}

  get segmentIndex(): number {
    return this.state.segmentIndex;
  }

  get label(): string {
    return this.state.label;
  }

  get binding(): SegmentLabelmapBindingState | undefined {
    return getSegmentBinding(this.segmentation, this.state.segmentIndex);
  }

  toState(): Segment {
    return this.state;
  }
}
