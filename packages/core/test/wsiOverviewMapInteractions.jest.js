import { configureWSIOverviewMap } from '../src/utilities/WSIUtilities';

class OverviewView extends EventTarget {
  constructor(options) {
    super();
    this.options = options;
  }

  getProjection() {
    return this.options.projection;
  }
  getRotation() {
    return this.options.rotation;
  }
  getMinResolution() {
    return this.options.minResolution;
  }
  getMaxResolution() {
    return this.options.maxResolution;
  }
  on(type, handler) {
    this.addEventListener(type, handler);
  }
  un(type, handler) {
    this.removeEventListener(type, handler);
  }
}

function createOverviewMap() {
  let view = new OverviewView({
    projection: { getExtent: () => [0, 0, 1000, 4000] },
    rotation: 0,
    minResolution: 10,
    maxResolution: 10,
  });
  let size;
  const map = new EventTarget();
  return Object.assign(map, {
    getView: () => view,
    getSize: () => size,
    setSize: (nextSize) => {
      size = nextSize;
      map.dispatchEvent(new Event('change:size'));
    },
    setView: jest.fn((nextView) => {
      view = nextView;
      map.dispatchEvent(new Event('change:view'));
    }),
    on: (type, handler) => map.addEventListener(type, handler),
    un: (type, handler) => map.removeEventListener(type, handler),
  });
}

