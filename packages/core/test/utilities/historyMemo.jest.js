import { DefaultHistoryMemo } from '../../src/utilities/historyMemo';

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

describe('HistoryMemo', function () {
  it('Simple state remembering', () => {
    DefaultHistoryMemo.push(state);
    state.testState = 1;
    DefaultHistoryMemo.undo();
    expect(state.testState).toBe(0);
    DefaultHistoryMemo.redo();
    expect(state.testState).toBe(1);
  });
});
