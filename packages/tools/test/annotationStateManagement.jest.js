/*
 * Jest coverage for src/stateManagement/annotation/*
 *
 * These modules keep module-level singletons (the default annotation
 * manager, the locked/selected/hidden Sets), so every test resets that
 * shared state in beforeEach via the exported reset helpers.
 */

const mockEventTarget = {
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
};

const mockTriggerEvent = jest.fn();

const mockEnabledElements = new Map();
let mockUuidCounter = 0;

function mockGetEnabledElement(element) {
  return mockEnabledElements.get(element);
}

jest.mock('@cornerstonejs/core', () => ({
  Enums: {
    Events: {
      IMAGE_VOLUME_MODIFIED: 'CORNERSTONE_IMAGE_VOLUME_MODIFIED',
    },
  },
  eventTarget: mockEventTarget,
  triggerEvent: (...args) => mockTriggerEvent(...args),
  getEnabledElement: (...args) => mockGetEnabledElement(...args),
  getEnabledElementByIds: jest.fn(),
  utilities: {
    uuidv4: jest.fn(() => `uuid-${mockUuidCounter++}`),
    deepClone: (value) =>
      value === undefined ? value : JSON.parse(JSON.stringify(value)),
  },
}));

const {
  addAnnotation,
  getAnnotation,
  getAnnotations,
  getAllAnnotations,
  getNumberOfAnnotations,
  removeAnnotation,
  removeAnnotations,
  removeAllAnnotations,
  invalidateAnnotation,
  getParentAnnotation,
  getChildAnnotations,
  addChildAnnotation,
  clearParentAnnotation,
  setAnnotationManager,
  getAnnotationManager,
} = require('../src/stateManagement/annotation/annotationState');

const FrameOfReferenceSpecificAnnotationManager =
  require('../src/stateManagement/annotation/FrameOfReferenceSpecificAnnotationManager').default;
const {
  defaultFrameOfReferenceSpecificAnnotationManager,
} = require('../src/stateManagement/annotation/FrameOfReferenceSpecificAnnotationManager');

const {
  setAnnotationLocked,
  unlockAllAnnotations,
  getAnnotationsLocked,
  getAnnotationsLockedCount,
  isAnnotationLocked,
  checkAndSetAnnotationLocked,
} = require('../src/stateManagement/annotation/annotationLocking');

const {
  setAnnotationSelected,
  getAnnotationsSelected,
  getAnnotationsSelectedByToolName,
  getAnnotationsSelectedCount,
  deselectAnnotation,
  isAnnotationSelected,
} = require('../src/stateManagement/annotation/annotationSelection');

const {
  setAnnotationVisibility,
  showAllAnnotations,
  isAnnotationVisible,
  checkAndSetAnnotationVisibility,
} = require('../src/stateManagement/annotation/annotationVisibility');

const AnnotationGroup =
  require('../src/stateManagement/annotation/AnnotationGroup').default;

const { Events, ChangeTypes } = require('../src/enums');

const {
  triggerAnnotationModified,
  triggerAnnotationCompleted,
  triggerContourAnnotationCompleted,
} = require('../src/stateManagement/annotation/helpers/state');

// Use the real default manager singleton for all tests (this is what
// annotationState.ts operates on once it has been set).
setAnnotationManager(defaultFrameOfReferenceSpecificAnnotationManager);

function makeAnnotation({
  annotationUID,
  toolName = 'ToolA',
  FrameOfReferenceUID = 'FOR-1',
  data = {},
} = {}) {
  const annotation = {
    metadata: {
      toolName,
      FrameOfReferenceUID,
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, -1, 0],
    },
    data,
  };
  if (annotationUID) {
    annotation.annotationUID = annotationUID;
  }
  return annotation;
}

function registerEnabledElement(element, overrides = {}) {
  const enabledElement = {
    FrameOfReferenceUID: 'FOR-1',
    renderingEngine: { id: 'engine-1' },
    viewportId: 'viewport-1',
    ...overrides,
  };
  mockEnabledElements.set(element, enabledElement);
  return enabledElement;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnabledElements.clear();
  // IMPORTANT: showAllAnnotations()/deselectAnnotation() must run BEFORE
  // removeAllAnnotations(). annotationVisibility's show()/hide() and the
  // single-uid form of annotationSelection's deselectAnnotation() dereference
  // getAnnotation(uid) without a null-guard (unlike annotationLocking's
  // lock()/unlock(), which do guard) -- see the "suspected product bugs"
  // tests below. If annotations left over from the previous test were
  // already removed from the manager before we clear the hidden/selected
  // sets, these calls throw instead of quietly clearing stale UIDs.
  showAllAnnotations();
  deselectAnnotation();
  unlockAllAnnotations();
  removeAllAnnotations();
  // The above calls all synchronously trigger events via mockTriggerEvent;
  // clear the mock call history so each test starts from a clean slate.
  mockTriggerEvent.mockClear();
});

