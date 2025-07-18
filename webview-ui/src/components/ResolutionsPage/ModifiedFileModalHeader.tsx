import React from "react";
import { Button, Flex, FlexItem } from "@patternfly/react-core";
import {
  CompressIcon,
  CheckIcon,
  CloseIcon,
  PlusCircleIcon,
  MinusCircleIcon,
} from "@patternfly/react-icons";
import "./ModifiedFileModalHeader.css";

interface ParsedHunk {
  id: string;
  header: string;
  changes: string[];
}

interface ModifiedFileModalHeaderProps {
  isNew: boolean;
  fileName: string;
  isSingleHunk: boolean;
  actionTaken: "applied" | "rejected" | null;
  parsedHunks: ParsedHunk[];
  hunkStates: Record<string, boolean | null>;
  onClose: () => void;
  onApply: () => void;
  onReject: () => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
}

export const ModifiedFileModalHeader: React.FC<ModifiedFileModalHeaderProps> = ({
  isNew,
  fileName,
  isSingleHunk,
  actionTaken,
  parsedHunks,
  hunkStates,
  onClose,
  onApply,
  onReject,
  onSelectAll,
  onDeselectAll,
}) => {
  // Calculate hunk decision state for multi-hunk scenarios
  const getHunkDecisionState = () => {
    if (isSingleHunk) {
      return { allDecided: true, acceptedCount: 0, totalHunks: 1 };
    }

    const totalHunks = parsedHunks.length;
    const decidedHunks = parsedHunks.filter((hunk) => hunkStates[hunk.id] !== null);
    const acceptedHunks = parsedHunks.filter((hunk) => hunkStates[hunk.id] === true);
    const rejectedHunks = parsedHunks.filter((hunk) => hunkStates[hunk.id] === false);
    
    const allDecided = decidedHunks.length === totalHunks;
    const acceptedCount = acceptedHunks.length;
    const rejectedCount = rejectedHunks.length;

    return {
      allDecided,
      acceptedCount,
      rejectedCount,
      totalHunks,
      pendingCount: totalHunks - decidedHunks.length,
    };
  };

  const decisionState = getHunkDecisionState();

  // Generate confirm button text and state
  const getConfirmButtonProps = () => {
    if (isSingleHunk) {
      return {
        text: "Accept",
        disabled: false,
        variant: "primary" as const,
        description: "Accept changes",
      };
    }

    if (!decisionState.allDecided) {
      return {
        text: `Confirm Decisions (${decisionState.pendingCount} pending)`,
        disabled: true,
        variant: "secondary" as const,
        description: `Please decide on all ${decisionState.totalHunks} hunks`,
      };
    }

    if (decisionState.acceptedCount === 0) {
      return {
        text: "Confirm Rejection",
        disabled: false,
        variant: "danger" as const,
        description: "Reject all changes",
      };
    } else if (decisionState.acceptedCount === decisionState.totalHunks) {
      return {
        text: "Accept All Changes",
        disabled: false,
        variant: "primary" as const,
        description: `Apply all ${decisionState.totalHunks} changes`,
      };
    } else {
      return {
        text: `Accept ${decisionState.acceptedCount} Changes`,
        disabled: false,
        variant: "primary" as const,
        description: `Apply ${decisionState.acceptedCount} of ${decisionState.totalHunks} changes`,
      };
    }
  };

  const confirmButtonProps = getConfirmButtonProps();

  return (
    <div className="modal-custom-header sticky-header">
      <Flex
        justifyContent={{ default: "justifyContentSpaceBetween" }}
        alignItems={{ default: "alignItemsCenter" }}
      >
        <FlexItem>
          <div className="modal-title-section">
            <h2 className="modal-title">
              {isNew ? "Created file: " : "Modified file: "}
              <span className="modal-filename">{fileName}</span>
              {!isSingleHunk && !actionTaken && (
                <span className="hunk-progress">
                  {decisionState.allDecided ? (
                    <span className="progress-complete">✓ All decided</span>
                  ) : (
                                         <span className="progress-pending">
                       {decisionState.totalHunks - (decisionState.pendingCount || 0)}/{decisionState.totalHunks} decided
                     </span>
                  )}
                </span>
              )}
            </h2>
          </div>
        </FlexItem>

        <FlexItem>
          <Flex gap={{ default: "gapMd" }} alignItems={{ default: "alignItemsCenter" }}>
            {/* Multi-hunk selection controls */}
            {!isSingleHunk && actionTaken === null && (
              <>
                <FlexItem>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<PlusCircleIcon />}
                    onClick={onSelectAll}
                    aria-label="Select all hunks"
                  >
                    Select All
                  </Button>
                </FlexItem>
                <FlexItem>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<MinusCircleIcon />}
                    onClick={onDeselectAll}
                    aria-label="Deselect all hunks"
                  >
                    Deselect All
                  </Button>
                </FlexItem>
              </>
            )}

            {/* Action buttons - shown for both single and multi-hunk when no action taken */}
            {actionTaken === null && (
              <>
                <FlexItem>
                  <Button
                    variant={confirmButtonProps.variant}
                    size="sm"
                    icon={<CheckIcon />}
                    onClick={onApply}
                    isDisabled={confirmButtonProps.disabled}
                    aria-label={confirmButtonProps.description}
                    title={confirmButtonProps.description}
                  >
                    {confirmButtonProps.text}
                  </Button>
                </FlexItem>
                <FlexItem>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<CloseIcon />}
                    onClick={onReject}
                    aria-label={isSingleHunk ? "Reject changes" : "Reject all changes"}
                  >
                    {isSingleHunk ? "Reject" : "Reject All"}
                  </Button>
                </FlexItem>
              </>
            )}

            {/* Status indicator for completed actions */}
            {actionTaken && (
              <FlexItem>
                <span className={`action-status ${actionTaken}`}>
                  {actionTaken === "applied" ? "✓ Applied" : "✗ Rejected"}
                </span>
              </FlexItem>
            )}

            {/* Close button */}
            <FlexItem>
              <Button
                variant="plain"
                onClick={onClose}
                icon={<CompressIcon />}
                className="modal-close-button"
                aria-label="Close modal"
              />
            </FlexItem>
          </Flex>
        </FlexItem>
      </Flex>
    </div>
  );
};
