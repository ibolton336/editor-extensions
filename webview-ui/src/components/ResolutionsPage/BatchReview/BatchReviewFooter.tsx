import React, { useState } from "react";
import {
  Button,
  Label,
  Flex,
  FlexItem,
  Split,
  SplitItem,
  Popover,
  List,
  ListItem,
} from "@patternfly/react-core";
import { FileIcon, ExclamationCircleIcon } from "@patternfly/react-icons";
import { useExtensionStore } from "../../../store/store";
import { BatchReviewModal } from "./BatchReviewModal";
import "./batchReviewFooter.css";

/**
 * Compact footer bar that shows pending file changes
 * Integrates with PatternFly Chatbot footer design
 */
export const BatchReviewFooter: React.FC = () => {
  const pendingFiles = useExtensionStore((state) => state.pendingBatchReview || []);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Don't render if no pending files
  if (pendingFiles.length === 0) {
    return null;
  }

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
  };

  // Popover content showing file list
  const fileListPopover = (
    <div style={{ maxWidth: "400px", maxHeight: "300px", overflow: "auto" }}>
      <p style={{ marginBottom: "0.5rem", fontWeight: 500 }}>
        Pending changes ({pendingFiles.length} files)
      </p>
      <List isPlain isBordered>
        {pendingFiles.map((file) => (
          <ListItem key={file.messageToken}>
            <Flex
              alignItems={{ default: "alignItemsCenter" }}
              spaceItems={{ default: "spaceItemsXs" }}
            >
              <FlexItem>
                <FileIcon style={{ fontSize: "0.875rem" }} />
              </FlexItem>
              <FlexItem style={{ fontSize: "0.875rem" }}>
                <strong>{file.path.split("/").pop()}</strong>
              </FlexItem>
              <FlexItem>
                {file.isNew && (
                  <Label color="green" isCompact>
                    New
                  </Label>
                )}
                {file.isDeleted && (
                  <Label color="red" isCompact>
                    Deleted
                  </Label>
                )}
              </FlexItem>
            </Flex>
          </ListItem>
        ))}
      </List>
    </div>
  );

  return (
    <>
      <div className="batch-review-footer">
        <div className="batch-review-footer-content">
          <Split hasGutter>
            {/* Left side - Status indicator */}
            <SplitItem>
              <Flex
                alignItems={{ default: "alignItemsCenter" }}
                spaceItems={{ default: "spaceItemsSm" }}
              >
                <FlexItem>
                  <ExclamationCircleIcon color="var(--pf-v5-global--warning-color--100)" />
                </FlexItem>
                <FlexItem>
                  <span className="batch-review-footer-text">
                    <strong>{pendingFiles.length}</strong> file{pendingFiles.length > 1 ? "s" : ""}{" "}
                    ready for review
                  </span>
                </FlexItem>
                <FlexItem>
                  <Popover
                    aria-label="File list popover"
                    position="top"
                    bodyContent={fileListPopover}
                    showClose={false}
                  >
                    <Button variant="link" isInline style={{ padding: 0 }}>
                      View list
                    </Button>
                  </Popover>
                </FlexItem>
              </Flex>
            </SplitItem>

            {/* Right side - Actions */}
            <SplitItem isFilled>
              <Flex
                justifyContent={{ default: "justifyContentFlexEnd" }}
                spaceItems={{ default: "spaceItemsSm" }}
              >
                <FlexItem>
                  <Button variant="link" size="sm" onClick={handleRejectAll}>
                    Reject All
                  </Button>
                </FlexItem>
                <FlexItem>
                  <Button variant="secondary" size="sm" onClick={handleApplyAll}>
                    Apply All ({pendingFiles.length})
                  </Button>
                </FlexItem>
                <FlexItem>
                  <Button variant="primary" size="sm" onClick={() => setIsModalOpen(true)}>
                    Review Changes
                  </Button>
                </FlexItem>
              </Flex>
            </SplitItem>
          </Split>
        </div>
      </div>

      {/* Modal for detailed review */}
      {isModalOpen && (
        <BatchReviewModal files={pendingFiles} onClose={() => setIsModalOpen(false)} />
      )}
    </>
  );
};

export default BatchReviewFooter;