describe('annotationState', () => {
  describe('addAnnotation / getAnnotation', () => {
    it('assigns a new annotationUID when one is not provided', () => {
      const annotation = makeAnnotation();
      const uid = addAnnotation(annotation, 'FOR-1');

      expect(uid).toBeTruthy();
      expect(annotation.annotationUID).toBe(uid);
      expect(getAnnotation(uid)).toBe(annotation);
    });

    it('preserves a provided annotationUID', () => {
      const annotation = makeAnnotation({ annotationUID: 'fixed-uid' });
      const uid = addAnnotation(annotation, 'FOR-1');

      expect(uid).toBe('fixed-uid');
      expect(getAnnotation('fixed-uid')).toBe(annotation);
    });

    it('returns undefined for an unknown annotationUID', () => {
      expect(getAnnotation('does-not-exist')).toBeUndefined();
    });

    it('adds the annotation under the FrameOfReferenceUID group when a string selector is used', () => {
      const annotation = makeAnnotation({
        annotationUID: 'uid-1',
        FrameOfReferenceUID: 'FOR-XYZ',
      });
      addAnnotation(annotation, 'FOR-XYZ');

      const annotations = getAnnotations('ToolA', 'FOR-XYZ');
      expect(annotations).toEqual([annotation]);
    });

    it('adds the annotation under the FrameOfReferenceUID resolved from an enabled element', () => {
      const element = document.createElement('div');
      registerEnabledElement(element, { FrameOfReferenceUID: 'FOR-ELEMENT' });

      const annotation = makeAnnotation({
        annotationUID: 'uid-element',
        FrameOfReferenceUID: 'FOR-ELEMENT',
      });
      addAnnotation(annotation, element);

      expect(getAnnotations('ToolA', 'FOR-ELEMENT')).toEqual([annotation]);
    });

    it('triggers ANNOTATION_ADDED with viewport info when added via an enabled element', () => {
      const element = document.createElement('div');
      registerEnabledElement(element, {
        FrameOfReferenceUID: 'FOR-ELEMENT',
        renderingEngine: { id: 'engine-42' },
        viewportId: 'viewport-42',
      });

      const annotation = makeAnnotation({
        annotationUID: 'uid-event',
        FrameOfReferenceUID: 'FOR-ELEMENT',
      });
      addAnnotation(annotation, element);

      expect(mockTriggerEvent).toHaveBeenCalledWith(
        mockEventTarget,
        Events.ANNOTATION_ADDED,
        {
          annotation,
          viewportId: 'viewport-42',
          renderingEngineId: 'engine-42',
        }
      );
    });

    it('does not trigger ANNOTATION_ADDED when added via FrameOfReferenceUID and no tool group is registered', () => {
      // With no registered tool groups, triggerAnnotationAddedForFOR bails out
      // before calling triggerEvent at all.
      const annotation = makeAnnotation({ annotationUID: 'uid-for-only' });
      addAnnotation(annotation, 'FOR-1');

      expect(mockTriggerEvent).not.toHaveBeenCalled();
    });
  });

  describe('getAnnotations / getAllAnnotations / getNumberOfAnnotations', () => {
    it('returns an empty array for a group/tool with no annotations', () => {
      expect(getAnnotations('ToolA', 'FOR-EMPTY')).toEqual([]);
      expect(getNumberOfAnnotations('ToolA', 'FOR-EMPTY')).toBe(0);
    });

    it('accumulates multiple annotations for the same tool and FrameOfReferenceUID', () => {
      const a1 = makeAnnotation({ annotationUID: 'a1' });
      const a2 = makeAnnotation({ annotationUID: 'a2' });
      addAnnotation(a1, 'FOR-1');
      addAnnotation(a2, 'FOR-1');

      expect(getAnnotations('ToolA', 'FOR-1')).toEqual([a1, a2]);
      expect(getNumberOfAnnotations('ToolA', 'FOR-1')).toBe(2);
    });

    it('separates annotations by tool name within the same FrameOfReferenceUID', () => {
      const a1 = makeAnnotation({ annotationUID: 'a1', toolName: 'ToolA' });
      const b1 = makeAnnotation({ annotationUID: 'b1', toolName: 'ToolB' });
      addAnnotation(a1, 'FOR-1');
      addAnnotation(b1, 'FOR-1');

      expect(getAnnotations('ToolA', 'FOR-1')).toEqual([a1]);
      expect(getAnnotations('ToolB', 'FOR-1')).toEqual([b1]);
    });

    it('separates annotations across different FrameOfReferenceUIDs', () => {
      const a1 = makeAnnotation({
        annotationUID: 'a1',
        FrameOfReferenceUID: 'FOR-1',
      });
      const a2 = makeAnnotation({
        annotationUID: 'a2',
        FrameOfReferenceUID: 'FOR-2',
      });
      addAnnotation(a1, 'FOR-1');
      addAnnotation(a2, 'FOR-2');

      expect(getAnnotations('ToolA', 'FOR-1')).toEqual([a1]);
      expect(getAnnotations('ToolA', 'FOR-2')).toEqual([a2]);
      expect(
        getAllAnnotations().sort((x, y) =>
          x.annotationUID.localeCompare(y.annotationUID)
        )
      ).toEqual([a1, a2]);
    });

    it('getAllAnnotations returns an empty array when nothing has been added', () => {
      expect(getAllAnnotations()).toEqual([]);
    });
  });

  describe('removeAnnotation', () => {
    it('removes the annotation and triggers ANNOTATION_REMOVED with the manager uid', () => {
      const annotation = makeAnnotation({ annotationUID: 'remove-me' });
      addAnnotation(annotation, 'FOR-1');
      mockTriggerEvent.mockClear();

      removeAnnotation('remove-me');

      expect(getAnnotation('remove-me')).toBeUndefined();
      expect(mockTriggerEvent).toHaveBeenCalledWith(
        mockEventTarget,
        Events.ANNOTATION_REMOVED,
        {
          annotation,
          annotationManagerUID:
            defaultFrameOfReferenceSpecificAnnotationManager.uid,
        }
      );
    });

    it('is a no-op (no throw, no event) for an unknown annotationUID', () => {
      expect(() => removeAnnotation('unknown-uid')).not.toThrow();
      expect(mockTriggerEvent).not.toHaveBeenCalled();
    });

    it('is a no-op for an empty/falsy annotationUID', () => {
      expect(() => removeAnnotation('')).not.toThrow();
      expect(mockTriggerEvent).not.toHaveBeenCalled();
    });

    it('recursively removes child annotations first', () => {
      const parent = makeAnnotation({ annotationUID: 'parent' });
      const child = makeAnnotation({ annotationUID: 'child' });
      addAnnotation(parent, 'FOR-1');
      addAnnotation(child, 'FOR-1');
      addChildAnnotation(parent, child);

      removeAnnotation('parent');

      expect(getAnnotation('parent')).toBeUndefined();
      expect(getAnnotation('child')).toBeUndefined();
    });
  });

  describe('removeAnnotations (by group/tool)', () => {
    it('removes only annotations for the given tool within the group and triggers one event per annotation', () => {
      const a1 = makeAnnotation({ annotationUID: 'a1', toolName: 'ToolA' });
      const b1 = makeAnnotation({ annotationUID: 'b1', toolName: 'ToolB' });
      addAnnotation(a1, 'FOR-1');
      addAnnotation(b1, 'FOR-1');
      mockTriggerEvent.mockClear();

      removeAnnotations('ToolA', 'FOR-1');

      expect(getAnnotation('a1')).toBeUndefined();
      expect(getAnnotation('b1')).toBe(b1);
      expect(mockTriggerEvent).toHaveBeenCalledTimes(1);
      expect(mockTriggerEvent).toHaveBeenCalledWith(
        mockEventTarget,
        Events.ANNOTATION_REMOVED,
        expect.objectContaining({ annotation: a1 })
      );
    });
  });

  describe('removeAllAnnotations', () => {
    it('removes every annotation across all groups and triggers one event per annotation', () => {
      addAnnotation(
        makeAnnotation({ annotationUID: 'a1', FrameOfReferenceUID: 'FOR-1' }),
        'FOR-1'
      );
      addAnnotation(
        makeAnnotation({ annotationUID: 'a2', FrameOfReferenceUID: 'FOR-2' }),
        'FOR-2'
      );
      mockTriggerEvent.mockClear();

      removeAllAnnotations();

      expect(getAllAnnotations()).toEqual([]);
      expect(mockTriggerEvent).toHaveBeenCalledTimes(2);
    });

    it('is a no-op when there are no annotations', () => {
      removeAllAnnotations();
      expect(mockTriggerEvent).not.toHaveBeenCalled();
    });
  });

  describe('parent/child annotation helpers', () => {
    it('associates a child with a parent and exposes it via getChildAnnotations/getParentAnnotation', () => {
      const parent = makeAnnotation({ annotationUID: 'parent' });
      const child = makeAnnotation({ annotationUID: 'child' });
      addAnnotation(parent, 'FOR-1');
      addAnnotation(child, 'FOR-1');

      addChildAnnotation(parent, child);

      expect(parent.childAnnotationUIDs).toEqual(['child']);
      expect(child.parentAnnotationUID).toBe('parent');
      expect(getChildAnnotations(parent)).toEqual([child]);
      expect(getParentAnnotation(child)).toBe(parent);
    });

    it('does not duplicate an existing child association', () => {
      const parent = makeAnnotation({ annotationUID: 'parent' });
      const child = makeAnnotation({ annotationUID: 'child' });
      addAnnotation(parent, 'FOR-1');
      addAnnotation(child, 'FOR-1');

      addChildAnnotation(parent, child);
      addChildAnnotation(parent, child);

      expect(parent.childAnnotationUIDs).toEqual(['child']);
    });

    it('clears the parent association via clearParentAnnotation', () => {
      const parent = makeAnnotation({ annotationUID: 'parent' });
      const child = makeAnnotation({ annotationUID: 'child' });
      addAnnotation(parent, 'FOR-1');
      addAnnotation(child, 'FOR-1');
      addChildAnnotation(parent, child);

      clearParentAnnotation(child);

      expect(parent.childAnnotationUIDs).toEqual([]);
      expect(child.parentAnnotationUID).toBeUndefined();
    });

    it('re-parents a child that already had a different parent', () => {
      const parentA = makeAnnotation({ annotationUID: 'parentA' });
      const parentB = makeAnnotation({ annotationUID: 'parentB' });
      const child = makeAnnotation({ annotationUID: 'child' });
      addAnnotation(parentA, 'FOR-1');
      addAnnotation(parentB, 'FOR-1');
      addAnnotation(child, 'FOR-1');

      addChildAnnotation(parentA, child);
      addChildAnnotation(parentB, child);

      expect(parentA.childAnnotationUIDs).toEqual([]);
      expect(parentB.childAnnotationUIDs).toEqual(['child']);
      expect(child.parentAnnotationUID).toBe('parentB');
    });

    it('getParentAnnotation/getChildAnnotations return sensible defaults with no association', () => {
      const lonely = makeAnnotation({ annotationUID: 'lonely' });
      addAnnotation(lonely, 'FOR-1');

      expect(getParentAnnotation(lonely)).toBeUndefined();
      expect(getChildAnnotations(lonely)).toEqual([]);
    });
  });

  describe('invalidateAnnotation', () => {
    it('marks the annotation as invalidated', () => {
      const annotation = makeAnnotation({ annotationUID: 'inv-1' });
      addAnnotation(annotation, 'FOR-1');

      invalidateAnnotation(annotation);

      expect(annotation.invalidated).toBe(true);
    });

    it('walks up and invalidates all ancestor annotations', () => {
      const grandparent = makeAnnotation({ annotationUID: 'gp' });
      const parent = makeAnnotation({ annotationUID: 'p' });
      const child = makeAnnotation({ annotationUID: 'c' });
      addAnnotation(grandparent, 'FOR-1');
      addAnnotation(parent, 'FOR-1');
      addAnnotation(child, 'FOR-1');
      addChildAnnotation(grandparent, parent);
      addChildAnnotation(parent, child);

      invalidateAnnotation(child);

      expect(child.invalidated).toBe(true);
      expect(parent.invalidated).toBe(true);
      expect(grandparent.invalidated).toBe(true);
    });
  });

  describe('setAnnotationManager / getAnnotationManager', () => {
    it('allows swapping in a custom manager and restores the default afterwards', () => {
      const customManager = new FrameOfReferenceSpecificAnnotationManager(
        'custom'
      );
      setAnnotationManager(customManager);
      expect(getAnnotationManager()).toBe(customManager);

      const annotation = makeAnnotation({ annotationUID: 'in-custom' });
      addAnnotation(annotation, 'FOR-1');
      expect(customManager.getAnnotation('in-custom')).toBe(annotation);

      // Restore default manager for subsequent tests.
      setAnnotationManager(defaultFrameOfReferenceSpecificAnnotationManager);
      expect(getAnnotation('in-custom')).toBeUndefined();
    });
  });
});

