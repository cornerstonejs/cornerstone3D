type ScrollOptions = {
  // can be positive or negative
  delta: number;
  volumeId?: string;
  debounceLoading?: boolean;
  loop?: boolean;
  scrollSlabs?: boolean;
};

export default ScrollOptions;
