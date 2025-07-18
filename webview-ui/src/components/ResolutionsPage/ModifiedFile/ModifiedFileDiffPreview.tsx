import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { detectLanguage } from "../../../../../shared/src/utils/languageMapping";

// Re-enabling CSS import to test if this breaks re-rendering
import "./enhancedSyntaxHighlighting.css";

interface ModifiedFileDiffPreviewProps {
  diff: string;
  path: string;
  content?: string; // Optional full file content for better language detection
}

export const ModifiedFileDiffPreview: React.FC<ModifiedFileDiffPreviewProps> = ({
  diff,
  path,
  content,
}) => {
  const formatDiffForMarkdown = (diffContent: string, fileName: string) => {
    try {
      const lines = diffContent.split("\n");
      let formattedDiff = "";
      let inHunk = false;

      for (const line of lines) {
        if (line.startsWith("diff ")) {
          formattedDiff += "# " + line.substring(5) + "\n\n";
          continue;
        }

        if (line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ")) {
          continue;
        }

        if (line.startsWith("@@")) {
          inHunk = true;
          formattedDiff += "\n" + line + "\n";
          continue;
        }

        if (inHunk) {
          formattedDiff += line + "\n";
        }
      }

      if (!formattedDiff.trim()) {
        formattedDiff = `// No diff content available for ${fileName}`;
      }

      return "```diff\n" + formattedDiff + "\n```";
    } catch (error) {
      console.error("Error formatting diff for markdown:", error);
      return `\`\`\`\n// Error parsing diff content for ${fileName}\n\`\`\``;
    }
  };

  const detectedLanguage = detectLanguage(path, content);
  const fileName =
    path && typeof path === "string" && path.trim() !== ""
      ? path.split("/").pop() || path
      : "Unnamed File";
  const markdownContent = formatDiffForMarkdown(diff, fileName);

  try {
    return (
      <div className="modified-file-diff">
        <div className="markdown-diff">
          <ReactMarkdown
            rehypePlugins={[
              rehypeRaw,
              rehypeSanitize,
              [
                rehypeHighlight,
                {
                  ignoreMissing: true,
                  detect: true,
                  language: detectedLanguage || "plaintext",
                },
              ],
            ]}
          >
            {markdownContent}
          </ReactMarkdown>
        </div>
      </div>
    );
  } catch (error) {
    console.error("Error rendering ModifiedFileDiffPreview:", error);
    // Fallback rendering without markdown processing
    return (
      <div className="modified-file-diff">
        <div className="markdown-diff">
          <pre
            style={{
              fontFamily: "monospace",
              whiteSpace: "pre-wrap",
              padding: "1rem",
              backgroundColor: "var(--pf-global--BackgroundColor--200)",
              border: "1px solid var(--pf-global--BorderColor--100)",
              borderRadius: "4px",
            }}
          >
            {diff || "No diff content available"}
          </pre>
        </div>
      </div>
    );
  }
};

export default ModifiedFileDiffPreview;