describe('FrameOfReferenceSpecificAnnotationManager', () => {
  let manager;

  beforeEach(() => {
    manager = new FrameOfReferenceSpecificAnnotationManager(
      'manager-under-test'
    );
  });

  it('generates a uuid-based uid when none is provided', () => {
    const auto = new FrameOfReferenceSpecificAnnotationManager();
    expect(auto.uid).toMatch(/^uuid-/);
  });

  it('getGroupKey returns the string selector directly', () => {
    expect(manager.getGroupKey('FOR-STRING')).toBe('FOR-STRING');
  });

  it('getGroupKey resolves an element to its FrameOfReferenceUID', () => {
    const element = document.createElement('div');
    registerEnabledElement(element, { FrameOfReferenceUID: 'FOR-RESOLVED' });
    expect(manager.getGroupKey(element)).toBe('FOR-RESOLVED');
  });

  it('getGroupKey throws for an element that is not enabled', () => {
    const element = document.createElement('div');
    expect(() => manager.getGroupKey(element)).toThrow(/not enabled/);
  });

  it('addAnnotation falls back to metadata.FrameOfReferenceUID when no groupKey is given', () => {
    const annotation = makeAnnotation({
      annotationUID: 'a1',
      FrameOfReferenceUID: 'FOR-META',
    });
    manager.addAnnotation(annotation);

    expect(manager.getAnnotation('a1')).toBe(annotation);
    expect(manager.getAnnotations('FOR-META', 'ToolA')).toEqual([annotation]);
  });

  it('getAnnotations returns [] for a group that does not exist', () => {
    expect(manager.getAnnotations('missing-group')).toEqual([]);
  });

  it('getAnnotations returns [] for an existing group but missing tool', () => {
    manager.addAnnotation(makeAnnotation({ annotationUID: 'a1' }), 'FOR-1');
    expect(manager.getAnnotations('FOR-1', 'OtherTool')).toEqual([]);
  });

  it('getAnnotations without a toolName returns the whole group map', () => {
    const a1 = makeAnnotation({ annotationUID: 'a1', toolName: 'ToolA' });
    const b1 = makeAnnotation({ annotationUID: 'b1', toolName: 'ToolB' });
    manager.addAnnotation(a1, 'FOR-1');
    manager.addAnnotation(b1, 'FOR-1');

    expect(manager.getAnnotations('FOR-1')).toEqual({
      ToolA: [a1],
      ToolB: [b1],
    });
  });

  it('rejects unsafe group keys and tool names without throwing', () => {
    const annotation = makeAnnotation({ annotationUID: 'unsafe' });
    manager.addAnnotation(annotation, '__proto__');
    expect(manager.getNumberOfAllAnnotations()).toBe(0);

    const unsafeToolAnnotation = {
      metadata: { toolName: 'constructor', FrameOfReferenceUID: 'FOR-1' },
      data: {},
      annotationUID: 'unsafe-tool',
    };
    manager.addAnnotation(unsafeToolAnnotation, 'FOR-1');
    expect(manager.getNumberOfAllAnnotations()).toBe(0);
  });

  it('getNumberOfAnnotations counts per tool', () => {
    manager.addAnnotation(
      makeAnnotation({ annotationUID: 'a1', toolName: 'ToolA' }),
      'FOR-1'
    );
    manager.addAnnotation(
      makeAnnotation({ annotationUID: 'a2', toolName: 'ToolA' }),
      'FOR-1'
    );
    manager.addAnnotation(
      makeAnnotation({ annotationUID: 'b1', toolName: 'ToolB' }),
      'FOR-1'
    );

    expect(manager.getNumberOfAnnotations('FOR-1', 'ToolA')).toBe(2);
    expect(manager.getNumberOfAnnotations('missing-group')).toBe(0);
  });

  it('BUG: getNumberOfAnnotations(groupKey) without a toolName incorrectly returns 0 even when the group has annotations', () => {
    // getNumberOfAnnotations() does `const annotations = this.getAnnotations(groupKey, toolName);
    // if (!annotations.length) return 0;`. When toolName is omitted,
    // getAnnotations returns the {toolName: Annotations[]} map, which has no
    // `.length` property, so `!annotations.length` is `!undefined` -> true,
    // and the function bails out to 0 before ever reaching the
    // `for (const toolName in annotations)` summation below. The "total
    // annotations in a group across every tool" mode of this API is
    // effectively dead code.
    manager.addAnnotation(
      makeAnnotation({ annotationUID: 'a1', toolName: 'ToolA' }),
      'FOR-1'
    );
    manager.addAnnotation(
      makeAnnotation({ annotationUID: 'a2', toolName: 'ToolA' }),
      'FOR-1'
    );
    manager.addAnnotation(
      makeAnnotation({ annotationUID: 'b1', toolName: 'ToolB' }),
      'FOR-1'
    );

    expect(manager.getNumberOfAnnotations('FOR-1')).toBe(0);
  });

  it('getNumberOfAllAnnotations sums across every group and tool', () => {
    manager.addAnnotation(
      makeAnnotation({ annotationUID: 'a1', FrameOfReferenceUID: 'FOR-1' }),
      'FOR-1'
    );
    manager.addAnnotation(
      makeAnnotation({ annotationUID: 'a2', FrameOfReferenceUID: 'FOR-2' }),
      'FOR-2'
    );
    manager.addAnnotation(
      makeAnnotation({
        annotationUID: 'a3',
        FrameOfReferenceUID: 'FOR-2',
        toolName: 'ToolB',
      }),
      'FOR-2'
    );

    expect(manager.getNumberOfAllAnnotations()).toBe(3);
  });

  it('removeAnnotation deletes the tool bucket and group when they become empty', () => {
    manager.addAnnotation(makeAnnotation({ annotationUID: 'a1' }), 'FOR-1');

    manager.removeAnnotation('a1');

    expect(manager.getAnnotations('FOR-1')).toEqual([]);
    expect(manager.getFramesOfReference()).toEqual([]);
  });

  it('removeAnnotation leaves sibling annotations/tools intact', () => {
    manager.addAnnotation(
      makeAnnotation({ annotationUID: 'a1', toolName: 'ToolA' }),
      'FOR-1'
    );
    manager.addAnnotation(
      makeAnnotation({ annotationUID: 'a2', toolName: 'ToolA' }),
      'FOR-1'
    );
    manager.addAnnotation(
      makeAnnotation({ annotationUID: 'b1', toolName: 'ToolB' }),
      'FOR-1'
    );

    manager.removeAnnotation('a1');

    expect(
      manager.getAnnotations('FOR-1', 'ToolA').map((a) => a.annotationUID)
    ).toEqual(['a2']);
    expect(manager.getAnnotations('FOR-1', 'ToolB')).toHaveLength(1);
  });

  it('removeAnnotations removes only the given tool and returns the removed annotations', () => {
    const a1 = makeAnnotation({ annotationUID: 'a1', toolName: 'ToolA' });
    const b1 = makeAnnotation({ annotationUID: 'b1', toolName: 'ToolB' });
    manager.addAnnotation(a1, 'FOR-1');
    manager.addAnnotation(b1, 'FOR-1');

    const removed = manager.removeAnnotations('FOR-1', 'ToolA');

    expect(removed).toEqual([a1]);
    expect(manager.getAnnotation('b1')).toBe(b1);
  });

  it('removeAnnotations with no toolName removes the entire group', () => {
    manager.addAnnotation(
      makeAnnotation({ annotationUID: 'a1', toolName: 'ToolA' }),
      'FOR-1'
    );
    manager.addAnnotation(
      makeAnnotation({ annotationUID: 'b1', toolName: 'ToolB' }),
      'FOR-1'
    );

    const removed = manager.removeAnnotations('FOR-1');

    expect(removed.map((a) => a.annotationUID).sort()).toEqual(['a1', 'b1']);
    expect(manager.getFramesOfReference()).toEqual([]);
  });

  it('removeAnnotations returns [] for a group that does not exist', () => {
    expect(manager.removeAnnotations('missing-group')).toEqual([]);
  });

  it('removeAllAnnotations empties every group and returns the removed annotations', () => {
    manager.addAnnotation(
      makeAnnotation({ annotationUID: 'a1', FrameOfReferenceUID: 'FOR-1' }),
      'FOR-1'
    );
    manager.addAnnotation(
      makeAnnotation({ annotationUID: 'a2', FrameOfReferenceUID: 'FOR-2' }),
      'FOR-2'
    );

    const removed = manager.removeAllAnnotations();

    expect(removed.map((a) => a.annotationUID).sort()).toEqual(['a1', 'a2']);
    expect(manager.getAllAnnotations()).toEqual([]);
    expect(manager.getFramesOfReference()).toEqual([]);
  });

  describe('saveAnnotations / restoreAnnotations', () => {
    it('round-trips the entire state when called with no arguments', () => {
      manager.addAnnotation(
        makeAnnotation({ annotationUID: 'a1', FrameOfReferenceUID: 'FOR-1' }),
        'FOR-1'
      );
      manager.addAnnotation(
        makeAnnotation({ annotationUID: 'a2', FrameOfReferenceUID: 'FOR-2' }),
        'FOR-2'
      );

      const saved = manager.saveAnnotations();

      const restoredInto = new FrameOfReferenceSpecificAnnotationManager(
        'restored'
      );
      restoredInto.restoreAnnotations(saved);

      expect(restoredInto.getNumberOfAllAnnotations()).toBe(2);
      expect(restoredInto.getAnnotation('a1')).toEqual(
        expect.objectContaining({ annotationUID: 'a1' })
      );
    });

    it('round-trips a single FrameOfReferenceUID group', () => {
      manager.addAnnotation(
        makeAnnotation({ annotationUID: 'a1', FrameOfReferenceUID: 'FOR-1' }),
        'FOR-1'
      );
      manager.addAnnotation(
        makeAnnotation({ annotationUID: 'a2', FrameOfReferenceUID: 'FOR-2' }),
        'FOR-2'
      );

      const savedGroup = manager.saveAnnotations('FOR-1');

      const restoredInto = new FrameOfReferenceSpecificAnnotationManager(
        'restored-group'
      );
      restoredInto.restoreAnnotations(savedGroup, 'FOR-1');

      expect(restoredInto.getNumberOfAllAnnotations()).toBe(1);
      expect(restoredInto.getAnnotation('a1')).toBeTruthy();
      expect(restoredInto.getAnnotation('a2')).toBeUndefined();
    });

    it('round-trips a single group+tool selection', () => {
      manager.addAnnotation(
        makeAnnotation({ annotationUID: 'a1', toolName: 'ToolA' }),
        'FOR-1'
      );
      manager.addAnnotation(
        makeAnnotation({ annotationUID: 'b1', toolName: 'ToolB' }),
        'FOR-1'
      );

      const savedToolAnnotations = manager.saveAnnotations('FOR-1', 'ToolA');
      expect(savedToolAnnotations).toEqual([
        expect.objectContaining({ annotationUID: 'a1' }),
      ]);

      const restoredInto = new FrameOfReferenceSpecificAnnotationManager(
        'restored-tool'
      );
      restoredInto.restoreAnnotations(savedToolAnnotations, 'FOR-1', 'ToolA');

      expect(restoredInto.getAnnotations('FOR-1', 'ToolA')).toEqual(
        savedToolAnnotations
      );
      expect(restoredInto.getNumberOfAllAnnotations()).toBe(1);
    });

    it('saveAnnotations returns a deep clone, not a live reference', () => {
      const annotation = makeAnnotation({ annotationUID: 'a1' });
      manager.addAnnotation(annotation, 'FOR-1');

      const saved = manager.saveAnnotations('FOR-1', 'ToolA');
      saved[0].data.mutated = true;

      expect(annotation.data.mutated).toBeUndefined();
    });

    it('saveAnnotations returns undefined for a group+tool combination that does not exist', () => {
      expect(manager.saveAnnotations('missing-group', 'ToolA')).toBeUndefined();
    });
  });

  describe('_imageVolumeModifiedHandler (registered for Enums.Events.IMAGE_VOLUME_MODIFIED at construction)', () => {
    it('registers the handler on eventTarget when constructed', () => {
      expect(mockEventTarget.addEventListener).toHaveBeenCalledWith(
        'CORNERSTONE_IMAGE_VOLUME_MODIFIED',
        manager._imageVolumeModifiedHandler
      );
    });

    it('invalidates annotations for the affected FrameOfReferenceUID that already have an invalidated flag defined', () => {
      const a1 = makeAnnotation({
        annotationUID: 'a1',
        FrameOfReferenceUID: 'FOR-VOL',
      });
      a1.invalidated = false;
      const a2 = makeAnnotation({
        annotationUID: 'a2',
        FrameOfReferenceUID: 'FOR-VOL',
      });
      // a2.invalidated is intentionally left undefined: the handler only
      // flips the flag for annotations where `invalidated !== undefined`.
      manager.addAnnotation(a1, 'FOR-VOL');
      manager.addAnnotation(a2, 'FOR-VOL');

      manager._imageVolumeModifiedHandler({
        detail: { FrameOfReferenceUID: 'FOR-VOL' },
      });

      expect(a1.invalidated).toBe(true);
      expect(a2.invalidated).toBeUndefined();
    });

    it('does nothing for a FrameOfReferenceUID with no tracked annotations', () => {
      expect(() =>
        manager._imageVolumeModifiedHandler({
          detail: { FrameOfReferenceUID: 'unknown-for' },
        })
      ).not.toThrow();
    });
  });

  it('setPreprocessingFn transforms annotations as they are added', () => {
    manager.setPreprocessingFn((annotation) => {
      annotation.data.preprocessed = true;
      return annotation;
    });

    const annotation = makeAnnotation({ annotationUID: 'a1' });
    manager.addAnnotation(annotation, 'FOR-1');

    expect(manager.getAnnotation('a1').data.preprocessed).toBe(true);
  });
});

