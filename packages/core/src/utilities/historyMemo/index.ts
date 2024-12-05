export type Memo = {
  /**
   * This restores memo state.  It is an undo if undo is true, or a redo if it
   * is false.
   */
  restoreMemo: (undo?: boolean) => void;

  /**
   * An optional function that will be called to commit any changes that have
   * occurred in a memo.  This allows recording changes that are ongoing to a memo
   * and then being able to undo them without having to record the entire state at the
   * time the memo is initially created.  See createLabelmapMemo for an example
   * use.
   *
   * @return true if this memo contains any data, if so it should go on the memo ring
   *    after the commit is completed.
   */
  commitMemo?: () => boolean;
};

/**
 * This is a function which can be implemented to create a memo and then pass
 * the implementing class instead of a new memo itself.
 */
export type Memoable = {
  createMemo: () => Memo;
};

/**
 * historyMemo is a set of history of memos of tool state.  That is, it remembers
 * what has been applied to various images.
 */

export class HistoryMemo {
  public readonly label;

  private _size;
  private position = -1;
  private redoAvailable = 0;
  private undoAvailable = 0;
  private ring = new Array<Memo>();

  constructor(label = 'Tools', size = 50) {
    this.label = label;
    this._size = size;
  }

  /** The number of items that can be stored in the history */
  public get size() {
    return this._size;
  }

  /** Sets the size, clearing all history elements */
  public set size(newSize: number) {
    this.ring = new Array<Memo>(newSize);
    this._size = newSize;
    this.position = -1;
    this.redoAvailable = 0;
    this.undoAvailable = 0;
  }

  /**
   * Undoes up to the given number of items off the ring
   */
  public undo(items = 1) {
    while (items > 0 && this.undoAvailable > 0) {
      const item = this.ring[this.position];
      item.restoreMemo(true);
      items--;
      this.redoAvailable++;
      this.undoAvailable--;
      this.position = (this.position - 1 + this.size) % this.size;
    }
  }

  /**
   * Redoes up to the given number of items, adding them to the top of the ring.
   */
  public redo(items = 1) {
    while (items > 0 && this.redoAvailable > 0) {
      const newPosition = (this.position + 1) % this.size;
      const item = this.ring[newPosition];
      item.restoreMemo(false);
      items--;
      this.position = newPosition;
      this.undoAvailable++;
      this.redoAvailable--;
    }
  }

  /**
   * Pushes a new memo onto the ring.  This will remove all redoable items
   * from the ring if a memo was pushed.  Ignores undefined or null items.
   */
  public push(item: Memo | Memoable) {
    if (!item) {
      // No-op for not provided items
      return;
    }
    const memo = (item as Memo).restoreMemo
      ? (item as Memo)
      : (item as Memoable).createMemo?.();
    if (!memo) {
      return;
    }
    this.redoAvailable = 0;
    if (this.undoAvailable < this._size) {
      this.undoAvailable++;
    }
    this.position = (this.position + 1) % this._size;
    this.ring[this.position] = memo;
    return memo;
  }
}

/**
 * The default HistoryMemo is a shared history state that can be used for
 * any undo/redo memo items.
 */
const DefaultHistoryMemo = new HistoryMemo();

export { DefaultHistoryMemo };
