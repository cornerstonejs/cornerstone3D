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
  private contextMaxSizes: Map<number, { width: number; height: number }> =
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
    this.viewportToContext.set(viewportId, contextIndex);
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
   * Updates the size of a viewport and recalculates the maximum size for its context
   * @param viewportId - ID of the viewport
   * @param width - New width
   * @param height - New height
   * @returns True if the maximum size for the context changed
   */
  updateViewportSize(
    viewportId: string,
    width: number,
    height: number
  ): boolean {
    const contextIndex = this.viewportToContext.get(viewportId);
    if (contextIndex === undefined) {
      return false;
    }

    // Update viewport size
    this.viewportSizes.set(viewportId, { width, height });

    // Calculate new maximum size for this context
    const previousMax = this.contextMaxSizes.get(contextIndex);
    const newMax = this.calculateMaxSizeForContext(contextIndex);

    // Update the max size
    this.contextMaxSizes.set(contextIndex, newMax);

    // Return whether the max size changed
    return (
      !previousMax ||
      previousMax.width !== newMax.width ||
      previousMax.height !== newMax.height
    );
  }

  /**
   * Gets the maximum size for a given context
   * @param contextIndex - Index of the context
   * @returns Maximum width and height, or default size if no viewports
   */
  getMaxSizeForContext(contextIndex: number): {
    width: number;
    height: number;
  } {
    return (
      this.contextMaxSizes.get(contextIndex) || { width: 512, height: 512 }
    );
  }

  /**
   * Calculates the maximum size needed for a context based on its viewports
   * @param contextIndex - Index of the context
   * @returns Maximum width and height
   */
  private calculateMaxSizeForContext(contextIndex: number): {
    width: number;
    height: number;
  } {
    let maxWidth = 0;
    let maxHeight = 0;

    // Find all viewports assigned to this context
    this.viewportToContext.forEach((assignedContext, viewportId) => {
      if (assignedContext === contextIndex) {
        const size = this.viewportSizes.get(viewportId);
        if (size) {
          maxWidth = Math.max(maxWidth, size.width);
          maxHeight = Math.max(maxHeight, size.height);
        }
      }
    });

    // Return the maximum dimensions (or minimum default if no viewports)
    return {
      width: Math.max(maxWidth, 512),
      height: Math.max(maxHeight, 512),
    };
  }

  /**
   * Removes a viewport from tracking
   * @param viewportId - ID of the viewport to remove
   */
  removeViewport(viewportId: string): void {
    const contextIndex = this.viewportToContext.get(viewportId);
    this.viewportToContext.delete(viewportId);
    this.viewportSizes.delete(viewportId);

    // Recalculate max size for the affected context
    if (contextIndex !== undefined) {
      const newMax = this.calculateMaxSizeForContext(contextIndex);
      this.contextMaxSizes.set(contextIndex, newMax);
    }
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
    this.contextMaxSizes.clear();
  }
}

export default WebGLContextPool;
