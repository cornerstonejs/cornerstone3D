import { configureWSIOverviewMap } from '../src/utilities/WSIUtilities';

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
    magnificationBox.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true })
    );

    expect(parentPointerDown).not.toHaveBeenCalled();
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
});