describe('annotationLocking', () => {
  let annotation;

  beforeEach(() => {
    annotation = makeAnnotation({ annotationUID: 'lock-target' });
    addAnnotation(annotation, 'FOR-1');
    mockTriggerEvent.mockClear();
  });

  it('locks an annotation, sets isLocked, and triggers ANNOTATION_LOCK_CHANGE with added/locked payload', () => {
    setAnnotationLocked('lock-target', true);

    expect(annotation.isLocked).toBe(true);
    expect(isAnnotationLocked('lock-target')).toBe(true);
    expect(getAnnotationsLockedCount()).toBe(1);
    expect(mockTriggerEvent).toHaveBeenCalledWith(
      mockEventTarget,
      Events.ANNOTATION_LOCK_CHANGE,
      { added: ['lock-target'], removed: [], locked: ['lock-target'] }
    );
  });

  it('defaults the locked parameter to true', () => {
    setAnnotationLocked('lock-target');
    expect(isAnnotationLocked('lock-target')).toBe(true);
  });

  it('unlocks a locked annotation and triggers ANNOTATION_LOCK_CHANGE with removed payload', () => {
    setAnnotationLocked('lock-target', true);
    mockTriggerEvent.mockClear();

    setAnnotationLocked('lock-target', false);

    expect(annotation.isLocked).toBe(false);
    expect(isAnnotationLocked('lock-target')).toBe(false);
    expect(mockTriggerEvent).toHaveBeenCalledWith(
      mockEventTarget,
      Events.ANNOTATION_LOCK_CHANGE,
      { added: [], removed: ['lock-target'], locked: [] }
    );
  });

  it('does not trigger an event when locking an already-locked annotation', () => {
    setAnnotationLocked('lock-target', true);
    mockTriggerEvent.mockClear();

    setAnnotationLocked('lock-target', true);

    expect(mockTriggerEvent).not.toHaveBeenCalled();
  });

  it('does not trigger an event when unlocking an annotation that is not locked', () => {
    setAnnotationLocked('lock-target', false);

    expect(mockTriggerEvent).not.toHaveBeenCalled();
  });

  it('does nothing for a falsy annotationUID beyond publishing (no added/removed => no event)', () => {
    setAnnotationLocked('', true);
    expect(mockTriggerEvent).not.toHaveBeenCalled();
  });

  it('isAnnotationLocked returns false for an unknown annotationUID', () => {
    expect(isAnnotationLocked('unknown')).toBe(false);
  });

  it('unlockAllAnnotations clears the locked set and triggers one combined event', () => {
    const other = makeAnnotation({ annotationUID: 'lock-target-2' });
    addAnnotation(other, 'FOR-1');
    setAnnotationLocked('lock-target', true);
    setAnnotationLocked('lock-target-2', true);
    mockTriggerEvent.mockClear();

    unlockAllAnnotations();

    expect(getAnnotationsLocked()).toEqual([]);
    expect(getAnnotationsLockedCount()).toBe(0);
    expect(annotation.isLocked).toBe(false);
    expect(other.isLocked).toBe(false);
    expect(mockTriggerEvent).toHaveBeenCalledTimes(1);
    const [, , detail] = mockTriggerEvent.mock.calls[0];
    expect(detail.removed.sort()).toEqual(['lock-target', 'lock-target-2']);
    expect(detail.locked).toEqual([]);
  });

  it('unlockAllAnnotations is a no-op when nothing is locked', () => {
    unlockAllAnnotations();
    expect(mockTriggerEvent).not.toHaveBeenCalled();
  });

  it('contrast with annotationVisibility bugs: unlocking/relocking does NOT throw once the underlying annotation has been removed', () => {
    // lock()/unlock() in annotationLocking.ts guard with
    // `if (annotation) { annotation.isLocked = ...; }` before dereferencing,
    // unlike annotationVisibility's show()/hide() or the single-uid form of
    // annotationSelection's deselectAnnotation() (see the bug tests in those
    // suites). This is the "correct" pattern the other two modules should
    // follow.
    const orphan = makeAnnotation({ annotationUID: 'orphan-lock' });
    addAnnotation(orphan, 'FOR-1');
    setAnnotationLocked('orphan-lock', true);
    removeAnnotation('orphan-lock');

    expect(() => setAnnotationLocked('orphan-lock', false)).not.toThrow();
    expect(isAnnotationLocked('orphan-lock')).toBe(false);
  });

  describe('checkAndSetAnnotationLocked', () => {
    it('re-applies the current (unlocked) state and returns it without emitting an event', () => {
      const result = checkAndSetAnnotationLocked('lock-target');

      expect(result).toBe(false);
      expect(mockTriggerEvent).not.toHaveBeenCalled();
    });

    it('re-applies the current (locked) state and returns it without emitting an event', () => {
      setAnnotationLocked('lock-target', true);
      mockTriggerEvent.mockClear();

      const result = checkAndSetAnnotationLocked('lock-target');

      expect(result).toBe(true);
      expect(mockTriggerEvent).not.toHaveBeenCalled();
    });
  });
});

