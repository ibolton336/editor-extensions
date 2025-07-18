import React from "react";
import hljs from "highlight.js";
import { getLanguageFromFilename } from "../../../../shared/src/utils/languageMapping";
import "./DiffLinesRenderer.css";
import "./VSCodeSyntaxTheme.css";

interface DiffLinesRendererProps {
  diffContent: string;
  filePath: string;
}

export const DiffLinesRenderer: React.FC<DiffLinesRendererProps> = ({ diffContent, filePath }) => {
  // Helper function to parse and render diff lines with syntax highlighting
  const renderDiffLines = (diffContent: string) => {
    if (!diffContent) {
      return <div className="diff-line context">No diff content available</div>;
    }

    const lines = diffContent.split("\n");
    return lines.map((line, index) => {
      let lineClass = "context";
      let lineNumber = "";
      let content = line;
      let shouldHighlight = false;

      if (line.startsWith("+")) {
        lineClass = "addition";
        lineNumber = "  +";
        content = line.substring(1);
        shouldHighlight = true;
      } else if (line.startsWith("-")) {
        lineClass = "deletion";
        lineNumber = "  -";
        content = line.substring(1);
        shouldHighlight = true;
      } else if (line.startsWith("@@")) {
        lineClass = "meta";
        lineNumber = "  ";
        content = line;
        shouldHighlight = false;
      } else if (
        line.startsWith("diff ") ||
        line.startsWith("index ") ||
        line.startsWith("--- ") ||
        line.startsWith("+++ ")
      ) {
        lineClass = "meta";
        lineNumber = "  ";
        content = line;
        shouldHighlight = false;
      } else if (line.match(/^\d+$/)) {
        // Line numbers
        lineClass = "meta";
        lineNumber = line.padStart(3);
        content = "";
        shouldHighlight = false;
      } else if (line.startsWith(" ")) {
        lineClass = "context";
        lineNumber = "   ";
        content = line.substring(1);
        shouldHighlight = true;
      }

      // Apply syntax highlighting to code content
      let highlightedContent = content;
      if (shouldHighlight && content.trim()) {
        try {
          // Use improved language detection
          const language = getLanguageFromFilename(filePath);

          // Handle special cases and fallbacks for highlight.js
          const hlJsLanguageMap: Record<string, string> = {
            plaintext: "plaintext",
            jsonc: "json", // JSON with comments -> JSON
            json5: "json", // JSON5 -> JSON
            typescript: "typescript",
            javascript: "javascript",
            csharp: "cs",
            fsharp: "fs",
            vbnet: "vb",
            powershell: "powershell",
            dockerfile: "dockerfile",
            gitignore: "bash", // Treat as shell patterns
            gitattributes: "bash",
            dotenv: "bash",
            terraform: "hcl",
            protobuf: "protobuf",
            graphql: "graphql",
            jinja2: "jinja2",
            handlebars: "handlebars",
            mustache: "handlebars",
            asciidoc: "asciidoc",
            rst: "rst",
            stylus: "stylus",
            toml: "toml",
            ini: "ini",
            properties: "properties",
            makefile: "makefile",
            cmake: "cmake",
            dart: "dart",
            elm: "elm",
            haskell: "haskell",
            clojure: "clojure",
            ocaml: "ocaml",
            objectivec: "objectivec",
            zig: "zig",
            lua: "lua",
            perl: "perl",
          };

          const hlJsLanguage = hlJsLanguageMap[language] || language;

          // Check if the language is supported by highlight.js
          if (hlJsLanguage && hlJsLanguage !== "plaintext" && hljs.getLanguage(hlJsLanguage)) {
            const highlighted = hljs.highlight(content, {
              language: hlJsLanguage,
              ignoreIllegals: true, // Be more forgiving with syntax errors in diffs
            });
            highlightedContent = highlighted.value;
          } else if (content.length < 1000) {
            // For shorter content, try auto-detection as fallback
            try {
              const autoDetected = hljs.highlightAuto(content, [
                "javascript",
                "typescript",
                "python",
                "java",
                "css",
                "html",
                "xml",
                "json",
                "yaml",
                "markdown",
                "shell",
                "sql",
                "cpp",
                "csharp",
              ]);
              if (autoDetected.relevance > 3) {
                highlightedContent = autoDetected.value;
              }
            } catch (autoError) {
              // Auto-detection failed, keep original content
            }
          }
        } catch (error) {
          // Fallback to plain text if highlighting fails
          highlightedContent = content;
        }
      }

      return (
        <div key={index} className={`diff-line ${lineClass}`}>
          <span className="diff-line-number">{lineNumber}</span>
          <span
            className="diff-content vscode-syntax-highlight"
            dangerouslySetInnerHTML={{ __html: highlightedContent }}
          />
        </div>
      );
    });
  };

  return <div className="vscode-syntax-highlight">{renderDiffLines(diffContent)}</div>;
};
