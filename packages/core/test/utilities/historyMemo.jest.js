import { HistoryMemo } from '../../src/utilities/historyMemo';

import { describe, it, expect } from '@jest/globals';

let state = {
  testState: 0,
  createMemo: () => createMemo(state.testState),
};

function createMemo(rememberState) {
  return {
    restoreMemo: () => {
      const currentState = state.testState;
      state.testState = rememberState;
      rememberState = currentState;
    },
  };
}

let historyMemo;
beforeEach(() => {
  historyMemo = new HistoryMemo();
});

describe('HistoryMemo', function () {
  it('remembers state changes', () => {
    historyMemo.push(state);
    state.testState = 1;

    historyMemo.undo();
    expect(state.testState).toBe(0);
    historyMemo.redo();
    expect(state.testState).toBe(1);
  });

  it('tracks undo/redo availability', () => {
    expect(historyMemo.canUndo).toBe(false);
    expect(historyMemo.canRedo).toBe(false);

    historyMemo.push(state);
    state.testState = 1;

    expect(historyMemo.canUndo).toBe(true);
    historyMemo.undo();
    expect(historyMemo.canRedo).toBe(true);
  });

  it('works with DefaultHistoryMemo', () => {
    const defaultHistoryMemo = new HistoryMemo();
    defaultHistoryMemo.push(state);
    expect(defaultHistoryMemo.canUndo).toBe(true);
    defaultHistoryMemo.undo();
    expect(defaultHistoryMemo.canRedo).toBe(true);
  });
});
