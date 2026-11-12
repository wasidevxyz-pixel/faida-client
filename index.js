const { spawn } = require('child_process');
const path = require('path');

const backendDir = path.join(__dirname, 'Backend');
const command = `cd ${backendDir} && npm run dev`;

const shell = process.platform === 'win32' ? 'cmd' : 'sh';
const shellFlag = process.platform === 'win32' ? '/c' : '-c';

const child = spawn(shell, [shellFlag, command], { stdio: 'inherit' });

child.on('close', (code) => {
  console.log(`Backend process exited with code ${code}`);
  process.exit(code);
});

['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => {
    child.kill(sig);
  });
});
