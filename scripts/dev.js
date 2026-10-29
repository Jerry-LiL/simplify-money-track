#!/usr/bin/env node
// Starts the mock API and the Expo dev server together.
//   npm run dev                      -> uses ../track-api-mock (clones it if missing)
//   MOCK_DIR=/path/to/mock npm run dev
//   API_URL=http://10.0.2.2:4010 npm run dev   -> override what the app talks to
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const mockDir = path.resolve(root, process.env.MOCK_DIR || '../track-api-mock');
const port = process.env.PORT || '4010';

if (!fs.existsSync(path.join(mockDir, 'server.js'))) {
  console.log(`No mock server at ${mockDir}, cloning it...`);
  const r = spawnSync('git', ['clone', 'https://github.com/simplify-money/track-api-mock.git', mockDir], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(1);
}

function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return 'localhost';
}

const apiUrl = process.env.API_URL || `http://${lanIp()}:${port}`;
console.log(`Mock API: ${mockDir}`);
console.log(`App will call: ${apiUrl} (change it in the app's settings sheet if needed)`);

const server = spawn('node', ['server.js'], { cwd: mockDir, stdio: 'inherit', env: { ...process.env, PORT: port } });
const expo = spawn('npx', ['expo', 'start'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, EXPO_PUBLIC_API_URL: apiUrl },
});

const stop = () => {
  server.kill();
  expo.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
expo.on('exit', (code) => {
  server.kill();
  process.exit(code ?? 0);
});
