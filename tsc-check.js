const { spawnSync } = require('child_process');

console.log('Checking TypeScript installation...');

// Check TypeScript version
const tscVersion = spawnSync('npx', ['tsc', '--version'], { encoding: 'utf8', shell: true });
console.log('\nTypeScript version:');
console.log(tscVersion.stdout || 'Not found');
if (tscVersion.stderr) console.error(tscVersion.stderr);

// Check Node.js version
console.log('\nNode.js version:');
console.log(process.version);

// Check npm version
const npmVersion = spawnSync('npm', ['--version'], { encoding: 'utf8', shell: true });
console.log('\nnpm version:');
console.log(npmVersion.stdout || 'Not found');

// List installed TypeScript
const npmList = spawnSync('npm', ['list', 'typescript'], { encoding: 'utf8', shell: true });
console.log('\nInstalled TypeScript:');
console.log(npmList.stdout || 'Not found');

// Try a simple TypeScript compile
console.log('\nTrying a simple TypeScript compile:');
const simpleCompile = spawnSync('npx', ['tsc', '--noEmit', '--listFiles'], { encoding: 'utf8', shell: true });
console.log('Exit code:', simpleCompile.status);
if (simpleCompile.stdout) console.log('Files found:', simpleCompile.stdout.split('\n').length);
if (simpleCompile.stderr) console.error('Error:', simpleCompile.stderr);

console.log('\nDiagnostic complete');
