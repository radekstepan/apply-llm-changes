# Apply LLM Changes CLI (`apply-llm-changes`)

A command-line tool that reads structured file modification instructions from Large Language Model (LLM) output (via stdin) and applies them to the local filesystem in the current working directory.

This tool uses an LLM (like GPT models via OpenAI API, LM Studio, etc.) to determine the intended file path for standard markdown code blocks and explicitly handles `` tags directly, extracting the path and content. These tags take precedence over LLM-detected paths for the same file.
*   **File System Operations:**
    *   Writes extracted content to the specified relative paths within the current working directory.
    *   Creates necessary directories automatically.
    *   Normalizes paths (e.g., converts `\` to `/`).
*   **Safety:** Rejects absolute paths or paths attempting to navigate outside the current directory (`../`).
*   **Environment Variable Management:** Uses Infisical (via `infisical run`) to securely load API keys and other configurations from `.env` files.

## Supported Input Formats

The tool processes input looking for these patterns:

1.  **Explicit `<file>` Tags:**
    These tags provide a clear path and content. The path attribute is mandatory.

    ```xml
    
    ```
    *(Note: The content inside the tags is written to the specified `path`.)*

2.  **Standard Markdown Code Blocks:**
    For fenced code blocks (``` ```), the tool sends the code snippet (and surrounding text context) to the configured LLM to determine the most likely relative file path.

    ```markdown
    Here's the updated utility function:

    ```typescript
    // src/utils/helpers.ts  <- LLM might infer path from comments or context
    export function newHelper(): boolean {
      console.log("Using new helper!");
      return true;
    }
    ```

    And the main application file:

    ```javascript
    // src/app.js
    import { newHelper } from './utils/helpers';

    console.log('App started');
    newHelper();
    ```
    *(Note: The LLM's accuracy in determining the path depends on the model used and the clarity of the input context.)*

**Precedence:** If both a `<file>` tag and a markdown block resolve to the same file path, the content from the `<file>` tag will be used, and the markdown block for that path will be skipped.

## Setup

1.  **Prerequisites:**
    *   Node.js (See `.nvmrc` for the recommended version, use `nvm use` if you have nvm)
    *   Yarn v1 (Classic)
    *   Infisical CLI (for environment variable management): `npm install -g @infisical/cli`

2.  **Clone & Install:**
    ```bash
    git clone https://github.com/your-username/apply-llm-changes-cli.git # Replace with actual URL
    cd apply-llm-changes-cli
    yarn install
    ```

3.  **Configure Environment:**
    *   Copy the example environment file: `cp .env.example .env`
    *   Edit the `.env` file and provide your LLM credentials:
        *   `LLM_API_KEY`: Your API key (e.g., `OPENAI_API_KEY` if using OpenAI). If the value is the *name* of another environment variable (like `OPENAI_API_KEY`), the tool will use the value of that variable.
        *   `LLM_API_BASE_URL`: The base URL for your LLM API endpoint (e.g., `https://api.openai.com/v1/` or your LM Studio URL like `http://localhost:1234/v1/`).
        *   `LLM_MODEL`: (Optional) The model identifier (e.g., `gpt-4o-mini`, `google/gemma-2-27b-it`). Defaults to `gpt-4o-mini`.

4.  **(Optional) Infisical Login:**
    If you plan to use Infisical for more advanced secret management (beyond the local `.env` file), log in:
    ```bash
    infisical login
    ```
    Follow the prompts. The `.infisical.json` file links this project to an Infisical workspace. The `infisical run` command used in scripts will automatically inject secrets based on your setup. For basic local `.env` usage, Infisical simply acts as a loader.

## Usage

1.  **Generate LLM Output:** Obtain the file modification instructions from your LLM using one of the supported formats (`<file>` tags or markdown code blocks).
2.  **Pipe or Paste to CLI:**
    *   **Pipe:** If the output is in a file or from another command:
        ```bash
        cat llm_output.md | apply-llm-changes
        # or
        your_llm_command --prompt "update files..." | apply-llm-changes
        ```
    *   **Paste:** Run the command and paste the content directly into the terminal:
        ```bash
        apply-llm-changes
        ```
        (Paste your content here)
        Then press `Ctrl+D` (Linux/macOS) or `Ctrl+Z` then `Enter` (Windows) to signal the end of input.

3.  **Review Changes:** The tool will log the files it intends to write (based on `<file>` tags or LLM responses) and any warnings or errors. Files will be created/overwritten in the *current working directory* (or subdirectories relative to it). **Always review changes made by automated tools.**

## Local Development

1.  **Setup:** Follow the Setup steps above.
2.  **Build:** Compile TypeScript to JavaScript:
    ```bash
    yarn build
    ```
    (Output goes to the `dist/` directory. The `bin/apply-llm-changes.js` wrapper points to this.)
3.  **Test:** Run the test suite (uses Infisical to load `.env` for LLM credentials):
    ```bash
    yarn test
    ```
4.  **Run Locally:** Execute the compiled script (using Infisical to load `.env`):
    ```bash
    # Example: Pipe test input
    echo '' | yarn start
    ```
5.  **Linking for Global Use (`yarn link`):**
    To test the `apply-llm-changes` command globally using your local code:
    *   **Step 1: Create the link**
        In the project directory:
        ```bash
        yarn link
        ```
    *   **Step 2: Add Yarn's global bin to PATH (If needed)**
        Ensure Yarn's global binary directory is in your system `PATH`. Find the directory:
        ```bash
        yarn global bin
        ```
        Add this path to your shell's configuration (`.bashrc`, `.zshrc`, etc.) or system environment variables. See detailed instructions [here](https://classic.yarnpkg.com/en/docs/cli/global#toc-adding-the-install-location-to-your-path).
    *   **Step 3: Test the linked command**
        From any directory:
        ```bash
        echo '```js\n// linked-test.js\nconsole.log("Linked!");\n```' | apply-llm-changes
        cat linked-test.js
        ```
    *   **Step 4: Develop and Rebuild**
        Make code changes in `src/`. **Rebuild** after changes:
        ```bash
        yarn build
        ```
        The linked `apply-llm-changes` command will now use the updated code.
    *   **Step 5: Unlink (When Done)**
        ```bash
        yarn unlink
        ```

## License

MIT
