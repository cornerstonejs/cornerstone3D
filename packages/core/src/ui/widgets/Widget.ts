import type { WidgetProps, WidgetSize } from './types';

/**
 * Base class for any widget that can be added to cornerstone. Currently it is
 * responsible only for holding the `rootElement`, contains a method that allows
 * adding it to the DOM and it also listens to container's size changes when the
 * widget is already added to the DOM. `dispose` must be called to destroy the
 * widget because it removes the widget from the DOM and stop listening to
 * container changes.
 *
 * You can apply some styles to widgets using the widget id or the `widget` class.
 *
 * Example:
 *   type ColorPickerProps = WidgetProps & {
 *     selectedColor: string;
 *   }
 *
 *   class ColorPicker extends Widget {
 *     constructor(props: ColorPickerProps) {
 *       super(props);
 *       // [code]
 *     }
 *
 *     public show() {
 *       console.log('Show color picker');
 *     }
 *
 *     protected containerResized() {
 *       console.log('New container size: ', this.containerSize);
 *     }
 *   }
 *
 *   const colorPicker = new ColorPicker({
 *     container: document.body,
 *     selectedColor: '#000';
 *   });
 *
 *   // another way to add the color picker to the DOM
 *   colorPicker.appendTo(document.body)
 *
 *   // Show color picker
 *   colorPicker.show();
 */
abstract class Widget {
  private _id: string;
  private _rootElement: HTMLElement;
  private _containerSize: WidgetSize;
  private _containerResizeObserver: ResizeObserver;

  constructor({ id, container }: WidgetProps) {
    this._id = id;
    this._containerSize = { width: 0, height: 0 };
    this._rootElement = this.createRootElement(id);
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

  /**
   * Widget's root element
   */
  public get rootElement(): HTMLElement {
    return this._rootElement;
  }

  /**
   * Append the widget to a parent element
   * @param container - HTML element where the widget should be added to
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

  /**
   * Removes the widget from the DOM and stop listening to DOM events
   */
  public destroy() {
    const {
      _rootElement: rootElement,
      _containerResizeObserver: resizeObserver,
    } = this;
    const { parentElement } = rootElement;

    parentElement?.removeChild(rootElement);
    resizeObserver.disconnect();
  }

  protected get containerSize(): WidgetSize {
    // Returns a copy to prevent any external change
    return { ...this._containerSize };
  }

  /**
   * Creates the root element which is a div by default
   * @param id - Root element id
   * @returns A new HTML element where all other elements should be added to
   */
  protected createRootElement(id: string): HTMLElement {
    const rootElement = document.createElement('div');

    rootElement.id = id;
    rootElement.classList.add('widget');

    Object.assign(rootElement.style, {
      width: '100%',
      height: '100%',
    });

    return rootElement;
  }

  /**
   * Method called every time widget's container is resize giving the
   * opportunity to children classes to act when that happens.
   */
  protected onContainerResize() {
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
    this.onContainerResize();
  };
}

export { Widget as default, Widget };
