import { execa } from 'execa';

async function run() {
  const { stdout: branchName } = await execa('git', [
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
  ]);

  if (branchName === 'main') {
    await execa('npx', [
      'lerna',
      'publish',
      'from-package',
      '--no-verify-access',
      '--yes',
    ]);
  } else {
    // publish beta versions
    await execa('npx', [
      'lerna',
      'publish',
      'from-package',
      '--no-verify-access',
      '--yes',
      '--dist-tag',
      'beta',
    ]);
  }

  console.log('Finished');
}

run().catch((err) => {
  console.error('Error encountered during package publish:', err);
  process.exit(1);
});
