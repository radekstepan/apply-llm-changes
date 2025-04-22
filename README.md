# Apply LLM Changes CLI (`apply-llm-changes`)

A command-line tool to read structured file modification instructions from Large Language Model (LLM) output (via stdin) and apply them to the local filesystem in the current directory.

This tool helps automate the process of creating or updating files based on code snippets and file paths provided by language models, streamlining workflows where code generation or modification instructions are received in text format.

## Core Features

*   **Reads from Standard Input:** Designed to be piped into (`llm_command | apply-llm-changes`) or receive pasted text.
*   **Multiple Format Support:** Parses several common ways LLMs indicate file paths and content:
    *   Explicit Start/End comment blocks (`
[LLM_APPLY_Processed Comment Block for path/to/file.ext]
`)
    *   Explicit XML-like tags (`
[LLM_APPLY_Processed Tag Block for path/to/file.ext]
`)
    *   Markdown code blocks preceded by a path identifier (heading, paragraph with backticks, standalone path, header comment, list item).
*   **File System Operations:**
    *   Writes extracted content to the specified relative paths.
    *   Creates necessary directories automatically.
    *   Normalizes paths (e.g., converts `\` to `/`).
*   **Safety:** Rejects absolute paths or paths attempting to navigate outside the current directory (`../`).
*   **Idempotency (Basic):** If multiple blocks specify the same file, explicit blocks generally take precedence over Markdown blocks, and warnings are issued for overwrites.

## Supported Input Formats

The tool processes input looking for these patterns:

1.  **Explicit Comment Blocks:**
    ```text
    Some introductory text...

    
[LLM_APPLY_Processed Comment Block for src/myComponent.js]


    More text...
    ```

2.  **Explicit Tag Blocks:**
    ```xml
    
[LLM_APPLY_Processed Tag Block for data/config.json]

    ```
    *(Note: `name` or `filename` can be used instead of `path`)*

3.  **Markdown Code Blocks:**
    The tool looks for standard Markdown fenced code blocks (``` ```) and attempts to identify the file path using one of the following methods (checked in roughly this order):

    *   **Preceding Heading:**
        ```markdown
        ## File: styles/main.css

        ```css
        body { margin: 0; }
        ```
    *   **Preceding Paragraph with Inline Code:**
        ```markdown
        Here is the utility function `src/utils/helper.ts`:

        ```typescript
        export const helper = () => true;
        ```
    *   **Preceding Standalone Path:**
        ```markdown
        path/to/script.py

        ```python
        import sys
        print(sys.argv)
        ```
    *   **Preceding Paragraph with Explicit Marker:**
        ```markdown
        Path: config/app.yaml

        ```yaml
        port: 8080
        ```
    *   **Header Comment in Code Block:**
        ```typescript
        /*
         * src/specialUtil.ts
         * This file contains a special utility.
         */
        export function special() {
          // ...
        }
        ```
        *(Note: The path should typically be on a line starting with `*` within the comment block)*
    *   **Preceding Numbered List Item with Bolded Path:**
        ```markdown
        Okay, here is the full source code for the modified files:

        **1. `src/component.ts`**

        ```typescript
        export class MyComponent {}
        ```
        ```

## Usage

1.  **Generate LLM Output:** Obtain the file modification instructions from your LLM using one of the supported formats.
2.  **Pipe or Paste to CLI:**
    *   **Pipe:** If the output is in a file or from another command:
        ```bash
        cat llm_output.txt | apply-llm-changes
        # or
        your_llm_command --prompt "update files..." | apply-llm-changes
        ```
    *   **Paste:** Run the command and paste the content directly into the terminal:
        ```bash
        apply-llm-changes
        ```
        (Paste your content here)
        Then press `Ctrl+D` (Linux/macOS) or `Ctrl+Z` then `Enter` (Windows) to signal the end of input.

3.  **Review Changes:** The tool will log the files it intends to write and any warnings or errors. Files will be created/overwritten in the current directory (or subdirectories). Always review changes made by automated tools.

## Local Development

To work on this tool locally:

1.  **Prerequisites:**
    *   Node.js (See `.nvmrc` for the recommended version, use `nvm use` if you have nvm)
    *   Yarn v1 (Classic)

2.  **Clone & Install:**
    ```bash
    git clone <repository-url>
    cd apply-llm-changes-cli
    yarn install
    ```

3.  **Build:** Compile TypeScript to JavaScript:
    ```bash
    yarn build
    ```
    (Output goes to the `dist/` directory)

4.  **Test:** Run the test suite:
    ```bash
    yarn test
    ```

5.  **Using `yarn link` for Local Testing:**
    `yarn link` allows you to create a global command-line alias (`apply-llm-changes`) that points directly to your local development code. This is useful for testing the command end-to-end without publishing.

    *   **Step 1: Create the link**
        In the project directory (`apply-llm-changes-cli`), run:
        ```bash
        yarn link
        ```
        This registers the package locally.

    *   **Step 2: Add Yarn's global bin directory to your PATH (If needed)**
        For your shell to find the command created by `yarn link`, the directory where Yarn places global binaries must be in your system's `PATH` environment variable. See the next section for instructions.

    *   **Step 3: Test the linked command**
        Now you should be able to run the command globally from any directory:
        ```bash
        # Example: Create a test file
        echo "**1. \`linked-test.txt\`**\n\`\`\`\nHello from linked version!\n\`\`\`" | apply-llm-changes

        # Check if linked-test.txt was created
        cat linked-test.txt
        ```

    *   **Step 4: Develop and Rebuild**
        Make changes to the source code in `src/`. After making changes, you **must rebuild** the project for the linked command to reflect those changes:
        ```bash
        yarn build
        ```
        Then you can test the `apply-llm-changes` command again.

    *   **Step 5: Unlink (When Done)**
        To remove the global command link:
        ```bash
        yarn unlink
        ```

## Adding Yarn's Global Bin Directory to PATH

If commands installed globally via Yarn (like the one created by `yarn link`) aren't found, you need to add Yarn's binary directory to your system's `PATH`.

1.  **Find the Yarn Bin Directory:**
    Run this command to see where Yarn installs global binaries:
    ```bash
    yarn global bin
    ```
    (Copy this path)

2.  **Add the Path to your Shell Configuration:**

    *   **Bash or Zsh (Common on Linux/macOS):**
        Edit your shell configuration file (`~/.bashrc` for Bash, `~/.zshrc` for Zsh):
        ```bash
        # Add this line at the end, replacing /path/to/yarn/bin with the actual path from step 1
        export PATH="$(yarn global bin):$PATH"
        ```
        Save the file and reload the configuration:
        ```bash
        source ~/.bashrc  # or source ~/.zshrc
        ```
        Or simply open a new terminal window.

    *   **Fish Shell:**
        Run this command in your terminal:
        ```bash
        fish_add_path (yarn global bin)
        ```
        This will add it persistently. Open a new terminal window.

    *   **Windows (Command Prompt / PowerShell):**
        *   Search for "Environment Variables" in the Windows search bar and select "Edit the system environment variables".
        *   Click the "Environment Variables..." button.
        *   In the "System variables" (or "User variables" if you only want it for your user) section, find the `Path` variable, select it, and click "Edit...".
        *   Click "New" and paste the directory path you copied from `yarn global bin`.
        *   Click "OK" on all dialog windows.
        *   **Important:** You need to **open a new Command Prompt or PowerShell window** for the changes to take effect.

3.  **Verify:**
    Open a **new** terminal window and try running a globally linked command or check your path:
    ```bash
    echo $PATH # (Linux/macOS/Fish)
    # or
    echo %PATH% # (Windows CMD)
    # or
    $env:Path # (Windows PowerShell)
    ```
    You should see the Yarn bin directory listed.

## License

MIT (See `package.json`)
