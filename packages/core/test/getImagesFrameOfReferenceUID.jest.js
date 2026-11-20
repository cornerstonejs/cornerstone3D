import getImagesFrameOfReferenceUID from '../src/utilities/getImagesFrameOfReferenceUID';

describe('getImagesFrameOfReferenceUID', () => {
  it('gives the frame of reference of the images that an array holds now, after the application changed the array', () => {
    const imageIds = ['wadouri:g1-a'];
    const ofA = getImagesFrameOfReferenceUID(imageIds);

    imageIds[0] = 'wadouri:g1-b';

    expect(getImagesFrameOfReferenceUID(imageIds)).toBe(
      getImagesFrameOfReferenceUID(['wadouri:g1-b'])
    );
    expect(getImagesFrameOfReferenceUID(imageIds)).not.toBe(ofA);

    imageIds.push('wadouri:g1-a');

    expect(getImagesFrameOfReferenceUID(imageIds)).toBe(
      getImagesFrameOfReferenceUID(['wadouri:g1-a', 'wadouri:g1-b'])
    );
  });
});
