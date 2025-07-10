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
   * Cleans up all contexts and releases resources
   */
  destroy(): void {
    this.contexts.forEach((context: VtkOffscreenMultiRenderWindow) => {
      context.delete();
    });
    this.contexts = [];
    this.offScreenCanvasContainers = [];
    this.viewportToContext.clear();
  }
}

export default WebGLContextPool;
