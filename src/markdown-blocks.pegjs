{
  const DEBUG = true;

  function normalizePath(pathStr) {
    const normalized = pathStr
      .trim()
      // convert **any** backslash into forward‑slash
      .replace(/\\/g, '/')
      // collapse runs of multiple slashes into a single slash
      .replace(/\/+/g, '/');
    if (DEBUG) console.log(
      `[NormalizePath] Input: "${pathStr}", Output: "${normalized}"`
    );
    return normalized;
  }

  function logMatch(ruleName, success, text) {
    if (!DEBUG) return;
    const status = success ? "MATCH" : "FAIL";
    const snippet = text.replace(/\n/g, '\\n').substring(0, 60);
    console.log(`[PEG ${status}] ${ruleName} T:"${snippet}"`);
  }
}

Document
  = segments:Segment* EOF {
      if (DEBUG) console.log("[Document] EOF reached.");
      // only keep the real Markdown‑Block segments
      return segments.filter(s => s && s.format === "Markdown Block");
    }

Segment
  = FileBlock
  / IgnorableContent

// A “FileBlock” is: a path‑line + optional blanks + a fenced code block
FileBlock
  = &(PathIndicatorLine)
    indicator:PathIndicatorLine
    blanks:BlankLine*
    block:CodeBlock {
      logMatch("FileBlock", true, `Path: ${indicator.path}`);
      return {
        path: indicator.path,
        content: block,
        format: "Markdown Block"
      };
    }

// Everything else (code or text) we don’t care about
IgnorableContent
  = !(PathIndicatorLine BlankLine* CodeBlock)
    consumed:( CodeBlock / IgnorableLine ) {
      return null;
    }

PathIndicatorLine
  = content:( StandalonePathLine
            / PathInHeading
            / PathInParagraph
            )
    (Newline / EOF)
    { return content; }

BlankLine
  = Indent Newline { return null; }

IgnorableLine
  = line:$( (!Newline .)* ) Newline {
      logMatch("IgnorableLine", true, line);
      return null;
    }

// 1) A line that is *just* a path (standalone)
StandalonePathLine
  = Indent path:FilePath {
      return { path: normalizePath(path) };
    }

// 2) A Markdown heading like “## File: foo/bar.ext”
PathInHeading
  = HASH+ Indent
    (PathMarker ":"? Indent)? 
    path:FilePath "`"? {
      return { path: normalizePath(path) };
    }

// 3) A *paragraph* line that contains exactly one backticked path
PathInParagraph
  = !CodeFenceStart
    Indent
    $((!"`" .)*)
    "`" path:FilePath "`"
    $((!Newline .)*)
    {
      logMatch("PathInParagraph", true, text());
      return { path: normalizePath(path) };
    }

// helpers for quoted vs unquoted—in practice we only use the quoted form above
QuotedFilePath
  = "`" path:FilePath "`" { return path; }

UnquotedFilePath
  = path:FilePath { return path; }

// file‐path = segments separated by “/” or “\”, with optional extension
FilePath
  = path:$
    (
      NameSegment
      ( PathSeparator NameSegment )*
      ( "." [a-zA-Z0-9_]+ )?
    )
    { return path; }

NameSegment
  = $( [a-zA-Z0-9_@.\-]+ ) / ".."

PathSeparator
  = "/" / "\\"

// a fenced Markdown code block
CodeBlock
  = start:CodeFenceLineStart
    content:CodeBlockContent
    end:CodeFenceLineEnd {
      const full = start + content + end;
      logMatch("CodeBlock", true, full);
      // strip trailing newline
      return content.replace(/\r?\n$/, '');
    }

CodeFenceLineStart
  = Indent CodeFenceStart LangTag? optionalWhitespace Newline
    { return text(); }

CodeFenceLineEnd
  = Indent CodeFenceEnd optionalWhitespace (Newline / EOF)
    { return text(); }

CodeBlockContent
  = $((CodeContentLine)*)

CodeContentLine
  = !(Indent CodeFenceEnd)
    line:$((!Newline .)* Newline)
    { return line; }

CodeFenceStart       = "```"
CodeFenceEnd         = "```"
LangTag              = $([a-zA-Z0-9_-]+)
optionalWhitespace   = [ \t]*
PathMarker           = ("File" / "file" / "Path" / "path" / "Updating" / "updating" / "Creating" / "creating")
Indent               = [ \t]*
Newline              = "\n" / "\r\n"
EOF                  = !.
HASH                 = "#"
