import React from "react";
import { Button, Label, Spinner } from "@patternfly/react-core";
import { OnIcon } from "@patternfly/react-icons";
import "./styles.css";

interface ServerStatusToggleProps {
  isRunning: boolean;
  isStarting: boolean;
  onToggle: () => void;
}

export function ServerStatusToggle({ isRunning, isStarting, onToggle }: ServerStatusToggleProps) {
  return (
    <div className="server-status-container">
      <div className="server-status-wrapper">
        <span className="server-status-label">Server Status</span>
        <Label color={isRunning ? "green" : "red"} isCompact className="server-status-label-status">
          {isRunning ? "Running" : "Stopped"}
        </Label>
        <div className="vertical-divider" />
        <div className="server-action-container">
          {isStarting ? (
            <Spinner size="sm" className="server-status-spinner" />
          ) : (
            <Button
              variant="plain"
              icon={<OnIcon />}
              onClick={onToggle}
              isDisabled={isStarting}
              className="server-action-button"
            >
              <span className="server-action-text">{isRunning ? "Stop" : "Start"}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
