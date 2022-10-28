// Functions to prevent ghost clicks following a touch
// Since the event lifecycle is touchstart, mousedown, touchend, mouseup
// we want to prevent mousedown and mouseup events after touch events
// All credit to @kosich
// https://gist.github.com/kosich/23188dd86633b6c2efb7

const antiGhostDelay = 2000,
  pointerType = {
    mouse: 0,
    touch: 1,
  };

let lastInteractionType, lastInteractionTime;

function handleTap(type, e) {
  const now = Date.now();

  if (type !== lastInteractionType) {
    if (now - lastInteractionTime <= antiGhostDelay) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      return false;
    }

    lastInteractionType = type;
  }

  lastInteractionTime = now;
}

// Cacheing the function references
// Necessary because a new function reference is created after .bind() is called
// http://stackoverflow.com/questions/11565471/removing-event-listener-which-was-added-with-bind
const handleTapMouse = handleTap.bind(null, pointerType.mouse);
const handleTapTouch = handleTap.bind(null, pointerType.touch);

function attachEvents(element, eventList, interactionType) {
  const tapHandler = interactionType ? handleTapMouse : handleTapTouch;

  eventList.forEach(function (eventName) {
    element.addEventListener(eventName, tapHandler, { passive: false });
  });
}

function removeEvents(element, eventList, interactionType) {
  const tapHandler = interactionType ? handleTapMouse : handleTapTouch;

  eventList.forEach(function (eventName) {
    element.removeEventListener(eventName, tapHandler);
  });
}

const mouseEvents = ['mousedown', 'mouseup', 'mousemove'];
const touchEvents = ['touchstart', 'touchend'];

function disable(element) {
  removeEvents(element, mouseEvents, pointerType.mouse);
  removeEvents(element, touchEvents, pointerType.touch);
}

function enable(element) {
  disable(element);
  attachEvents(element, mouseEvents, pointerType.mouse);
  attachEvents(element, touchEvents, pointerType.touch);
}

export default {
  enable,
  disable,
};