describe('annotationSelection', () => {
  let a1;
  let a2;

  beforeEach(() => {
    a1 = makeAnnotation({ annotationUID: 'sel-1' });
    a2 = makeAnnotation({ annotationUID: 'sel-2' });
    addAnnotation(a1, 'FOR-1');
    addAnnotation(a2, 'FOR-1');
    mockTriggerEvent.mockClear();
  });

  it('selects an annotation and triggers ANNOTATION_SELECTION_CHANGE with added/selection payload', () => {
    setAnnotationSelected('sel-1', true);

    expect(a1.isSelected).toBe(true);
    expect(isAnnotationSelected('sel-1')).toBe(true);
    expect(getAnnotationsSelected()).toEqual(['sel-1']);
    expect(mockTriggerEvent).toHaveBeenCalledWith(
      mockEventTarget,
      Events.ANNOTATION_SELECTION_CHANGE,
      { added: ['sel-1'], removed: [], selection: ['sel-1'] }
    );
  });

  it('defaults selected and preserveSelected such that a second select replaces the first', () => {
    setAnnotationSelected('sel-1');
    setAnnotationSelected('sel-2');

    expect(a1.isSelected).toBe(false);
    expect(a2.isSelected).toBe(true);
    expect(getAnnotationsSelected()).toEqual(['sel-2']);
  });

  it('preserveSelected=true accumulates selections instead of replacing them', () => {
    setAnnotationSelected('sel-1', true, true);
    setAnnotationSelected('sel-2', true, true);

    expect(getAnnotationsSelected().sort()).toEqual(['sel-1', 'sel-2']);
    expect(a1.isSelected).toBe(true);
    expect(a2.isSelected).toBe(true);
  });

  it('selecting an already-selected annotation with preserveSelected=false clears then reselects (still selected, event still added)', () => {
    setAnnotationSelected('sel-1', true, false);
    mockTriggerEvent.mockClear();

    setAnnotationSelected('sel-1', true, false);

    // clearSelectionSet removes sel-1 (added to `removed`), then it is
    // immediately re-added (added to `added`); net selection is unchanged
    // but an event is still triggered because removed/added are non-empty.
    expect(getAnnotationsSelected()).toEqual(['sel-1']);
    expect(mockTriggerEvent).toHaveBeenCalledWith(
      mockEventTarget,
      Events.ANNOTATION_SELECTION_CHANGE,
      { added: ['sel-1'], removed: ['sel-1'], selection: ['sel-1'] }
    );
  });

  it('setAnnotationSelected(uid, false) deselects a single annotation', () => {
    setAnnotationSelected('sel-1', true, true);
    setAnnotationSelected('sel-2', true, true);
    mockTriggerEvent.mockClear();

    setAnnotationSelected('sel-1', false);

    expect(a1.isSelected).toBe(false);
    expect(getAnnotationsSelected()).toEqual(['sel-2']);
    expect(mockTriggerEvent).toHaveBeenCalledWith(
      mockEventTarget,
      Events.ANNOTATION_SELECTION_CHANGE,
      { added: [], removed: ['sel-1'], selection: ['sel-2'] }
    );
  });

  it('deselectAnnotation() with no argument clears all selections', () => {
    setAnnotationSelected('sel-1', true, true);
    setAnnotationSelected('sel-2', true, true);
    mockTriggerEvent.mockClear();

    deselectAnnotation();

    expect(getAnnotationsSelected()).toEqual([]);
    expect(a1.isSelected).toBe(false);
    expect(a2.isSelected).toBe(false);
    expect(mockTriggerEvent).toHaveBeenCalledWith(
      mockEventTarget,
      Events.ANNOTATION_SELECTION_CHANGE,
      {
        added: [],
        removed: expect.arrayContaining(['sel-1', 'sel-2']),
        selection: [],
      }
    );
  });

  it('does not trigger an event deselecting an annotation that is not selected', () => {
    deselectAnnotation('sel-1');
    expect(mockTriggerEvent).not.toHaveBeenCalled();
  });

  it('does not trigger an event when deselecting all with nothing selected', () => {
    deselectAnnotation();
    expect(mockTriggerEvent).not.toHaveBeenCalled();
  });

  it('BUG: deselecting a single annotation UID throws once the underlying annotation has been removed', () => {
    // The single-uid branch of deselectAnnotation() does
    // `const annotation = getAnnotation(annotationUID); annotation.isSelected = false;`
    // with no guard, unlike its own no-arg branch (clearSelectionSet, which
    // guards with `if (annotation) { ... }`) and unlike annotationLocking's
    // unlock(). Once the annotation has been removed from the manager while
    // still selected, deselecting it by uid throws instead of silently
    // clearing the stale UID.
    const orphan = makeAnnotation({ annotationUID: 'orphan-sel' });
    addAnnotation(orphan, 'FOR-1');
    setAnnotationSelected('orphan-sel', true);
    removeAnnotation('orphan-sel');

    expect(() => deselectAnnotation('orphan-sel')).toThrow(TypeError);
  });

  it('getAnnotationsSelectedCount reflects the current selection size', () => {
    expect(getAnnotationsSelectedCount()).toBe(0);
    setAnnotationSelected('sel-1', true, true);
    setAnnotationSelected('sel-2', true, true);
    expect(getAnnotationsSelectedCount()).toBe(2);
  });

  it('getAnnotationsSelectedByToolName filters selected annotations by tool name', () => {
    const b1 = makeAnnotation({ annotationUID: 'sel-b1', toolName: 'ToolB' });
    addAnnotation(b1, 'FOR-1');

    setAnnotationSelected('sel-1', true, true);
    setAnnotationSelected('sel-b1', true, true);

    expect(getAnnotationsSelectedByToolName('ToolA')).toEqual(['sel-1']);
    expect(getAnnotationsSelectedByToolName('ToolB')).toEqual(['sel-b1']);
  });

  it('isAnnotationSelected returns false for an unknown annotationUID', () => {
    expect(isAnnotationSelected('unknown')).toBe(false);
  });
});

