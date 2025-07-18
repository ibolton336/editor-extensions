import React, { useState, useMemo } from "react";
import { Card, CardBody } from "@patternfly/react-core";
import { ModifiedFileMessageValue, LocalChange } from "@editor-extensions/shared";
import { createTwoFilesPatch } from "diff";
import "./modifiedFileMessage.css";
import ModifiedFileModal from "./ModifiedFileModal";
import ModifiedFileHeader from "./ModifiedFileHeader";
import ModifiedFileDiffPreview from "./ModifiedFileDiffPreview";
import ModifiedFileActions from "./ModifiedFileActions";
import { useModifiedFileData, isLocalChange } from "./useModifiedFileData";

interface ModifiedFileMessageProps {
  data: ModifiedFileMessageValue | LocalChange;
  timestamp?: string;
  mode?: "agent" | "non-agent";
  onApply?: (change: LocalChange) => void;
  onReject?: (change: LocalChange) => void;
  onView?: (change: LocalChange) => void;
}

export const ModifiedFileMessage: React.FC<ModifiedFileMessageProps> = ({
  data,
  timestamp,
  mode = "agent",
  onApply,
  onReject,
  onView,
}) => {
  // Use shared data normalization hook
  const normalizedData = useModifiedFileData(data);
  const { path, isNew, diff, status, content, messageToken, fileName, originalContent } =
    normalizedData;
  const [actionTaken, setActionTaken] = useState<"applied" | "rejected" | null>(status || null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedContent, setSelectedContent] = useState<string | null>(null);

  // Generate diff that reflects only the selected/applied changes
  const effectiveDiff = useMemo(() => {
    // If no content was selected (full apply or reject), use original diff
    if (selectedContent === null) {
      return diff;
    }

    // If partial content was selected, generate a proper diff from original to selected content
    if (originalContent && selectedContent !== originalContent) {
      try {
        // Use the diff library to create a proper patch
        const patch = createTwoFilesPatch(
          fileName,
          fileName,
          originalContent,
          selectedContent,
          undefined,
          undefined,
          { context: 3 },
        );
        return patch;
      } catch (error) {
        console.error("Error generating diff for selected content:", error);
        // Fallback to original diff if patch generation fails
        return diff;
      }
    }

    return diff;
  }, [diff, selectedContent, originalContent, fileName]);

  // Determine if this is a partial apply (selected content differs from both original and full content)
  const isPartialApply =
    selectedContent !== null && selectedContent !== originalContent && selectedContent !== content;

  // Function to handle FILE_RESPONSE message posting (agent mode only)
  const postFileResponse = (
    responseId: string,
    messageToken: string,
    path: string,
    content?: string,
  ) => {
    interface FileResponsePayload {
      responseId: string;
      messageToken: string;
      path: string;
      content?: string;
    }
    const payload: FileResponsePayload = {
      responseId,
      messageToken,
      path,
    };

    if (content !== undefined) {
      payload.content = content;
    }

    window.vscode.postMessage({
      type: "FILE_RESPONSE",
      payload,
    });
  };

  const applyFile = (appliedContent?: string) => {
    setActionTaken("applied");
    setIsExpanded(false);

    // Use provided applied content or fall back to full content
    const contentToApply = appliedContent || content;

    // Track the selected content for diff generation
    setSelectedContent(contentToApply);

    if (mode === "agent") {
      // Agent mode: Use FILE_RESPONSE flow for direct file writing
      postFileResponse("apply", messageToken, path, contentToApply);
    } else {
      // Non-agent mode: Use callback flow with modified data
      if (onApply && isLocalChange(data)) {
        // Create modified LocalChange with updated content
        const modifiedChange: LocalChange = { ...data, content: contentToApply };
        onApply(modifiedChange);
      }
    }
  };

  const rejectFile = () => {
    setActionTaken("rejected");
    setIsExpanded(false);
    // Clear selected content when rejecting
    setSelectedContent(null);

    if (mode === "agent") {
      // Agent mode: Use FILE_RESPONSE flow
      postFileResponse("reject", messageToken, path);
    } else {
      // Non-agent mode: Use callback flow
      if (onReject && isLocalChange(data)) {
        onReject(data);
      }
    }
  };

  const viewFileInVSCode = (filePath: string, fileDiff: string) => {
    if (mode === "agent") {
      // Agent mode: Use SHOW_MAXIMIZED_DIFF message
      interface ShowMaximizedDiffPayload {
        path: string;
        content: string;
        diff: string;
        messageToken: string;
      }
      const payload: ShowMaximizedDiffPayload = {
        path: filePath,
        content: selectedContent || content,
        diff: fileDiff,
        messageToken: messageToken,
      };
      window.vscode.postMessage({
        type: "SHOW_MAXIMIZED_DIFF",
        payload,
      });
    } else {
      // Non-agent mode: Use callback flow
      if (onView && isLocalChange(data)) {
        onView(data);
      }
    }
  };

  const handleExpandToggle = () => {
    setIsExpanded(!isExpanded);
  };

  // Handle quick response actions
  const handleQuickResponse = (responseId: string) => {
    const action = responseId === "apply" ? "applied" : "rejected";
    setActionTaken(action);

    if (responseId === "apply") {
      // For quick apply, use full content and clear selected content
      setSelectedContent(null);
    } else {
      // For reject, clear selected content
      setSelectedContent(null);
    }

    if (mode === "agent") {
      // Agent mode: Use FILE_RESPONSE flow
      const contentToSend = responseId === "apply" ? content : undefined;
      postFileResponse(responseId, messageToken, path, contentToSend);
    } else {
      // Non-agent mode: Use callback flow
      if (isLocalChange(data)) {
        if (responseId === "apply" && onApply) {
          const modifiedChange: LocalChange = { ...data, content };
          onApply(modifiedChange);
        } else if (responseId === "reject" && onReject) {
          onReject(data);
        }
      }
    }
  };

  return (
    <>
      <div className="modified-file-message">
        <Card className="modified-file-card">
          <ModifiedFileHeader
            isNew={isNew}
            fileName={fileName}
            timestamp={timestamp}
            isPartialApply={isPartialApply}
          />
          <CardBody>
            <ModifiedFileDiffPreview
              diff={effectiveDiff}
              path={path}
              content={selectedContent || content}
            />
            <ModifiedFileActions
              actionTaken={actionTaken}
              mode={mode}
              normalizedData={normalizedData}
              onApply={() => applyFile()}
              onReject={rejectFile}
              onView={viewFileInVSCode}
              onExpandToggle={handleExpandToggle}
              onQuickResponse={handleQuickResponse}
            />
          </CardBody>
        </Card>
      </div>

      {/* Expanded Modal View */}
      <ModifiedFileModal
        isOpen={isExpanded}
        onClose={handleExpandToggle}
        data={data}
        actionTaken={actionTaken}
        onApply={(selectedContent: string) => applyFile(selectedContent)}
        onReject={rejectFile}
      />
    </>
  );
};

export default ModifiedFileMessage;
