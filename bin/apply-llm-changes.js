#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Determine the directory where changes are being applied (current working directory)
const workingDirectory = process.cwd();

// Check if .infisical.json exists in the working directory
const infisicalCheck = () => {
  const infisicalPath = path.join(workingDirectory, '.infisical.json');
  if (fs.existsSync(infisicalPath)) {
    return { exists: true, path: infisicalPath, dir: workingDirectory };
  }

  // If not in working directory, use project root as fallback
  const projectRoot = path.resolve(__dirname, '..');
  const projectInfisicalPath = path.join(projectRoot, '.infisical.json');
  if (fs.existsSync(projectInfisicalPath)) {
    return { exists: true, path: projectInfisicalPath, dir: projectRoot };
  }

  return { exists: false };
};

// Determine the project root directory (location of package.json)
const projectRoot = path.resolve(__dirname, '..');

// Path to the compiled main script
const scriptPath = path.join(projectRoot, 'dist/index.js');

// Check for Infisical config
const infisicalConfig = infisicalCheck();

// Decide whether to use infisical or run directly
if (infisicalConfig.exists) {
  console.log(`Found Infisical config at: ${infisicalConfig.path}`);

  // Prepare arguments for 'infisical run'
  // This wrapper ensures environment variables are loaded via Infisical
  // before executing the actual Node.js script.
  const args = [
    'run',
    // Point Infisical to the directory with the configuration (.infisical.json, .env)
    `--project-config-dir=${infisicalConfig.dir}`,
    '--', // Separator: Arguments after this are for the command Infisical runs
    'node', // The runtime
    scriptPath, // The script to execute
    ...process.argv.slice(2), // Pass through any arguments given to the wrapper script
  ];

  // Execute 'infisical run' with the constructed arguments
  // console.log(`Wrapper executing: infisical ${args.map((arg) => (arg.includes(' ') ? `"${arg}"` : arg)).join(' ')}`); // Uncomment for debugging
  const child = spawn('infisical', args, {
    // Connect stdin, stdout, stderr directly to the parent process
    // This allows piping input and seeing output as if running the script directly.
    stdio: 'inherit',
  });

  // Handle errors during the spawn process itself (e.g., 'infisical' not found)
  child.on('error', (err) => {
    console.error('Wrapper failed to spawn Infisical process:', err);
    console.log('Falling back to direct execution without Infisical...');
    runDirectly();
  });

  // Relay the exit code or signal from the child process (infisical run)
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal); // Propagate signal termination
    } else {
      process.exit(code === null ? 1 : code); // Exit with the child's exit code
    }
  });
} else {
  console.log(
    'No Infisical config found. Running directly without secrets management.'
  );
  runDirectly();
}

function runDirectly() {
  // Run the script directly without Infisical
  const nodeChild = spawn('node', [scriptPath, ...process.argv.slice(2)], {
    stdio: 'inherit',
  });

  nodeChild.on('error', (err) => {
    console.error('Failed to spawn Node process:', err);
    process.exit(1);
  });

  nodeChild.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code === null ? 1 : code);
    }
  });
}