describe('configureWSIOverviewMap', () => {
  it('restores state, isolates control events, pans while dragging, and cleans up listeners', () => {
    const parent = document.createElement('div');
    const controlContainer = document.createElement('div');
    const controlElement = document.createElement('div');
    const overviewMapElement = document.createElement('div');
    const magnificationBox = document.createElement('div');
    const parentPointerDown = jest.fn();
    const parentPointerMove = jest.fn();
    const parentPointerUp = jest.fn();
    const parentPointerCancel = jest.fn();
    const setCenter = jest.fn();
    const getEventCoordinate = jest.fn(() => [12, 34]);
    let collapsed = false;
    const overviewMap = createOverviewMap();
    overviewMap.getEventCoordinate = getEventCoordinate;
    const nativeBoxPointerDown = jest.fn();
    magnificationBox.addEventListener('pointerdown', nativeBoxPointerDown);

    overviewMapElement.className = 'ol-overviewmap-map';
    magnificationBox.className = 'ol-overviewmap-box';
    overviewMapElement.appendChild(magnificationBox);
    controlElement.appendChild(overviewMapElement);
    controlContainer.appendChild(controlElement);
    parent.appendChild(controlContainer);
    parent.addEventListener('pointerdown', parentPointerDown);
    parent.addEventListener('pointermove', parentPointerMove);
    parent.addEventListener('pointerup', parentPointerUp);
    parent.addEventListener('pointercancel', parentPointerCancel);
    document.body.appendChild(parent);

    const interaction = configureWSIOverviewMap(
      {
        getControls: () => ({
          getArray: () => [
            {
              element: controlElement,
              getCollapsed: () => collapsed,
              getOverviewMap: () => overviewMap,
              setCollapsed: (value) => {
                collapsed = value;
              },
            },
          ],
        }),
        getOverlayContainerStopEvent: () => controlContainer,
        getOwnerDocument: () => document,
        getView: () => ({ setCenter }),
      },
      true
    );

    expect(interaction.getCollapsed()).toBe(true);

    magnificationBox.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true })
    );
    magnificationBox.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true })
    );

    expect(parentPointerDown).not.toHaveBeenCalled();
    expect(nativeBoxPointerDown).not.toHaveBeenCalled();
    expect(parentPointerMove).not.toHaveBeenCalled();
    expect(getEventCoordinate).toHaveBeenCalledTimes(1);
    expect(setCenter).toHaveBeenCalledWith([12, 34]);

    magnificationBox.dispatchEvent(
      new MouseEvent('pointerup', { bubbles: true })
    );
    magnificationBox.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true })
    );

    expect(parentPointerUp).not.toHaveBeenCalled();
    expect(parentPointerMove).not.toHaveBeenCalled();
    expect(setCenter).toHaveBeenCalledTimes(1);

    magnificationBox.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true })
    );
    magnificationBox.dispatchEvent(
      new MouseEvent('pointercancel', { bubbles: true })
    );
    document.dispatchEvent(new MouseEvent('pointermove'));

    expect(parentPointerCancel).not.toHaveBeenCalled();
    expect(setCenter).toHaveBeenCalledTimes(1);

    magnificationBox.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true })
    );
    interaction.cleanup();
    document.dispatchEvent(new MouseEvent('pointermove'));
    controlContainer.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true })
    );
    controlContainer.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true })
    );
    controlContainer.dispatchEvent(
      new MouseEvent('pointerup', { bubbles: true })
    );
    controlContainer.dispatchEvent(
      new MouseEvent('pointercancel', { bubbles: true })
    );

    expect(setCenter).toHaveBeenCalledTimes(1);
    expect(parentPointerDown).toHaveBeenCalledTimes(1);
    expect(parentPointerMove).toHaveBeenCalledTimes(1);
    expect(parentPointerUp).toHaveBeenCalledTimes(1);
    expect(parentPointerCancel).toHaveBeenCalledTimes(1);

    parent.remove();
  });
  it('fits the full slide after resizing, rotation, and view replacement, then removes listeners', () => {
    const overviewMap = createOverviewMap();
    const interaction = configureWSIOverviewMap({
      getControls: () => ({
        getArray: () => [{ getOverviewMap: () => overviewMap }],
      }),
    });
    expect(overviewMap.setView).not.toHaveBeenCalled();
    overviewMap.setSize([0, 0]);
    expect(overviewMap.setView).not.toHaveBeenCalled();

    overviewMap.setSize([200, 100]);
    expect(overviewMap.getView().options).toMatchObject({
      center: [500, 2000],
      resolution: 40,
      minResolution: 40,
      maxResolution: 40,
    });
    expect(overviewMap.setView).toHaveBeenCalledTimes(1);

    overviewMap.setSize([200, 400]);
    expect(overviewMap.getView().options.resolution).toBe(10);
    expect(overviewMap.setView).toHaveBeenCalledTimes(2);
    overviewMap.setSize([200, 400]);
    expect(overviewMap.setView).toHaveBeenCalledTimes(2);

    const oldView = overviewMap.getView();
    oldView.options.rotation = Math.PI / 2;
    oldView.dispatchEvent(new Event('change:rotation'));
    expect(overviewMap.getView().options.resolution).toBeCloseTo(20);
    expect(overviewMap.setView).toHaveBeenCalledTimes(3);
    oldView.dispatchEvent(new Event('change:rotation'));
    expect(overviewMap.setView).toHaveBeenCalledTimes(3);

    overviewMap.setView(
      new OverviewView({
        projection: { getExtent: () => [0, 0, 6000, 1000] },
        rotation: Math.PI / 4,
        minResolution: 1,
        maxResolution: 1,
      })
    );
    expect(overviewMap.getView().options.resolution).toBeCloseTo(24.748737);
    expect(overviewMap.setView).toHaveBeenCalledTimes(5);

    interaction.cleanup();
    overviewMap.setSize([50, 50]);
    overviewMap.getView().dispatchEvent(new Event('change:rotation'));
    expect(overviewMap.setView).toHaveBeenCalledTimes(5);
    overviewMap.setView(new OverviewView({}));
    expect(overviewMap.setView).toHaveBeenCalledTimes(6);
  });

  it('does not refit its own replacement view even when resolution constraints differ', () => {
    const overviewMap = createOverviewMap();
    overviewMap.setSize([200, 100]);
    const getMinResolution = jest
      .spyOn(OverviewView.prototype, 'getMinResolution')
      .mockReturnValue(0);
    const interaction = configureWSIOverviewMap({
      getControls: () => ({
        getArray: () => [{ getOverviewMap: () => overviewMap }],
      }),
    });
    expect(overviewMap.setView).toHaveBeenCalledTimes(1);
    expect(overviewMap.getView().options.resolution).toBe(40);
    interaction.cleanup();
    getMinResolution.mockRestore();
  });
});
