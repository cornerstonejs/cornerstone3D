import { runAllPolylineTests } from './testPolylineOperations';

// Simple test runner
console.log('Starting Polyline Operations Tests...\n');

try {
  runAllPolylineTests();
} catch (error) {
  console.error('Test execution failed:', error);
}

console.log('\nTest execution completed.');
