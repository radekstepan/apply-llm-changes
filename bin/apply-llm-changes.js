#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');

// Determine the path to the actual compiled script (dist/index.js)
// __dirname points to the 'bin' directory where this wrapper lives.
// We need to go up one level and then into 'dist'.
const scriptPath = path.resolve(__dirname, '../dist/index.js');

// Prepare the arguments for the 'npx' command
const args = [
    '@infisical/cli',        // Command for npx to execute
    'run',                   // Infisical command
    '--',                    // Separator for the command Infisical should run
    'node',                  // The runtime for our actual script
    scriptPath,              // The path to our actual script
    ...process.argv.slice(2) // Pass along any arguments originally given to apply-llm-changes
];

// Optional: Log the command being executed for debugging
// console.log(`Wrapper executing: npx ${args.map(arg => arg.includes(' ') ? `"${arg}"` : arg).join(' ')}`);

// Execute 'npx' with the prepared arguments
const child = spawn('npx', args, {
    // Ensure stdin, stdout, and stderr are connected correctly
    // so you can still paste input and see output/errors.
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
        // console.error(`Wrapper: Child process killed with signal ${signal}`); // Optional log
        // Simulate signal exit if possible, otherwise exit(1)
        process.kill(process.pid, signal);
    } else {
        // console.log(`Wrapper: Child process finished with code ${code}.`); // Optional log
        process.exit(code === null ? 1 : code); // Exit with the child's code
    }
});