describe('annotationVisibility', () => {
  let annotation;

  beforeEach(() => {
    annotation = makeAnnotation({ annotationUID: 'vis-1' });
    addAnnotation(annotation, 'FOR-1');
    mockTriggerEvent.mockClear();
  });

  it('an annotation is visible by default (never hidden)', () => {
    expect(isAnnotationVisible('vis-1')).toBe(true);
  });

  it('isAnnotationVisible returns undefined for an unknown annotationUID', () => {
    expect(isAnnotationVisible('unknown')).toBeUndefined();
  });

  it('hides an annotation and triggers ANNOTATION_VISIBILITY_CHANGE with lastHidden/hidden payload', () => {
    setAnnotationVisibility('vis-1', false);

    expect(annotation.isVisible).toBe(false);
    expect(isAnnotationVisible('vis-1')).toBe(false);
    expect(mockTriggerEvent).toHaveBeenCalledWith(
      mockEventTarget,
      Events.ANNOTATION_VISIBILITY_CHANGE,
      { lastVisible: [], lastHidden: ['vis-1'], hidden: ['vis-1'] }
    );
  });

  it('shows a hidden annotation and triggers ANNOTATION_VISIBILITY_CHANGE with lastVisible payload', () => {
    setAnnotationVisibility('vis-1', false);
    mockTriggerEvent.mockClear();

    setAnnotationVisibility('vis-1', true);

    expect(annotation.isVisible).toBe(true);
    expect(isAnnotationVisible('vis-1')).toBe(true);
    expect(mockTriggerEvent).toHaveBeenCalledWith(
      mockEventTarget,
      Events.ANNOTATION_VISIBILITY_CHANGE,
      { lastVisible: ['vis-1'], lastHidden: [], hidden: [] }
    );
  });

  it('does not trigger an event hiding an already-hidden annotation', () => {
    setAnnotationVisibility('vis-1', false);
    mockTriggerEvent.mockClear();

    setAnnotationVisibility('vis-1', false);

    expect(mockTriggerEvent).not.toHaveBeenCalled();
  });

  it('does not trigger an event showing an already-visible annotation', () => {
    setAnnotationVisibility('vis-1', true);
    expect(mockTriggerEvent).not.toHaveBeenCalled();
  });

  it('hiding a selected annotation deselects it as a side effect', () => {
    setAnnotationSelected('vis-1', true);
    mockTriggerEvent.mockClear();

    setAnnotationVisibility('vis-1', false);

    expect(isAnnotationSelected('vis-1')).toBe(false);
    // Two events: one for the selection-change side effect, one for visibility.
    expect(mockTriggerEvent).toHaveBeenCalledWith(
      mockEventTarget,
      Events.ANNOTATION_SELECTION_CHANGE,
      expect.objectContaining({ removed: ['vis-1'] })
    );
    expect(mockTriggerEvent).toHaveBeenCalledWith(
      mockEventTarget,
      Events.ANNOTATION_VISIBILITY_CHANGE,
      expect.objectContaining({ lastHidden: ['vis-1'] })
    );
  });

  it('showAllAnnotations clears every hidden annotation with a single combined event', () => {
    const other = makeAnnotation({ annotationUID: 'vis-2' });
    addAnnotation(other, 'FOR-1');
    setAnnotationVisibility('vis-1', false);
    setAnnotationVisibility('vis-2', false);
    mockTriggerEvent.mockClear();

    showAllAnnotations();

    expect(isAnnotationVisible('vis-1')).toBe(true);
    expect(isAnnotationVisible('vis-2')).toBe(true);
    expect(mockTriggerEvent).toHaveBeenCalledTimes(1);
    const [, , detail] = mockTriggerEvent.mock.calls[0];
    expect(detail.lastVisible.sort()).toEqual(['vis-1', 'vis-2']);
    expect(detail.hidden).toEqual([]);
  });

  it('showAllAnnotations is a no-op when nothing is hidden', () => {
    showAllAnnotations();
    expect(mockTriggerEvent).not.toHaveBeenCalled();
  });

  describe('checkAndSetAnnotationVisibility', () => {
    it('re-applies the current (visible) state and returns it without throwing', () => {
      const result = checkAndSetAnnotationVisibility('vis-1');
      expect(result).toBe(true);
    });

    it('re-applies the current (hidden) state and returns it', () => {
      setAnnotationVisibility('vis-1', false);
      mockTriggerEvent.mockClear();

      const result = checkAndSetAnnotationVisibility('vis-1');

      expect(result).toBe(false);
      expect(mockTriggerEvent).not.toHaveBeenCalled();
    });
  });

  describe('suspected product bug: missing null-guard on orphaned UIDs', () => {
    it('BUG: re-showing a hidden annotation throws once the underlying annotation has been removed', () => {
      // annotationVisibility's show()/hide() do
      // `const annotation = getAnnotation(annotationUID); annotation.isVisible = ...;`
      // with no guard for a missing annotation, unlike annotationLocking's
      // lock()/unlock() which check `if (annotation) { ... }` first (see the
      // contrast test in the annotationLocking suite). Once an annotation is
      // removed from the manager while still present in the hidden set (e.g.
      // removeAnnotation() does not touch visibility state), un-hiding it
      // throws a TypeError instead of silently clearing the stale UID.
      const orphan = makeAnnotation({ annotationUID: 'orphan-vis' });
      addAnnotation(orphan, 'FOR-1');
      setAnnotationVisibility('orphan-vis', false);
      removeAnnotation('orphan-vis');

      expect(() => setAnnotationVisibility('orphan-vis', true)).toThrow(
        TypeError
      );
    });

    it('BUG: showAllAnnotations() throws if any hidden UID has since been removed from the manager', () => {
      const orphan = makeAnnotation({ annotationUID: 'orphan-vis-2' });
      addAnnotation(orphan, 'FOR-1');
      setAnnotationVisibility('orphan-vis-2', false);
      removeAnnotation('orphan-vis-2');

      expect(() => showAllAnnotations()).toThrow(TypeError);
    });
  });
});

