export type WidgetProps = {
  id: string;
  container?: HTMLElement;
};

type WidgetSize = {
  width: number;
  height: number;
};

class Widget {
  private _id: string;
  private _rootElement: HTMLElement;
  private _containerSize: WidgetSize;
  private _containerResizeObserver: ResizeObserver;

  constructor({ id, container }: WidgetProps) {
    this._id = id;
    this._containerSize = { width: 0, height: 0 };
    this._rootElement = this.createRootElement();
    this._containerResizeObserver = new ResizeObserver(
      this._containerResizeCallback
    );

    if (container) {
      this.appendTo(container);
    }
  }

  /**
   * Widget id
   */
  public get id() {
    return this._id;
  }

  public get rootElement(): HTMLElement {
    return this._rootElement;
  }

  protected createRootElement(): HTMLElement {
    const rootElement = document.createElement('div');

    Object.assign(rootElement.style, {
      width: '100%',
      height: '100%',
    });

    return rootElement;
  }

  /**
   * Append the color bar node to a parent element and re-renders the color bar
   * @param container - HTML element where the color bar will be added to
   */
  public appendTo(container: HTMLElement) {
    const {
      _rootElement: rootElement,
      _containerResizeObserver: resizeObserver,
    } = this;
    const { parentElement: currentContainer } = rootElement;

    if (!container || container === currentContainer) {
      return;
    }

    if (currentContainer) {
      resizeObserver.unobserve(currentContainer);
    }

    container.appendChild(rootElement);
    resizeObserver.observe(container);
  }

  protected get containerSize(): WidgetSize {
    // Returns a copy to prevent any external change
    return { ...this._containerSize };
  }

  /**
   * Method called every time widget's container is resize giving the
   * opportunity to children classes to act when that happens.
   */
  protected containerResized() {
    // no-op
  }

  private _containerResizeCallback = (entries: ResizeObserverEntry[]): void => {
    let width;
    let height;

    const { contentRect, contentBoxSize } = entries[0];

    // `contentRect` is better supported than `borderBoxSize` or `contentBoxSize`,
    // but it is left over from an earlier implementation of the Resize Observer API
    // and may be deprecated in future versions.
    // https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserverEntry/contentRect
    if (contentRect) {
      width = contentRect.width;
      height = contentRect.height;
    } else if (contentBoxSize?.length) {
      width = contentBoxSize[0].inlineSize;
      height = contentBoxSize[0].blockSize;
    }

    this._containerSize = { width, height };
    this.containerResized();
  };

  /**
   * Removes the widget from the DOM and stop listening to DOM events
   */
  public dispose() {
    const {
      _rootElement: rootElement,
      _containerResizeObserver: resizeObserver,
    } = this;
    const { parentElement } = rootElement;

    parentElement?.removeChild(rootElement);
    resizeObserver.disconnect();
  }
}

export { Widget as default, Widget };
