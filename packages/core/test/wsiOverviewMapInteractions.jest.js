import { configureWSIOverviewMap } from '../src/utilities/WSIUtilities';

describe('configureWSIOverviewMap', () => {
  it('restores state, isolates control events, pans while dragging, and cleans up listeners', () => {
    const parent = document.createElement('div');
    const controlContainer = document.createElement('div');
    const controlElement = document.createElement('div');
    const overviewMapElement = document.createElement('div');
    const magnificationBox = document.createElement('div');
    const parentPointerDown = jest.fn();
    const setCenter = jest.fn();
    const getEventCoordinate = jest.fn(() => [12, 34]);
    let collapsed = false;

    overviewMapElement.className = 'ol-overviewmap-map';
    magnificationBox.className = 'ol-overviewmap-box';
    overviewMapElement.appendChild(magnificationBox);
    controlElement.appendChild(overviewMapElement);
    controlContainer.appendChild(controlElement);
    parent.appendChild(controlContainer);
    parent.addEventListener('pointerdown', parentPointerDown);

    const interaction = configureWSIOverviewMap(
      {
        getControls: () => ({
          getArray: () => [
            {
              element: controlElement,
              getCollapsed: () => collapsed,
              getOverviewMap: () => ({ getEventCoordinate }),
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
    document.dispatchEvent(new MouseEvent('pointermove'));

    expect(parentPointerDown).not.toHaveBeenCalled();
    expect(getEventCoordinate).toHaveBeenCalledTimes(1);
    expect(setCenter).toHaveBeenCalledWith([12, 34]);

    document.dispatchEvent(new MouseEvent('pointerup'));
    document.dispatchEvent(new MouseEvent('pointermove'));

    expect(setCenter).toHaveBeenCalledTimes(1);

    magnificationBox.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true })
    );
    interaction.cleanup();
    document.dispatchEvent(new MouseEvent('pointermove'));
    controlContainer.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true })
    );

    expect(setCenter).toHaveBeenCalledTimes(1);
    expect(parentPointerDown).toHaveBeenCalledTimes(1);
  });
});
