import * as cornerstone3D from '../src/index.js';

const { eventTarget: events } = cornerstone3D;

const fakeEventName = 'fake_event';

function clearEventType(eventType) {
  events.listeners[eventType] = [];
}

// Thanks to https://github.com/cornerstonejs/cornerstone/pull/506
describe('EventTarget', function () {
  beforeEach(function () {
    clearEventType(fakeEventName);
  });

  it('should trigger event properly', function (done) {
    const expectedEvent = new CustomEvent(fakeEventName, {});
    let handlerCalled = false;

    function handler(event) {
      handlerCalled = true;
      expect(event).toEqual(expectedEvent);
    }

    events.addEventListener(fakeEventName, handler);
    events.dispatchEvent(expectedEvent);

    expect(handlerCalled).toBe(true);
    done();
  });

  it('should not call listener after removal', function (done) {
    const expectedEvent = new CustomEvent(fakeEventName, {});
    let handlerCalled = false;

    function handler() {
      handlerCalled = true;
    }

    events.addEventListener(fakeEventName, handler);
    events.removeEventListener(fakeEventName, handler);
    events.dispatchEvent(expectedEvent);

    expect(handlerCalled).toBe(false);
    done();
  });

  it('should trigger all listener even if a self-removal happens', function (done) {
    const expectedEvent = new CustomEvent(fakeEventName, {});
    let handler1called = false;
    let handler2called = false;
    let handler3called = false;

    function handler1() {
      handler1called = true;
    }
    function handler2() {
      handler2called = true;
      events.removeEventListener(fakeEventName, handler2);
    }
    function handler3() {
      handler3called = true;
    }

    events.addEventListener(fakeEventName, handler1);
    events.addEventListener(fakeEventName, handler2);
    events.addEventListener(fakeEventName, handler3);
    events.dispatchEvent(expectedEvent);

    expect(handler1called).toBe(true);
    expect(handler2called).toBe(true);
    expect(handler3called).toBe(true);

    done();
  });
});
