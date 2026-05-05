import BaseTool from './BaseTool';

class TestTool extends BaseTool {
  public getImageId(targetId: string): string {
    return this.getImageIdFromTargetId(targetId);
  }
}

describe('BaseTool', () => {
  it('keeps image IDs intact when they contain the target-id delimiter', () => {
    const tool = new TestTool({}, { supportedInteractionTypes: [] });
    const imageId =
      'wadouri:https://example.com/dicom?redirect=imageId:series-1';

    expect(tool.getImageId(`imageId:${imageId}`)).toBe(imageId);
  });
});
