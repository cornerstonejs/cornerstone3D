type BucketNode<T> = {
  value: T;
  next: BucketNode<T>;
};

/**
 * Circular Bucket Queue.
 *
 * Returns input'd points in sorted order. All operations run in roughly O(1)
 * time (for input with small cost values), but it has a strict requirement:
 *
 * If the most recent point had a cost of c, any points added should have a cost
 * c' in the range c <= c' <= c + (capacity - 1).
 */
export class BucketQueue<T> {
  private _bucketCount: number;
  private _mask: number;
  private _size: number;
  private _currentBucketIndex: number;
  private _getPriority: (item: T) => number;
  private _areEqual: (itemA: T, itemB: T) => boolean;
  private _buckets: BucketNode<T>[];

  /**
   * @param bits - Number of bits.
   * @param getPriority - A function that returns the priority of an item
   */
  constructor({
    numBits,
    getPriority,
    areEqual,
  }: {
    numBits: number;
    getPriority?: (item: T) => number;
    areEqual?: (itemA: T, itemB: T) => boolean;
  }) {
    this._bucketCount = 1 << numBits; // # of buckets = 2^numBits
    this._mask = this._bucketCount - 1; // 2^numBits - 1 = index mask
    this._size = 0;
    this._currentBucketIndex = 0;
    this._buckets = this._buildArray(this._bucketCount);

    this._getPriority =
      typeof getPriority !== 'undefined'
        ? getPriority
        : (item) => item as unknown as number;

    this._areEqual =
      typeof areEqual === 'function'
        ? areEqual
        : (itemA, itemB) => itemA === itemB;
  }

  /**
   * Prepend item to the list in the appropriate bucket
   * @param item - Item to be added to the queue based on its priority
   */
  public push(item: T) {
    const bucketIndex = this._getBucketIndex(item);
    const oldHead = this._buckets[bucketIndex];
    const newHead: BucketNode<T> = {
      value: item,
      next: oldHead,
    };

    this._buckets[bucketIndex] = newHead;
    this._size++;
  }

  public pop(): T {
    if (this._size === 0) {
      throw new Error('Cannot pop because the queue is empty.');
    }

    // Find first empty bucket
    while (this._buckets[this._currentBucketIndex] === null) {
      this._currentBucketIndex =
        (this._currentBucketIndex + 1) % this._bucketCount;
    }

    // All items in bucket have same cost, return the first one
    const ret = this._buckets[this._currentBucketIndex];

    this._buckets[this._currentBucketIndex] = ret.next;
    this._size--;

    return ret.value;
  }

  /**
   * Tries to remove item from queue.
   * @param item - Item to be removed from the queue
   * @returns True if the item is found and removed or false otherwise
   */
  public remove(item: T): boolean {
    if (!item) {
      return false;
    }

    // To find node, go to bucket and search through unsorted list.
    const bucketIndex = this._getBucketIndex(item);
    const firstBucketNode = this._buckets[bucketIndex];
    let node = firstBucketNode;
    let prevNode: BucketNode<T>;

    while (node !== null) {
      if (this._areEqual(item, node.value)) {
        break;
      }

      prevNode = node;
      node = node.next;
    }

    // Item not found
    if (node === null) {
      return false;
    }

    // Item found and it needs to be removed from the list
    if (node === firstBucketNode) {
      this._buckets[bucketIndex] = node.next;
    } else {
      prevNode.next = node.next;
    }

    this._size--;
    return true;
  }

  public isEmpty(): boolean {
    return this._size === 0;
  }

  /**
   * Return the bucket index
   * @param item - Item for which the bucket shall be returned
   * @returns Bucket index for the item provided
   */
  private _getBucketIndex(item): number {
    return this._getPriority(item) & this._mask;
  }

  /**
   * Create array and initialze pointers to null
   * @param size - Size of the new array
   * @returns An array with `N` buckets pointing to null
   */
  private _buildArray(size) {
    const buckets = new Array(size);
    buckets.fill(null);
    return buckets;
  }
}
