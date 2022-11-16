import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';

/**
 * Receives a list of imageids possibly referring to multiframe dicom images 
 * and returns a list of imageid where each imageid referes to one frame.
 * For each imageId representing a multiframe image with n frames, 
 * it will create n new imageids, one for each frame, and returns the new list of imageids
 * If a particular imageid no refer to a mutiframe image data, it will be just copied into the new list
 * @returns new list of imageids where each imageid represents a frame
 */
export default function convertMultiframeImageIds(imageIds)
{
   const newImageIds = [];
   imageIds.forEach((imageId) => {
     const imageIdFrameless = imageId.slice(0, imageId.indexOf('/frames/') + 8);

     const instanceMetaData = cornerstoneWADOImageLoader.wadors.metaDataManager.get(imageId);
     if (instanceMetaData && instanceMetaData['00280008'])
     {
        const NumberOfFrames = cornerstoneWADOImageLoader.wadors.metaDataManager.getValue(instanceMetaData['00280008']);
        if (NumberOfFrames > 1)
        {
          for (let i = 0; i < NumberOfFrames; i++) 
          {
              const newMetadata = cornerstoneWADOImageLoader.wadors.metaDataManager.get(imageIdFrameless + (i+1));
              const newImageId = imageIdFrameless + (i+1);
              if (newMetadata)
                newImageIds.push(newImageId);
          }
        }
        else
          newImageIds.push(imageId);
  
     }
     else
        newImageIds.push(imageId);
   });
   return newImageIds;    
}
 