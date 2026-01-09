import { BaseDicomListener } from './BaseDicomListener';

export class SkipListener extends BaseDicomListener {
  public values(array) {
    console.warn('Skipping array');
  }

  public value(value) {
    console.warn('Skipping value');
  }

  public startObject() {
    return new SkipListener(this.parent);
  }
}
