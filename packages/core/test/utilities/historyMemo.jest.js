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

  it('replaces the current memo without adding another undo step', () => {
    const provisionalMemo = createMemo(0);
    provisionalMemo.id = 'provisional';
    historyMemo.push(provisionalMemo);
    state.testState = 1;

    const replacementMemo = createMemo(10);
    replacementMemo.id = 'replacement';

    expect(
      historyMemo.replaceCurrentMemo(
        replacementMemo,
        (memo) => memo.id === 'provisional'
      )
    ).toBe(true);

    historyMemo.undo();
    expect(state.testState).toBe(10);
    expect(historyMemo.canUndo).toBe(false);

    historyMemo.redo();
    expect(state.testState).toBe(1);
  });

  it('replaces a matching memo in the current group', () => {
    const firstMemo = createMemo(0);
    firstMemo.id = 'first';
    const provisionalMemo = createMemo(0);
    provisionalMemo.id = 'provisional';

    historyMemo.startGroupRecording();
    historyMemo.push(firstMemo);
    historyMemo.push(provisionalMemo);
    historyMemo.endGroupRecording();

    const replacementMemo = createMemo(10);
    replacementMemo.id = 'replacement';

    expect(
      historyMemo.replaceCurrentMemo(
        replacementMemo,
        (memo) => memo.id === 'provisional'
      )
    ).toBe(true);
    expect(
      historyMemo.replaceCurrentMemo(
        createMemo(20),
        (memo) => memo.id === 'missing'
      )
    ).toBe(false);
  });
});
