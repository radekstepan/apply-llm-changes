#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');
// No longer need 'fs' for this approach

// Determine the project root directory (where package.json is)
const projectRoot = path.resolve(__dirname, '..');

// Determine the path to the actual compiled script (dist/index.js)
const scriptPath = path.join(projectRoot, 'dist/index.js');

// Prepare the arguments for the 'npx' command
const args = [
    'run',
    // Add the flag pointing to the project root where Infisical config should be found
    `--project-config-dir=${projectRoot}`,
    '--',                    // Separator for the command Infisical should run
    'node',                  // The runtime for our actual script
    scriptPath,              // The path to our actual script
    ...process.argv.slice(2) // Pass along any arguments originally given to apply-llm-changes
];

// Execute 'infisical' with the prepared arguments
console.log(`Wrapper executing: infisical ${args.map(arg => arg.includes(' ') ? `"${arg}"` : arg).join(' ')}`); // Debug log
const child = spawn('infisical', args, {
    // Use 'inherit' to connect stdin/stdout/stderr directly.
    // No need to change 'env' or 'cwd' here. Infisical uses the flag,
    // and 'node' runs in the user's original CWD by default.
    stdio: 'inherit'
});

// Handle potential errors during spawning itself
child.on('error', (err) => {
    console.error('Wrapper failed to spawn process:', err);
    process.exit(1); // Exit with an error code
});

// Relay the exit code/signal from the child process
child.on('exit', (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
    } else {
        process.exit(code === null ? 1 : code); // Exit with the child's code
    }
});
