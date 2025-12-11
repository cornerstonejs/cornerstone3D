import type { IDicomListener } from './DicomStreamTypes';

export class BaseDicomListener implements IDicomListener {
  public parent: IDicomListener;

  constructor(parent: IDicomListener) {
    this.parent = parent;
  }
}
