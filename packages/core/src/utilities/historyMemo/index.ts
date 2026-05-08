import eventTarget from '../../eventTarget';
import { asArray } from '../asArray';

// Define Events from tools package
// Note: We can't directly import from tools package due to circular dependency
const Events = {
  HISTORY_UNDO: 'CORNERSTONE_TOOLS_HISTORY_UNDO',
  HISTORY_REDO: 'CORNERSTONE_TOOLS_HISTORY_REDO',
};

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

  /**
   * Unique identifier for the memo.
   */
  id?: string;

  /**
   * Operation type for the memo. This is used to identify the type of operation
   * when dispatching history events. Examples include 'labelmap', 'annotation', etc.
   */
  operationType?: string;
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
  private ring = new Array<Memo | Memo[]>();
  private isRecordingGrouped = false;

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

  public get canUndo() {
    return this.undoAvailable > 0;
  }

  public get canRedo() {
    return this.redoAvailable > 0;
  }

  /**
   * Undoes up to the given number of items off the ring.
   * If one is a group (array) item it will undo every item inside
   */
  public undo(items = 1) {
    while (items > 0 && this.undoAvailable > 0) {
      const item = this.ring[this.position];

      for (const subitem of asArray(item).reverse()) {
        subitem.restoreMemo(true);
        this.dispatchHistoryEvent({ item: subitem, isUndo: true });
      }

      items--;
      this.redoAvailable++;
      this.undoAvailable--;
      this.position = (this.position - 1 + this.size) % this.size;
    }
  }

  /**
   * Undoes if the condition is met for the current item
   * @param condition - Function that evaluates if the undo should be performed
   * @returns True if an undo was performed, false otherwise
   */
  public undoIf(condition: (item: Memo | Memo[]) => boolean): boolean {
    if (this.undoAvailable > 0 && condition(this.ring[this.position])) {
      this.undo();
      return true;
    }
    return false;
  }

  /**
   * If item has an id, dispatches a undo or redo event.
   * @param args.item memo with id and operation type
   * @param args.isUndo true if it is for undo and false if it is for redo
   */
  private dispatchHistoryEvent({ item, isUndo }) {
    if (item.id) {
      eventTarget.dispatchEvent(
        new CustomEvent(isUndo ? Events.HISTORY_UNDO : Events.HISTORY_REDO, {
          detail: {
            isUndo,
            id: item.id,
            operationType: item.operationType || 'annotation',
            memo: item,
          },
        })
      );
    }
  }

  /**
   * Redoes up to the given number of items, adding them to the top of the ring.
   * If one is a group (array) item it will redo every item inside
   */
  public redo(items = 1) {
    while (items > 0 && this.redoAvailable > 0) {
      const newPosition = (this.position + 1) % this.size;
      const item = this.ring[newPosition];

      for (const subitem of asArray(item).reverse()) {
        subitem.restoreMemo(false);
        this.dispatchHistoryEvent({ item: subitem, isUndo: false });
      }

      items--;
      this.position = newPosition;
      this.undoAvailable++;
      this.redoAvailable--;
    }
  }

  /**  initializes an array for the group item */
  private initializeGroupItem() {
    this.redoAvailable = 0;
    if (this.undoAvailable < this._size) {
      this.undoAvailable++;
    }
    this.position = (this.position + 1) % this._size;
    this.ring[this.position] = [];
  }

  /**
   * Starts a group recording, so that with a single undo you can undo multiple actions that are related to each other.
   * Requires endGroupRecording to be called after the group action is done.
   */
  public startGroupRecording() {
    this.isRecordingGrouped = true;
    this.initializeGroupItem();
  }

  /** Rolls back an initialized but unused group item (an empty array) */
  private rollbackUnusedGroupItem() {
    this.ring[this.position] = undefined;
    this.position = (this.position - 1) % this._size;
    this.undoAvailable--;
  }

  /** Ends a group recording. Must be called after the group action is finished */
  public endGroupRecording() {
    this.isRecordingGrouped = false;

    const lastItem = this.ring[this.position];
    const lastItemIsEmpty = Array.isArray(lastItem) && lastItem.length === 0;

    if (lastItemIsEmpty) {
      this.rollbackUnusedGroupItem();
    }
  }

  /** Add grouped items to the ring. If the current item is not a array, it will generate a new array. Otherwise it will push to the current array */
  private pushGrouped(memo: Memo) {
    const lastMemo = this.ring[this.position];
    if (Array.isArray(lastMemo)) {
      lastMemo.push(memo);
      return memo;
    }

    throw new Error('Last item should be an array for grouped memos.');
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

    if (this.isRecordingGrouped) {
      return this.pushGrouped(memo);
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
