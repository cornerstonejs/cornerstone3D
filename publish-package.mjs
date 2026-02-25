import { execa } from 'execa';

async function run() {
  const { stdout: branchName } = await execa('git', [
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
  ]);

  const args = ['publish', '-r', '--no-git-checks', '--access', 'public'];

  if (branchName !== 'main') {
    args.push('--tag', 'beta');
  }

  await execa('pnpm', args, { stdio: 'inherit' });

  console.log('Finished');
}

run().catch((err) => {
  console.error('Error encountered during package publish:', err);
  process.exit(1);
});
