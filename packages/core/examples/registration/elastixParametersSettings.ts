const defaultNumberOfResolutions = 2;
const defaultFinalGridSpacing = 8;

const parametersSettings = {
  NumberOfResolutions: {
    inputType: 'number',
    defaultValue: defaultNumberOfResolutions,
  },
  MaximumNumberOfIterations: {
    inputType: 'number',
    defaultValue: 256,
  },
  Registration: {
    inputType: 'dropdown',
    values: [
      'MultiResolutionRegistration',
      'MultiResolutionRegistrationWithFeatures',
      'MultiMetricMultiResolutionRegistration',
    ],
  },
  Metric: {
    inputType: 'dropdown',
    values: [
      'AdvancedKappaStatistic',
      'AdvancedMattesMutualInformation',
      'AdvancedMeanSquares',
      'AdvancedNormalizedCorrelation',
      'CorrespondingPointsEuclideanDistanceMetric',
      'DisplacementMagnitudePenalty',
      'DistancePreservingRigidityPenalty',
      'GradientDifference',
      'KNNGraphAlphaMutualInformation',
      'MissingStructurePenalty',
      'NormalizedGradientCorrelation',
      'NormalizedMutualInformation',
      'PCAMetric',
      'PCAMetric2',
      'PatternIntensity',
      'PolydataDummyPenalty',
      'StatisticalShapePenalty',
      'SumOfPairwiseCorrelationCoefficientsMetric',
      'SumSquaredTissueVolumeDifference',
      'TransformBendingEnergyPenalty',
      'TransformRigidityPenalty',
      'VarianceOverLastDimensionMetric',
    ],
  },
  Interpolator: {
    inputType: 'dropdown',
    values: [
      'BSplineInterpolator',
      'BSplineInterpolatorFloat',
      'LinearInterpolator',
      'NearestNeighborInterpolator',
      'RayCastInterpolator',
      'ReducedDimensionBSplineInterpolator',
    ],
  },
  FixedImagePyramid: {
    inputType: 'dropdown',
    values: [
      'FixedGenericImagePyramid',
      'FixedRecursiveImagePyramid',
      'FixedSmoothingImagePyramid',
      'FixedShrinkingImagePyramid',
      'OpenCLFixedGenericImagePyramid',
    ],
  },
  MovingImagePyramid: {
    inputType: 'dropdown',
    values: [
      'MovingGenericImagePyramid',
      'MovingRecursiveImagePyramid',
      'MovingShrinkingImagePyramid',
      'MovingSmoothingImagePyramid',
      'OpenCLMovingGenericImagePyramid',
    ],
  },
  Optimizer: {
    inputType: 'dropdown',
    values: [
      'AdaGrad',
      'AdaptiveStochasticGradientDescent',
      'AdaptiveStochasticLBFGS',
      'AdaptiveStochasticVarianceReducedGradient',
      'CMAEvolutionStrategy',
      'ConjugateGradient',
      'ConjugateGradientFRPR',
      'FiniteDifferenceGradientDescent',
      'FullSearch',
      'Powell',
      'PreconditionedGradientDescent',
      'PreconditionedStochasticGradientDescent',
      'QuasiNewtonLBFGS',
      'RSGDEachParameterApart',
      'RegularStepGradientDescent',
      'Simplex',
      'SimultaneousPerturbation',
      'StandardGradientDescent',
    ],
  },
  Resampler: {
    inputType: 'dropdown',
    values: ['DefaultResampler', 'OpenCLResampler'],
  },
  ResampleInterpolator: {
    inputType: 'dropdown',
    values: [
      'FinalBSplineInterpolator',
      'FinalBSplineInterpolatorFloat',
      'FinalLinearInterpolator',
      'FinalNearestNeighborInterpolator',
      'FinalReducedDimensionBSplineInterpolator',
      'FinalRayCastInterpolator',
    ],
  },
  FinalBSplineInterpolationOrder: {
    inputType: 'number',
  },
  ImageSampler: {
    inputType: 'dropdown',
    values: [
      'Random',
      'RandomCoordinate',
      'Full',
      'Grid',
      'MultiInputRandomCoordinate',
      'RandomSparseMask',
    ],
  },
  NumberOfSpatialSamples: {
    inputType: 'number',
    defaultValue: 2048,
  },
  CheckNumberOfSamples: {
    inputType: 'dropdown',
    values: ['true', 'false'],
    defaultValue: 'true',
  },
  MaximumNumberOfSamplingAttempts: {
    inputType: 'number',
    defaultValue: 8,
  },
  NewSamplesEveryIteration: {
    inputType: 'dropdown',
    values: ['true', 'false'],
    defaultValue: 'true',
  },
  NumberOfSamplesForExactGradient: {
    inputType: 'number',
    defaultValue: 4096,
  },
  DefaultPixelValue: {
    inputType: 'number',
    defaultValue: 0,
  },
  AutomaticParameterEstimation: {
    inputType: 'dropdown',
    values: ['true', 'false'],
    defaultValue: 'true',
  },
  AutomaticScalesEstimation: {
    inputType: 'dropdown',
    values: ['true', 'false'],
    defaultValue: 'true',
  },
  AutomaticTransformInitialization: {
    inputType: 'dropdown',
    values: ['true', 'false'],
    defaultValue: 'true',
  },
  Metric0Weight: {
    inputType: 'number',
    defaultValue: '1.0',
    step: 0.1,
  },
  Metric1Weight: {
    inputType: 'number',
    defaultValue: '1.0',
    step: 0.1,
  },
  FinalGridSpacing: {
    inputType: 'number',
    defaultValue: defaultFinalGridSpacing,
  },
  // ResultImageFormat: {
  //   inputType: 'dropdown',
  //   values: ['mhd', 'nii', 'nrrd', 'vti'],
  // },
};

export {
  defaultNumberOfResolutions,
  defaultFinalGridSpacing,
  parametersSettings,
};
