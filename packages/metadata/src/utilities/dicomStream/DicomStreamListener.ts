import type { IDicomListener, IListenerInfo } from './DicomStreamTypes';
import { SkipListener } from './SkipListener';
import { MetadataTagListener } from './MetadataTagListener';
import { ObjectListener } from './ObjectListener';

export class DicomStreamListener implements IDicomListener {
  public parent = null;

  public listener: IDicomListener = null;

  constructor(options?) {
    if (options?.createTagListener) {
      this.createTagListener = options.createTagListener;
    }
  }

  /**
   * Creates a new tag listener.  Defaults to creating a metadata tag
   * listener.
   */
  public createTagListener = (tag: string, info?: IListenerInfo) => {
    return new MetadataTagListener(this.listener, tag, info);
  };

  public startObject() {
    this.push(new ObjectListener(this.listener));
  }

  public addTag(tag: string, info?: IListenerInfo) {
    const newListener =
      this.listener?.addTag?.(tag, info) ||
      this.createTagListener(tag, info) ||
      new SkipListener(this.listener);
    this.push(newListener);
  }

  public values(array) {
    if (this.listener.values) {
      this.listener.values(array);
      this.pop();
      return;
    }
    for (const value of array) {
      this.value(value);
    }
    this.pop();
  }

  public value(value) {
    this.listener.value?.(value);
  }

  public push(listener: IDicomListener) {
    listener.parent = this.listener;
    this.listener = listener;
  }

  public pop() {
    const popResult = this.listener.pop?.();
    this.listener = this.listener.parent;
    return popResult;
  }
}