describe('AnnotationGroup', () => {
  let group;
  let annotation;
  const baseEvent = { viewportId: 'vp-1', renderingEngineId: 'engine-1' };

  beforeEach(() => {
    group = new AnnotationGroup();
    annotation = makeAnnotation({ annotationUID: 'group-member', data: {} });
    annotation.isVisible = true;
    addAnnotation(annotation, 'FOR-1');
    mockTriggerEvent.mockClear();
  });

  it('is visible by default and has no members', () => {
    expect(group.isVisible).toBe(true);
    expect(group.has('group-member')).toBe(false);
  });

  it('add() registers members that has() reports back', () => {
    group.add('group-member', 'another-uid');

    expect(group.has('group-member')).toBe(true);
    expect(group.has('another-uid')).toBe(true);
    expect(group.has('unrelated')).toBe(false);
  });

  it('remove() drops a member', () => {
    group.add('group-member');
    group.remove('group-member');

    expect(group.has('group-member')).toBe(false);
  });

  it('clear() drops every member', () => {
    group.add('a', 'b', 'c');
    group.clear();

    expect(group.has('a')).toBe(false);
    expect(group.has('b')).toBe(false);
  });

  it('setVisible(false) hides member annotations and triggers ANNOTATION_MODIFIED per changed annotation', () => {
    group.add('group-member');

    group.setVisible(false, baseEvent);

    expect(group.isVisible).toBe(false);
    expect(annotation.isVisible).toBe(false);
    expect(mockTriggerEvent).toHaveBeenCalledWith(
      mockEventTarget,
      Events.ANNOTATION_MODIFIED,
      { viewportId: 'vp-1', renderingEngineId: 'engine-1', annotation }
    );
  });

  it('setVisible is a no-op when the visibility flag does not change', () => {
    group.setVisible(true, baseEvent);
    expect(mockTriggerEvent).not.toHaveBeenCalled();
  });

  it('setVisible skips annotations whose isVisible already matches the target', () => {
    annotation.isVisible = false;
    group.add('group-member');

    group.setVisible(false, baseEvent);

    expect(mockTriggerEvent).not.toHaveBeenCalled();
  });

  it('setVisible respects a filter that blocks hiding for a given uid', () => {
    group.add('group-member');

    group.setVisible(false, baseEvent, () => false);

    expect(annotation.isVisible).toBe(true);
    expect(mockTriggerEvent).not.toHaveBeenCalled();
  });

  it('setVisible drops members whose annotation no longer exists', () => {
    group.add('gone-uid');

    group.setVisible(false, baseEvent);

    expect(group.has('gone-uid')).toBe(false);
  });

  describe('findNearby', () => {
    it('returns null when the group is empty', () => {
      expect(group.findNearby('anything', 1)).toBeNull();
    });

    it('returns the first member when no uid is given, moving forward', () => {
      group.add('m1', 'm2', 'm3');
      expect(group.findNearby(undefined, 1)).toBe('m1');
    });

    it('returns the next member in the forward direction', () => {
      group.add('m1', 'm2', 'm3');
      expect(group.findNearby('m1', 1)).toBe('m2');
    });

    it('returns null when already at the last member moving forward', () => {
      group.add('m1', 'm2', 'm3');
      expect(group.findNearby('m3', 1)).toBeNull();
    });

    it('returns null for a uid that is not a member', () => {
      group.add('m1', 'm2');
      expect(group.findNearby('not-a-member', 1)).toBeNull();
    });
  });
});

