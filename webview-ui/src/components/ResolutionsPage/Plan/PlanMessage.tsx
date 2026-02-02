import React, { useState, useCallback, useMemo } from "react";
import "./planMessage.css";
import type { PlanStep, PlanMessageValue, ResearchFinding } from "../../../../../shared/src/types/types";

interface PlanMessageProps {
  data: PlanMessageValue;
  messageToken: string;
  timestamp?: string;
  isDisabled?: boolean;
}

const PlanStepItem: React.FC<{
  step: PlanStep;
  isSelected: boolean;
  onToggle: (stepId: string) => void;
  isDisabled: boolean;
}> = React.memo(({ step, isSelected, onToggle, isDisabled }) => {
  const effortClass = `plan-step-badge--effort-${step.estimatedEffort}`;

  return (
    <div className={`plan-step ${isSelected ? "plan-step--selected" : ""}`}>
      <input
        type="checkbox"
        className="plan-step-checkbox"
        checked={isSelected}
        onChange={() => onToggle(step.id)}
        disabled={isDisabled}
        aria-label={`Select step: ${step.title}`}
      />
      <div className="plan-step-content">
        <div className="plan-step-header">
          <span className="plan-step-title">{step.title}</span>
        </div>
        <p className="plan-step-description">{step.description}</p>
        {step.file && (
          <div className="plan-step-file">
            <span>📄</span>
            <span>{step.file}</span>
          </div>
        )}
        <div className="plan-step-meta">
          <span className="plan-step-badge plan-step-badge--category">{step.category}</span>
          <span className={`plan-step-badge ${effortClass}`}>{step.estimatedEffort} effort</span>
        </div>
        {step.validationWarnings && step.validationWarnings.length > 0 && (
          <div className="plan-step-warnings">
            {step.validationWarnings.map((warning, idx) => (
              <p key={idx} className="plan-step-warning">
                ⚠️ {warning}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

PlanStepItem.displayName = "PlanStepItem";

const ResearchFindingItem: React.FC<{ finding: ResearchFinding }> = React.memo(({ finding }) => {
  return (
    <div className={`plan-research-item plan-research-item--${finding.type}`}>
      <h5 className="plan-research-title">{finding.title}</h5>
      <p className="plan-research-description">{finding.description}</p>
    </div>
  );
});

ResearchFindingItem.displayName = "ResearchFindingItem";

export const PlanMessage: React.FC<PlanMessageProps> = React.memo(
  ({ data, messageToken, isDisabled = false }) => {
    const [selectedStepIds, setSelectedStepIds] = useState<Set<string>>(() => {
      // Initialize with all steps selected
      return new Set(data.steps?.map((step) => step.id) ?? []);
    });
    const [showResearch, setShowResearch] = useState(false);
    const [hasResponded, setHasResponded] = useState(false);

    const isInteractionDisabled = isDisabled || hasResponded || data.status !== "pending";

    const handleToggleStep = useCallback((stepId: string) => {
      setSelectedStepIds((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(stepId)) {
          newSet.delete(stepId);
        } else {
          newSet.add(stepId);
        }
        return newSet;
      });
    }, []);

    const handleSelectAll = useCallback(() => {
      if (selectedStepIds.size === data.steps?.length) {
        setSelectedStepIds(new Set());
      } else {
        setSelectedStepIds(new Set(data.steps?.map((s) => s.id) ?? []));
      }
    }, [selectedStepIds.size, data.steps]);

    const handleApproveAll = useCallback(() => {
      if (isInteractionDisabled) return;
      setHasResponded(true);

      window.vscode.postMessage({
        type: "QUICK_RESPONSE",
        payload: {
          responseId: "approve-all",
          messageToken,
          selectedStepIds: data.steps?.map((s) => s.id) ?? [],
        },
      });
    }, [messageToken, data.steps, isInteractionDisabled]);

    const handleApproveSelected = useCallback(() => {
      if (isInteractionDisabled || selectedStepIds.size === 0) return;
      setHasResponded(true);

      window.vscode.postMessage({
        type: "QUICK_RESPONSE",
        payload: {
          responseId: "approve-selected",
          messageToken,
          selectedStepIds: Array.from(selectedStepIds),
        },
      });
    }, [messageToken, selectedStepIds, isInteractionDisabled]);

    const handleReject = useCallback(() => {
      if (isInteractionDisabled) return;
      setHasResponded(true);

      window.vscode.postMessage({
        type: "QUICK_RESPONSE",
        payload: {
          responseId: "reject",
          messageToken,
          selectedStepIds: [],
        },
      });
    }, [messageToken, isInteractionDisabled]);

    const statusBadgeClass = useMemo(() => {
      return `plan-status-badge plan-status-badge--${data.status}`;
    }, [data.status]);

    const allSelected = selectedStepIds.size === data.steps?.length;
    const someSelected = selectedStepIds.size > 0;

    return (
      <div className="plan-message">
        <div className="plan-header">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <h3 className="plan-title">
              <span className="plan-title-icon">📋</span>
              {data.title}
            </h3>
            <span className={statusBadgeClass}>{data.status}</span>
          </div>
          <p className="plan-summary">{data.summary}</p>
        </div>

        <div className="plan-steps-container">
          <div className="plan-steps-header">
            <h4 className="plan-steps-title">Execution Steps</h4>
            <span className="plan-steps-count">
              {selectedStepIds.size} / {data.steps?.length ?? 0} selected
            </span>
          </div>

          {data.status === "pending" && (
            <div className="plan-select-all">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) {
                    el.indeterminate = someSelected && !allSelected;
                  }
                }}
                onChange={handleSelectAll}
                disabled={isInteractionDisabled}
                id={`select-all-${messageToken}`}
              />
              <label
                className="plan-select-all-label"
                htmlFor={`select-all-${messageToken}`}
              >
                {allSelected ? "Deselect all" : "Select all"}
              </label>
            </div>
          )}

          <div className="plan-steps-list">
            {data.steps?.map((step) => (
              <PlanStepItem
                key={step.id}
                step={step}
                isSelected={selectedStepIds.has(step.id)}
                onToggle={handleToggleStep}
                isDisabled={isInteractionDisabled}
              />
            ))}
          </div>
        </div>

        {data.researchFindings && data.researchFindings.length > 0 && (
          <div className="plan-research-section">
            <button
              className="plan-research-toggle"
              onClick={() => setShowResearch(!showResearch)}
            >
              <span>{showResearch ? "▼" : "▶"}</span>
              <span>Research Findings ({data.researchFindings.length})</span>
            </button>
            {showResearch && (
              <div className="plan-research-list">
                {data.researchFindings.map((finding) => (
                  <ResearchFindingItem key={finding.id} finding={finding} />
                ))}
              </div>
            )}
          </div>
        )}

        {data.status === "pending" && (
          <div className="plan-actions">
            <button
              className="plan-action-btn plan-action-btn--primary"
              onClick={handleApproveAll}
              disabled={isInteractionDisabled}
            >
              Approve All ({data.steps?.length ?? 0})
            </button>
            <button
              className="plan-action-btn plan-action-btn--secondary"
              onClick={handleApproveSelected}
              disabled={isInteractionDisabled || selectedStepIds.size === 0}
            >
              Approve Selected ({selectedStepIds.size})
            </button>
            <button
              className="plan-action-btn plan-action-btn--danger"
              onClick={handleReject}
              disabled={isInteractionDisabled}
            >
              Reject Plan
            </button>
          </div>
        )}
      </div>
    );
  },
);

PlanMessage.displayName = "PlanMessage";

export default PlanMessage;
