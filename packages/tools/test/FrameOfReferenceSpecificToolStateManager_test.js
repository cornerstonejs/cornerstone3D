import * as csTools from '../src/index.js';
import * as cornerstone3D from '@cornerstonejs/core';

const annotationManager = csTools.annotation.state.getAnnotationManager();

const FrameOfReferenceUID = 'MY_FRAME_OF_REFERENCE_UID';

const TOOLNAME_0 = 'toolName_0';
const TOOLNAME_1 = 'toolName_1';

const annotationUID0 = 'annotation_000';
const annotationUID1 = 'annotation_001';

function addAndReturnToolName0Annotation() {
  const annotation = {
    metadata: {
      viewPlaneNormal: [0, 0, 1],
      annotationUID: annotationUID0,
      FrameOfReferenceUID,
      toolName: TOOLNAME_0,
    },
    data: {
      handles: {
        points: [
          [0, 0, 0],
          [0, 0, 1],
        ],
      },
    },
  };

  annotationManager.addAnnotation(annotation, FrameOfReferenceUID);

  return annotation;
}

function addAndReturnToolName1Annotation() {
  const annotation = {
    metadata: {
      viewPlaneNormal: [0, 0, 1],
      annotationUID: annotationUID1,
      FrameOfReferenceUID,
      toolName: TOOLNAME_1,
    },
    data: {
      handles: {
        points: [
          [1, 1, 0],
          [1, 2, 0],
        ],
      },
    },
  };

  annotationManager.addAnnotation(annotation, FrameOfReferenceUID);

  return annotation;
}

describe('FrameOfReferenceSpecificAnnotationManager:', () => {
  beforeAll(function () {
    cornerstone3D.setUseCPURendering(false);
    csTools.init();
  });

  afterAll(function () {
    csTools.destroy();
  });

  beforeEach(() => {
    // Reset the annotationManager
    annotationManager.restoreAnnotations({});
  });

  it('should correctly add annotations and delete it', () => {
    const annotation = addAndReturnToolName0Annotation();

    annotationManager.removeAnnotation(annotation.annotationUID);

    const undefinedAnnotation = annotationManager.getAnnotation(annotationUID0);

    expect(undefinedAnnotation).toBeUndefined();
  });
  it('should correctly add annotations and get it by its UID using different levels of efficient filtering', () => {
    const annotation = addAndReturnToolName0Annotation();
    const { metadata, annotationUID } = annotation;
    const { FrameOfReferenceUID, toolName } = metadata;

    const annotationFoundByAnnotationUID =
      annotationManager.getAnnotation(annotationUID);

    const annotationFoundByAnnotationUIDAndFoR =
      annotationManager.getAnnotation(annotationUID);

    const annotationFoundByToolAllFilters =
      annotationManager.getAnnotation(annotationUID);

    expect(annotation).toEqual(annotationFoundByAnnotationUID);
    expect(annotation).toEqual(annotationFoundByAnnotationUIDAndFoR);
    expect(annotation).toEqual(annotationFoundByToolAllFilters);
  });
  it('should get various parts of the annotations hierarchy', () => {
    const annotation = addAndReturnToolName0Annotation();
    const { metadata, annotationUID } = annotation;
    const { FrameOfReferenceUID, toolName } = metadata;

    const toolSpecificAnnotationsForFrameOfReference =
      annotationManager.saveAnnotations(FrameOfReferenceUID, toolName);

    const frameOfReferenceSpecificAnnotations =
      annotationManager.saveAnnotations(FrameOfReferenceUID);

    const annotations = annotationManager.saveAnnotations();

    expect(toolSpecificAnnotationsForFrameOfReference[0].annotationUID).toEqual(
      annotationUID
    );
    expect(frameOfReferenceSpecificAnnotations[toolName]).toBeDefined();
    expect(annotations[FrameOfReferenceUID]).toBeDefined();
  });

  it('should restore various parts of the annotations to the annotationManager', () => {
    const annotation_0 = addAndReturnToolName0Annotation();
    const annotation_1 = addAndReturnToolName1Annotation();
    const metadata_0 = annotation_0.metadata;
    const metadata_1 = annotation_1.metadata;

    // Make copy of annotations
    const annotations = annotationManager.saveAnnotations();

    // Reset annotations.
    annotationManager.restoreAnnotations({});

    const toolName1toolSpecificAnnotations =
      annotations[FrameOfReferenceUID][metadata_1.toolName];

    const frameOfReferenceSpecificAnnotations =
      annotations[FrameOfReferenceUID];

    // Restore tool only specific annotations for annotations 1 only.
    annotationManager.restoreAnnotations(
      toolName1toolSpecificAnnotations,
      FrameOfReferenceUID,
      metadata_1.toolName
    );

    const annotationsOfTool1 = annotationManager.saveAnnotations();

    expect(
      annotationsOfTool1[FrameOfReferenceUID][metadata_1.toolName]
    ).toBeDefined();
    expect(
      annotationsOfTool1[FrameOfReferenceUID][metadata_0.toolName]
    ).toBeUndefined();

    // Reset annotations.
    annotationManager.restoreAnnotations({});

    // Restore annotations for FrameOfReference
    annotationManager.restoreAnnotations(
      frameOfReferenceSpecificAnnotations,
      FrameOfReferenceUID
    );

    const frameOfReferenceAnnotations = annotationManager.saveAnnotations();

    expect(frameOfReferenceAnnotations[FrameOfReferenceUID]).toBeDefined();
    expect(
      frameOfReferenceAnnotations[FrameOfReferenceUID][metadata_1.toolName]
    ).toBeDefined();
    expect(
      frameOfReferenceAnnotations[FrameOfReferenceUID][metadata_0.toolName]
    ).toBeDefined();

    annotationManager.restoreAnnotations({});

    // Restore entire annotations
    annotationManager.restoreAnnotations(annotations);

    const newlySavedAnnotations = annotationManager.saveAnnotations();

    expect(newlySavedAnnotations[FrameOfReferenceUID]).toBeDefined();
    expect(
      newlySavedAnnotations[FrameOfReferenceUID][metadata_1.toolName]
    ).toBeDefined();
    expect(
      newlySavedAnnotations[FrameOfReferenceUID][metadata_0.toolName]
    ).toBeDefined();
  });

  it('Should remove annotations by UID using different levels of efficient filtering', () => {
    const annotation = addAndReturnToolName0Annotation();
    const { metadata, annotationUID } = annotation;
    const { FrameOfReferenceUID, toolName } = metadata;

    let undefinedAnnotation;

    const annotationsSnapshot = annotationManager.saveAnnotations();

    // Remove annotation by UID, and check it was removed.
    annotationManager.removeAnnotation(annotationUID);
    undefinedAnnotation = annotationManager.getAnnotation(annotationUID);
    expect(undefinedAnnotation).toBeUndefined();

    // Restore annotations
    annotationManager.restoreAnnotations(annotationsSnapshot);

    // Remove annotation by UID and FrameOfReferenceUID, and check it was removed.
    annotationManager.removeAnnotation(annotationUID);
    undefinedAnnotation = annotationManager.getAnnotation(annotationUID);
    expect(undefinedAnnotation).toBeUndefined();

    // Restore annotations
    annotationManager.restoreAnnotations(annotationsSnapshot);

    // Remove annotation by UID, FrameOfReferenceUID and toolName, and check it was removed.
    annotationManager.removeAnnotation(annotationUID);
    undefinedAnnotation = annotationManager.getAnnotation(annotationUID);
    expect(undefinedAnnotation).toBeUndefined();
  });
});