describe('helpers/state (direct trigger* exports)', () => {
  let annotation;

  beforeEach(() => {
    annotation = makeAnnotation({ annotationUID: 'trigger-target' });
    addAnnotation(annotation, 'FOR-1');
    mockTriggerEvent.mockClear();
  });

  describe('triggerAnnotationModified', () => {
    it('triggers ANNOTATION_MODIFIED with viewport info resolved from the element and defaults to HandlesUpdated', () => {
      const element = document.createElement('div');
      // Unlike triggerAnnotationAddedForElement, this helper destructures
      // viewportId/renderingEngineId directly off the enabled element (no
      // renderingEngine.id indirection).
      mockEnabledElements.set(element, {
        viewportId: 'viewport-mod',
        renderingEngineId: 'engine-mod',
      });

      triggerAnnotationModified(annotation, element);

      expect(mockTriggerEvent).toHaveBeenCalledWith(
        mockEventTarget,
        Events.ANNOTATION_MODIFIED,
        {
          annotation,
          viewportId: 'viewport-mod',
          renderingEngineId: 'engine-mod',
          changeType: ChangeTypes.HandlesUpdated,
        }
      );
    });

    it('triggers ANNOTATION_MODIFIED with undefined viewport info when no element is given', () => {
      triggerAnnotationModified(annotation);

      expect(mockTriggerEvent).toHaveBeenCalledWith(
        mockEventTarget,
        Events.ANNOTATION_MODIFIED,
        {
          annotation,
          viewportId: undefined,
          renderingEngineId: undefined,
          changeType: ChangeTypes.HandlesUpdated,
        }
      );
    });

    it('accepts an explicit changeType', () => {
      triggerAnnotationModified(
        annotation,
        undefined,
        ChangeTypes.StatsUpdated
      );

      expect(mockTriggerEvent).toHaveBeenCalledWith(
        mockEventTarget,
        Events.ANNOTATION_MODIFIED,
        expect.objectContaining({ changeType: ChangeTypes.StatsUpdated })
      );
    });
  });

  it('triggerAnnotationCompleted triggers ANNOTATION_COMPLETED with the annotation', () => {
    triggerAnnotationCompleted(annotation);

    expect(mockTriggerEvent).toHaveBeenCalledWith(
      mockEventTarget,
      Events.ANNOTATION_COMPLETED,
      { annotation }
    );
  });

  it('triggerContourAnnotationCompleted triggers ANNOTATION_COMPLETED with the contourHoleProcessingEnabled flag', () => {
    triggerContourAnnotationCompleted(annotation, true);

    expect(mockTriggerEvent).toHaveBeenCalledWith(
      mockEventTarget,
      Events.ANNOTATION_COMPLETED,
      { annotation, contourHoleProcessingEnabled: true }
    );
  });

  it('triggerContourAnnotationCompleted defaults contourHoleProcessingEnabled to false', () => {
    triggerContourAnnotationCompleted(annotation);

    expect(mockTriggerEvent).toHaveBeenCalledWith(
      mockEventTarget,
      Events.ANNOTATION_COMPLETED,
      { annotation, contourHoleProcessingEnabled: false }
    );
  });
});

describe('resetAnnotationManager', () => {
  // Imported lazily inside an isolated module registry so that wiring the
  // preprocessingFn onto the shared default manager singleton (which is what
  // this module does as a side effect of being imported) does not leak into
  // the rest of this file's tests, which exercise the default manager
  // without a preprocessingFn attached.
  it('resets the default manager singleton and wires up the lock/visibility/textBox preprocessing pipeline', () => {
    let resetAnnotationManager;
    let isolatedAddAnnotation;
    let isolatedGetAnnotation;
    let isolatedGetAnnotationManager;
    let isolatedSetAnnotationManager;
    let isolatedDefaultManager;
    let IsolatedManagerClass;

    jest.isolateModules(() => {
      ({
        resetAnnotationManager,
      } = require('../src/stateManagement/annotation/resetAnnotationManager'));
      ({
        addAnnotation: isolatedAddAnnotation,
        getAnnotation: isolatedGetAnnotation,
        getAnnotationManager: isolatedGetAnnotationManager,
        setAnnotationManager: isolatedSetAnnotationManager,
      } = require('../src/stateManagement/annotation/annotationState'));
      ({
        defaultFrameOfReferenceSpecificAnnotationManager:
          isolatedDefaultManager,
        default: IsolatedManagerClass,
      } = require('../src/stateManagement/annotation/FrameOfReferenceSpecificAnnotationManager'));
    });

    // Point the manager elsewhere, then confirm reset restores the default.
    const otherManager = new IsolatedManagerClass('other');
    isolatedSetAnnotationManager(otherManager);
    expect(isolatedGetAnnotationManager()).toBe(otherManager);

    resetAnnotationManager();

    expect(isolatedGetAnnotationManager()).toBe(isolatedDefaultManager);

    const annotation = makeAnnotation({ annotationUID: 'preprocessed' });
    isolatedAddAnnotation(annotation, 'FOR-1');

    const stored = isolatedGetAnnotation('preprocessed');
    expect(stored.data.cachedStats).toEqual({});
    expect(stored.data.handles.textBox).toEqual({});
    expect(stored.isLocked).toBe(false);
    expect(stored.isVisible).toBe(true);
  });
});
