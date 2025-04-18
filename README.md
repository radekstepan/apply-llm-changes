# Apply LLM Changes CLI (`apply-llm-changes`)

A command-line tool to read structured file modification instructions from LLM output (via stdin) and apply them to the current directory.

This tool helps automate the process of creating or updating files based on code snippets and file paths provided by language models.

## Features

*   Parses input from standard input (stdin).
*   Detects file blocks using multiple common formats:
    *   Explicit comment markers: `/* START OF path/to/file */ ... /* END OF path/to/file */`
    *   Explicit XML-like tags: `<file path="path/to/file"> ... </file>`
    *   Implicit format: A line indicating a file path (e.g., `path/to/file.ts:`, `File: path/to/file.md`) followed immediately by a fenced code block (``` ```).
*   Creates necessary directories recursively.
*   Overwrites existing files with the new content provided.
*   Provides informative console output during processing.

## Installation (Local Global Linking)

This tool is intended for local development use. Use `yarn link` to make the command available globally on your system without publishing to a registry.

1.  **Clone or Download:** Get the source code for this tool.
    ```bash
    # If you have it in a git repo:
    # git clone <your-repo-url>
    cd llm-apply-cli
    ```
2.  **Install Dependencies:**
    ```bash
    yarn install
    ```
3.  **Build the Tool:**
    ```bash
    yarn build
    ```
    This compiles the TypeScript source code into JavaScript in the `dist` directory.
4.  **Link the Command:**
    ```bash
    yarn link
    ```
    This creates a global symbolic link for the `apply-llm-changes` command, pointing to the executable script within this project directory.

## Troubleshooting: "command not found" after linking

If you open a new terminal window after running `yarn link` and get a "command not found" error when trying to run `apply-llm-changes`, it usually means the directory where Yarn places global links isn't included in your system's `PATH` environment variable.

**1. Find Yarn's Global Bin Directory:**
   Run this command to find out where Yarn *thinks* it put the link:
   ```bash
   yarn global bin


Copy the path it outputs (e.g., /home/user/.config/yarn/global/node_modules/.bin, C:\Users\user\AppData\Local\Yarn\bin).

2. Check Your PATH:
In the new terminal where the command failed, check if the path from step 1 is listed:

Linux/macOS: echo $PATH

Windows (PowerShell): $env:Path

Windows (Cmd): echo %PATH%

3. Temporary Fix (Current Terminal Only):
If the path is missing, you can add it temporarily to your current terminal session to test:

Linux/macOS (bash/zsh):
bash # Replace "/path/to/yarn/global/bin" with the actual path from step 1 export PATH="/path/to/yarn/global/bin:$PATH"

Windows (PowerShell):
powershell # Replace "C:\path\to\yarn\global\bin" with the actual path from step 1 $env:Path = "C:\path\to\yarn\global\bin;" + $env:Path
Now, try running apply-llm-changes --help (or just apply-llm-changes) in that same terminal. If it works, the PATH was the issue.

4. Permanent Fix:
To make the change permanent, you need to add the export PATH... (Linux/macOS) or modify the Path environment variable (Windows) through your system settings or shell configuration files (~/.bashrc, ~/.zshrc, ~/.profile, etc.). Search online for "add directory to PATH permanently" for your specific operating system and shell for detailed instructions. Remember to restart your terminal after making permanent changes.

Usage

Navigate to the root directory of the project where you want the files to be created or modified.

cd /path/to/your/target/project
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
Bash
IGNORE_WHEN_COPYING_END

Copy the entire output from your LLM that contains the file instructions.

Run the command in your terminal:

apply-llm-changes
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
Bash
IGNORE_WHEN_COPYING_END

The script will print: Waiting for LLM output via stdin...

Paste the copied LLM output directly into the terminal.

Signal the end of the input (End-of-File):

Linux / macOS: Press Ctrl+D

Windows (Cmd / PowerShell): Press Ctrl+Z, then press Enter

The script will parse the pasted input, identify file blocks, create/update the files relative to your current directory, and print a summary.

Example Input Format (will detect any of these):

Here are the files:

/* START OF src/components/Button.tsx */
export function Button() {
  return <button>Click Me</button>;
}
/* END OF src/components/Button.tsx */

<file path="src/styles/main.css">
body {
  font-family: sans-serif;
}
</file>

Updating src/config.json:
```json
{
  "apiKey": "YOUR_API_KEY"
}
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
IGNORE_WHEN_COPYING_END
## Development

1.  Clone the repository.
2.  Run `yarn install`.
3.  Make changes in the `src/` directory.
4.  Run `yarn build` to compile the changes. The linked `apply-llm-changes` command will automatically use the updated `dist/index.js`.
5.  For quick testing without building, you can run `yarn dev` inside the `llm-apply-cli` directory, which uses `ts-node`. Note that `yarn dev` itself will wait for stdin input.

## Uninstallation (Unlinking)

To remove the global `apply-llm-changes` command:

1.  Navigate back to the `llm-apply-cli` directory where you ran `yarn link` initially.
2.  Run:
    ```bash
    yarn unlink
    ```

This removes the symbolic link, but the project files remain.
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
IGNORE_WHEN_COPYING_END
