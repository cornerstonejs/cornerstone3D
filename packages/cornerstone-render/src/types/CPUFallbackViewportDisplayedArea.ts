type CPUFallbackViewportDisplayedArea = {
  tlhc: {
    x: number;
    y: number;
  };
  brhc: {
    x: number;
    y: number;
  };
  rowPixelSpacing: number;
  columnPixelSpacing: number;
  presentationSizeMode: string;
};

export default CPUFallbackViewportDisplayedArea;
