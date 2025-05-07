# 🔄 Apply LLM Changes

A command-line tool that applies file changes from LLM output to your local filesystem.

## ✨ Features

- 🤖 **AI-Powered Path Detection**: Uses LLM to determine file paths from markdown code blocks
- 📁 **Explicit Path Support**: Handles `<file>` tags with direct path specification
- 🔍 **Smart Configuration**: Auto-detects Infisical in your working directory
- 🔒 **Secure**: Rejects absolute paths or directory traversal attempts
- 🧠 **Context-Aware**: Preserves code context and formatting

## 🚀 Quick Start

1. **Install prerequisites**:
   ```bash
   # Optional but recommended for secrets management
   npm install -g @infisical/cli
   ```

2. **Set up your environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your LLM API credentials
   ```

3. **Run the tool**:
   ```bash
   # Pipe LLM output from a file
   cat llm_response.md | apply-llm-changes
   
   # Or paste content directly (press Ctrl+D when done)
   apply-llm-changes
   ```

## 📝 Input Formats

### 1. Explicit File Tags

```xml
<file path="src/utils/helper.js">
function helper() {
  return 'I help!';
}
export default helper;
</file>
```

### 2. Markdown Code Blocks

The LLM will determine the most likely path based on context:

```markdown
Update the helper function:

```javascript
// src/utils/helper.js
function helper() {
  return 'I help even more!';
}
export default helper;
```
```

## 🔧 Configuration

- **Environment Variables**: Configure in `.env` file
  - `LLM_API_KEY`: Your API key
  - `LLM_API_BASE_URL`: API endpoint URL
  - `LLM_MODEL`: Model to use (optional)

- **Infisical Integration**:
  - Tool automatically detects `.infisical.json` in your working directory
  - Falls back to direct execution if not found

## 🛠️ Development

```bash
# Build
yarn build

# Test
yarn test

# Link for global usage
yarn link

# Run locally
echo '```js\n// test.js\nconsole.log("Test");\n```' | yarn start
```

## 📜 License

MIT
