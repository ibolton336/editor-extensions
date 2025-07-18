import React from "react";
import { Button } from "@patternfly/react-core";
import { CheckCircleIcon, TimesCircleIcon } from "@patternfly/react-icons";
import { DiffLinesRenderer } from "./DiffLinesRenderer";
import "./HunkSelectionInterface.css";

interface ParsedHunk {
  id: string;
  header: string;
  changes: string[];
}

interface HunkSelectionInterfaceProps {
  parsedHunks: ParsedHunk[];
  hunkStates: Record<string, boolean | null>;
  onHunkStateChange: (hunkId: string, accepted: boolean | null) => void;
  actionTaken: "applied" | "rejected" | null;
  filePath: string;
}

export const HunkSelectionInterface: React.FC<HunkSelectionInterfaceProps> = ({
  parsedHunks,
  hunkStates,
  onHunkStateChange,
  actionTaken,
  filePath,
}) => {
  return (
    <div className="hunk-selection-interface">
      <div className="hunk-selection-header">
        <h3 className="hunk-selection-title">Review Changes</h3>
        <span className="hunk-count">
          {parsedHunks.length} change{parsedHunks.length !== 1 ? "s" : ""} found
        </span>
      </div>

      {parsedHunks.map((hunk, index) => {
        const hunkState = hunkStates[hunk.id];
        const getHunkStateClass = () => {
          if (hunkState === true) return "hunk-accepted";
          if (hunkState === false) return "hunk-rejected";
          return "hunk-pending";
        };

        return (
          <div key={hunk.id} className={`hunk-item ${getHunkStateClass()}`}>
            <div className="hunk-item-header">
              <div className="hunk-info">
                <span className="hunk-number">Change {index + 1}</span>
                <span className="hunk-description">{hunk.header}</span>
                <span className={`hunk-status-badge ${getHunkStateClass()}`}>
                  {hunkState === true && "✓ Accept"}
                  {hunkState === false && "✗ Reject"}
                  {hunkState === null && "⏳ Decide"}
                </span>
              </div>
              <div className="hunk-controls">
                <Button
                  variant={hunkState === true ? "primary" : "secondary"}
                  size="sm"
                  icon={<CheckCircleIcon />}
                  onClick={() => onHunkStateChange(hunk.id, true)}
                  isDisabled={actionTaken !== null}
                  className={hunkState === true ? "hunk-button-selected" : ""}
                >
                  Accept
                </Button>
                <Button
                  variant={hunkState === false ? "danger" : "secondary"}
                  size="sm"
                  icon={<TimesCircleIcon />}
                  onClick={() => onHunkStateChange(hunk.id, false)}
                  isDisabled={actionTaken !== null}
                  className={hunkState === false ? "hunk-button-selected" : ""}
                >
                  Reject
                </Button>
                {hunkState !== null && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => onHunkStateChange(hunk.id, null)}
                    isDisabled={actionTaken !== null}
                    className="hunk-reset-button"
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>
            <div className="hunk-content">
              <DiffLinesRenderer diffContent={hunk.changes.join("\n")} filePath={filePath} />
            </div>
          </div>
        );
      })}
    </div>
  );
}; 