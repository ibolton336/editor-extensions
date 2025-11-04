import React, { useState } from "react";
import { Button, Label, Flex, FlexItem, Progress, ProgressSize } from "@patternfly/react-core";
import { FileIcon, AngleUpIcon, AngleDownIcon } from "@patternfly/react-icons";
import { useExtensionStore } from "../../../store/store";
import "./batchReviewExpandable.css";

/**
 * Expandable footer panel for batch file review
 * Expands upward to show compact file-by-file review interface
 */
export const BatchReviewExpandable: React.FC = () => {
  const pendingFiles = useExtensionStore((state) => state.pendingBatchReview || []);
  const activeDecorators = useExtensionStore((state) => state.activeDecorators);
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [processingFiles, setProcessingFiles] = useState<Set<string>>(new Set());
  const [viewingInEditor, setViewingInEditor] = useState<string | null>(null);

  // Auto-adjust index when files are removed from the list
  React.useEffect(() => {
    // If current index is beyond the list (file was removed), go to previous index
    if (currentIndex >= pendingFiles.length && pendingFiles.length > 0) {
      setCurrentIndex(Math.max(0, pendingFiles.length - 1));
    }
    // If list is now empty, collapse the footer
    if (pendingFiles.length === 0) {
      setIsExpanded(false);
      setProcessingFiles(new Set()); // Clear processing state
    }
  }, [pendingFiles.length, currentIndex]);

  // Debug: Log decorator state
  React.useEffect(() => {
    if (pendingFiles.length > 0) {
      console.log("[BatchReviewExpandable] State update", {
        currentIndex,
        pendingFilesCount: pendingFiles.length,
        currentFile: pendingFiles[currentIndex]?.path,
        currentToken: pendingFiles[currentIndex]?.messageToken,
        activeDecorators,
      });
    }
  }, [currentIndex, activeDecorators, pendingFiles]);

  // Don't render if no pending files
  if (pendingFiles.length === 0) {
    return null;
  }

  const currentFile = pendingFiles[currentIndex];
  const currentFileName = currentFile.path.split("/").pop() || currentFile.path;
  const isProcessing = processingFiles.has(currentFile.messageToken);

  // Check if currently viewing this file with decorators
  // Use local state first (optimistic), then check global state for confirmation
  const isViewingDiff =
    viewingInEditor === currentFile.messageToken ||
    Boolean(
      activeDecorators &&
        typeof activeDecorators === "object" &&
        currentFile.messageToken in activeDecorators &&
        activeDecorators[currentFile.messageToken] === currentFile.path,
    );

  // Debug logs
  console.log("[BatchReviewExpandable] Current state", {
    isViewingDiff,
    isProcessing,
    viewingInEditor,
    currentIndex,
    pendingFilesCount: pendingFiles.length,
    currentFileName,
    messageToken: currentFile.messageToken,
    processingFilesSet: Array.from(processingFiles),
  });

  if (isViewingDiff) {
    console.log("[BatchReviewExpandable] Decorator active for current file", {
      messageToken: currentFile.messageToken,
      path: currentFile.path,
      decoratorValue: activeDecorators[currentFile.messageToken],
    });
  }

  const handleReviewInEditor = () => {
    console.log("[BatchReviewExpandable] Opening file with decorators", {
      path: currentFile.path,
      messageToken: currentFile.messageToken,
    });

    // Optimistically mark as viewing to immediately switch UI
    setViewingInEditor(currentFile.messageToken);

    window.vscode.postMessage({
      type: "SHOW_DIFF_WITH_DECORATORS",
      payload: {
        path: currentFile.path,
        content: currentFile.content,
        diff: currentFile.diff,
        messageToken: currentFile.messageToken,
      },
    });
  };

  const handleContinue = () => {
    console.log("[BatchReviewExpandable] Continue clicked", {
      path: currentFile.path,
      messageToken: currentFile.messageToken,
    });

    // Mark as processing to prevent further interactions
    setProcessingFiles((prev) => new Set(prev).add(currentFile.messageToken));
    setViewingInEditor(null); // Clear viewing state

    // Check current file state and apply/reject based on changes
    // Backend will remove from pendingBatchReview, which will trigger re-render
    window.vscode.postMessage({
      type: "CONTINUE_WITH_FILE_STATE",
      payload: {
        messageToken: currentFile.messageToken,
        path: currentFile.path,
        content: currentFile.content,
      },
    });

    // Note: Don't manually advance - the list will update and currentIndex
    // will automatically point to the next file when this one is removed
  };

  const handleAccept = () => {
    console.log("[BatchReviewExpandable] Accept clicked", {
      path: currentFile.path,
      messageToken: currentFile.messageToken,
    });

    // Mark as processing to prevent further interactions
    setProcessingFiles((prev) => new Set(prev).add(currentFile.messageToken));
    setViewingInEditor(null); // Clear viewing state

    window.vscode.postMessage({
      type: "FILE_RESPONSE",
      payload: {
        responseId: "apply",
        messageToken: currentFile.messageToken,
        path: currentFile.path,
        content: currentFile.content,
      },
    });

    // Backend will remove from pendingBatchReview
    // Stay on same index - when file is removed, next file will appear at this index
  };

  const handleReject = () => {
    console.log("[BatchReviewExpandable] Reject clicked", {
      path: currentFile.path,
      messageToken: currentFile.messageToken,
    });

    // Mark as processing to prevent further interactions
    setProcessingFiles((prev) => new Set(prev).add(currentFile.messageToken));
    setViewingInEditor(null); // Clear viewing state

    window.vscode.postMessage({
      type: "FILE_RESPONSE",
      payload: {
        responseId: "reject",
        messageToken: currentFile.messageToken,
        path: currentFile.path,
      },
    });

    // Backend will remove from pendingBatchReview
    // Stay on same index - when file is removed, next file will appear at this index
  };

  const handleNext = () => {
    if (currentIndex < pendingFiles.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleApplyAll = () => {
    window.vscode.postMessage({
      type: "BATCH_APPLY_ALL",
      payload: {
        files: pendingFiles.map((f) => ({
          messageToken: f.messageToken,
          path: f.path,
          content: f.content,
        })),
      },
    });
    setIsExpanded(false);
  };

  const handleRejectAll = () => {
    window.vscode.postMessage({
      type: "BATCH_REJECT_ALL",
      payload: {
        files: pendingFiles.map((f) => ({
          messageToken: f.messageToken,
          path: f.path,
        })),
      },
    });
    setIsExpanded(false);
  };

  // Collapsed state - compact indicator
  if (!isExpanded) {
    return (
      <div className="batch-review-expandable collapsed">
        <button className="batch-review-expand-trigger" onClick={() => setIsExpanded(true)}>
          <Flex
            justifyContent={{ default: "justifyContentSpaceBetween" }}
            alignItems={{ default: "alignItemsCenter" }}
            spaceItems={{ default: "spaceItemsMd" }}
          >
            <FlexItem>
              <Flex
                alignItems={{ default: "alignItemsCenter" }}
                spaceItems={{ default: "spaceItemsSm" }}
              >
                <FlexItem>
                  <FileIcon />
                </FlexItem>
                <FlexItem>
                  <strong>{pendingFiles.length}</strong> file{pendingFiles.length > 1 ? "s" : ""}{" "}
                  ready for review
                </FlexItem>
              </Flex>
            </FlexItem>
            <FlexItem>
              <AngleUpIcon /> Expand to review
            </FlexItem>
          </Flex>
        </button>
      </div>
    );
  }

  // Expanded state - file review interface
  return (
    <div className="batch-review-expandable expanded">
      {/* Header with collapse button */}
      <div className="batch-review-expandable-header">
        <Flex
          justifyContent={{ default: "justifyContentSpaceBetween" }}
          alignItems={{ default: "alignItemsCenter" }}
        >
          <FlexItem>
            <span className="batch-review-title">
              Review Changes ({currentIndex + 1}/{pendingFiles.length})
            </span>
          </FlexItem>
          <FlexItem>
            <Button variant="plain" onClick={() => setIsExpanded(false)} aria-label="Collapse">
              <AngleDownIcon />
            </Button>
          </FlexItem>
        </Flex>
        <Progress
          value={((currentIndex + 1) / pendingFiles.length) * 100}
          title={`Reviewing file ${currentIndex + 1} of ${pendingFiles.length}`}
          size={ProgressSize.sm}
          style={{ marginTop: "0.5rem" }}
        />
      </div>

      {/* Current file info */}
      <div className="batch-review-current-file">
        <Flex
          direction={{ default: "row" }}
          alignItems={{ default: "alignItemsCenter" }}
          spaceItems={{ default: "spaceItemsSm" }}
        >
          <FlexItem>
            <FileIcon />
          </FlexItem>
          <FlexItem flex={{ default: "flex_1" }} className="batch-review-filename-compact">
            <strong>{currentFileName}</strong>
          </FlexItem>
          <FlexItem>
            {currentFile.isNew && (
              <Label color="green" isCompact>
                New
              </Label>
            )}
            {currentFile.isDeleted && (
              <Label color="red" isCompact>
                Deleted
              </Label>
            )}
          </FlexItem>
        </Flex>
      </div>

      {/* Actions - horizontal layout for minimal space */}
      <div className="batch-review-actions">
        {/* Show different UI when reviewing in editor with decorators OR processing */}
        {isViewingDiff || isProcessing ? (
          <Flex
            justifyContent={{ default: "justifyContentCenter" }}
            alignItems={{ default: "alignItemsCenter" }}
            spaceItems={{ default: "spaceItemsSm" }}
          >
            <FlexItem>
              <span className="batch-review-decorator-status">
                {isProcessing
                  ? "⏳ Processing changes..."
                  : "📝 Reviewing in editor - use CodeLens to accept/reject changes, then save"}
              </span>
            </FlexItem>
            <FlexItem>
              <Button
                variant="primary"
                onClick={handleContinue}
                size="sm"
                isDisabled={isProcessing}
              >
                Continue
              </Button>
            </FlexItem>
          </Flex>
        ) : (
          <Flex
            spaceItems={{ default: "spaceItemsXs" }}
            alignItems={{ default: "alignItemsCenter" }}
          >
            <FlexItem>
              <Button
                variant="control"
                onClick={handlePrevious}
                isDisabled={currentIndex === 0 || isProcessing}
                size="sm"
              >
                ←
              </Button>
            </FlexItem>

            {/* Primary action - Review in Editor */}
            <FlexItem flex={{ default: "flex_1" }}>
              <Button
                variant="secondary"
                onClick={handleReviewInEditor}
                size="sm"
                isBlock
                isDisabled={isProcessing}
              >
                {isProcessing ? "⏳ Processing..." : "📝 Review in Editor"}
              </Button>
            </FlexItem>

            {/* Accept/Reject */}
            <FlexItem>
              <Button variant="danger" onClick={handleReject} size="sm" isDisabled={isProcessing}>
                Reject
              </Button>
            </FlexItem>
            <FlexItem>
              <Button variant="primary" onClick={handleAccept} size="sm" isDisabled={isProcessing}>
                Accept
              </Button>
            </FlexItem>

            <FlexItem>
              <Button
                variant="control"
                onClick={handleNext}
                isDisabled={currentIndex === pendingFiles.length - 1 || isProcessing}
                size="sm"
              >
                →
              </Button>
            </FlexItem>
          </Flex>
        )}
      </div>

      {/* Bulk actions - minimal */}
      <div className="batch-review-bulk-actions">
        <Flex
          spaceItems={{ default: "spaceItemsXs" }}
          justifyContent={{ default: "justifyContentFlexEnd" }}
        >
          <FlexItem>
            <Button variant="link" onClick={handleRejectAll} size="sm" isDanger>
              Reject All
            </Button>
          </FlexItem>
          <FlexItem>
            <Button variant="link" onClick={handleApplyAll} size="sm">
              Apply All
            </Button>
          </FlexItem>
        </Flex>
      </div>
    </div>
  );
};

export default BatchReviewExpandable;
