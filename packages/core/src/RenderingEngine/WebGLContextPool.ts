import { vtkOffscreenMultiRenderWindow } from './vtkClasses';
import type { VtkOffscreenMultiRenderWindow } from '../types';

/**
 * Manages a pool of WebGL contexts for parallel rendering.
 * Enables us distribute viewports across multiple contexts
 * for improved performance.
 */
class WebGLContextPool {
  private contexts: VtkOffscreenMultiRenderWindow[] = [];
  private offScreenCanvasContainers: HTMLDivElement[] = [];
  private viewportToContext: Map<string, number> = new Map();
  private viewportSizes: Map<string, { width: number; height: number }> =
    new Map();
  private contextSizeGroups: Map<number, { width: number; height: number }[]> =
    new Map();

  /**
   * Creates a pool with the specified number of WebGL contexts
   * @param count - Number of contexts to create
   */
  constructor(count: number) {
    for (let i = 0; i < count; i++) {
      const offscreenMultiRenderWindow =
        vtkOffscreenMultiRenderWindow.newInstance();
      const container = document.createElement('div');
      offscreenMultiRenderWindow.setContainer(container);

      this.contexts.push(offscreenMultiRenderWindow);
      this.offScreenCanvasContainers.push(container);
    }
  }

  /**
   * Gets the context and container at the specified index
   * @param index - Context index
   * @returns Context and container, or null if index is invalid
   */
  getContextByIndex(index: number): {
    context: VtkOffscreenMultiRenderWindow;
    container: HTMLDivElement;
  } | null {
    if (index >= 0 && index < this.contexts.length) {
      return {
        context: this.contexts[index],
        container: this.offScreenCanvasContainers[index],
      };
    }
    return null;
  }

  /**
   * Associates a viewport with a specific context index
   * @param viewportId - ID of the viewport
   * @param contextIndex - Index of the context to assign
   */
  assignViewportToContext(viewportId: string, contextIndex: number): void {
    const oldContext = this.viewportToContext.get(viewportId);
    if (oldContext !== undefined && oldContext !== contextIndex) {
      this.removeViewportSizeFromContext(viewportId, oldContext);
    }

    this.viewportToContext.set(viewportId, contextIndex);

    const size = this.viewportSizes.get(viewportId);
    if (size) {
      this.addViewportSizeToContext(size, contextIndex);
    }
  }

  /**
   * Updates the tracked size for a viewport
   * @param viewportId - ID of the viewport
   * @param width - Width of the viewport
   * @param height - Height of the viewport
   */
  updateViewportSize(viewportId: string, width: number, height: number): void {
    const oldSize = this.viewportSizes.get(viewportId);
    const contextIndex = this.viewportToContext.get(viewportId);

    if (oldSize && contextIndex !== undefined) {
      this.removeViewportSizeFromContext(viewportId, contextIndex);
    }

    this.viewportSizes.set(viewportId, { width, height });

    if (contextIndex !== undefined) {
      this.addViewportSizeToContext({ width, height }, contextIndex);
    }
  }

  /**
   * Finds the best context index for a viewport based on size similarity
   * @param width - Width of the viewport
   * @param height - Height of the viewport
   * @returns Best context index for the given size
   */
  findBestContextForSize(width: number, height: number): number {
    const tolerance = 50;
    let bestContext = 0;
    let minSizeDifference = Infinity;
    let leastLoadedContext = 0;
    let minViewportCount = Infinity;

    for (let i = 0; i < this.contexts.length; i++) {
      const contextSizes = this.contextSizeGroups.get(i) || [];

      if (contextSizes.length < minViewportCount) {
        minViewportCount = contextSizes.length;
        leastLoadedContext = i;
      }

      for (const size of contextSizes) {
        const widthDiff = Math.abs(size.width - width);
        const heightDiff = Math.abs(size.height - height);
        const totalDiff = widthDiff + heightDiff;

        if (widthDiff <= tolerance && heightDiff <= tolerance) {
          return i;
        }

        if (totalDiff < minSizeDifference) {
          minSizeDifference = totalDiff;
          bestContext = i;
        }
      }
    }

    if (minSizeDifference > tolerance * 4) {
      return leastLoadedContext;
    }

    return bestContext;
  }

  /**
   * Adds a viewport size to context tracking
   * @param size - Size to add
   * @param contextIndex - Context index
   */
  private addViewportSizeToContext(
    size: { width: number; height: number },
    contextIndex: number
  ): void {
    if (!this.contextSizeGroups.has(contextIndex)) {
      this.contextSizeGroups.set(contextIndex, []);
    }

    const sizes = this.contextSizeGroups.get(contextIndex);

    const exists = sizes.some(
      (s) => s.width === size.width && s.height === size.height
    );
    if (!exists) {
      sizes.push({ ...size });
    }
  }

  /**
   * Removes a viewport size from context tracking
   * @param viewportId - ID of the viewport
   * @param contextIndex - Context index
   */
  private removeViewportSizeFromContext(
    viewportId: string,
    contextIndex: number
  ): void {
    const size = this.viewportSizes.get(viewportId);
    if (!size) {
      return;
    }

    const sizes = this.contextSizeGroups.get(contextIndex);
    if (!sizes) {
      return;
    }

    let hasOtherWithSameSize = false;
    for (const [id, vSize] of this.viewportSizes.entries()) {
      if (
        id !== viewportId &&
        this.viewportToContext.get(id) === contextIndex &&
        vSize.width === size.width &&
        vSize.height === size.height
      ) {
        hasOtherWithSameSize = true;
        break;
      }
    }

    if (!hasOtherWithSameSize) {
      const index = sizes.findIndex(
        (s) => s.width === size.width && s.height === size.height
      );
      if (index !== -1) {
        sizes.splice(index, 1);
      }
    }
  }

  /**
   * Gets the context index assigned to a viewport
   * @param viewportId - ID of the viewport
   * @returns Context index, or undefined if not assigned
   */
  getContextIndexForViewport(viewportId: string): number | undefined {
    return this.viewportToContext.get(viewportId);
  }

  /**
   * Gets all contexts in the pool
   * @returns Array of all contexts
   */
  getAllContexts(): VtkOffscreenMultiRenderWindow[] {
    return this.contexts;
  }

  /**
   * Gets the number of contexts in the pool
   * @returns Number of contexts
   */
  getContextCount(): number {
    return this.contexts.length;
  }

  /**
   * Cleans up all contexts and releases resources
   */
  destroy(): void {
    this.contexts.forEach((context: VtkOffscreenMultiRenderWindow) => {
      context.delete();
    });
    this.contexts = [];
    this.offScreenCanvasContainers = [];
    this.viewportToContext.clear();
    this.viewportSizes.clear();
    this.contextSizeGroups.clear();
  }
}

export default WebGLContextPool;
