import { BaseDicomListener } from './BaseDicomListener';

export class ObjectListener extends BaseDicomListener {
  public dest = null;

  public addTag(_tag, _info) {
    this.dest ||= {};
  }

  public pop() {
    this.parent?.value?.(this.dest);
    return this.dest;
  }
}
