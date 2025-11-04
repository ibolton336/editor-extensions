import React, { useState } from "react";
import {
  Modal,
  ModalVariant,
  Button,
  Card,
  CardBody,
  Label,
  Wizard,
  WizardHeader,
  WizardStep,
  Alert,
  AlertVariant,
  Flex,
  FlexItem,
} from "@patternfly/react-core";
import { FileIcon, CheckCircleIcon, TimesCircleIcon } from "@patternfly/react-icons";
import { PendingBatchReviewFile } from "@editor-extensions/shared";
import ModifiedFileDiffPreview from "../ModifiedFile/ModifiedFileDiffPreview";
import "./batchReviewModal.css";

interface BatchReviewModalProps {
  files: PendingBatchReviewFile[];
  onClose: () => void;
}

type Decision = "apply" | "reject" | null;

export const BatchReviewModal: React.FC<BatchReviewModalProps> = ({ files, onClose }) => {
  const [decisions, setDecisions] = useState<Map<string, Decision>>(new Map());
  const [viewingDiffFor, setViewingDiffFor] = useState<string | null>(null);

  const reviewedCount = decisions.size;
  const progressPercentage = (reviewedCount / files.length) * 100;

  const handleReviewWithDecorators = (file: PendingBatchReviewFile) => {
    setViewingDiffFor(file.messageToken);

    // Send message to open file with decorators
    window.vscode.postMessage({
      type: "SHOW_DIFF_WITH_DECORATORS",
      payload: {
        path: file.path,
        content: file.content,
        diff: file.diff,
        messageToken: file.messageToken,
      },
    });
  };

  const handleApply = (file: PendingBatchReviewFile) => {
    const newDecisions = new Map(decisions);
    newDecisions.set(file.messageToken, "apply");
    setDecisions(newDecisions);
    setViewingDiffFor(null);

    // Send apply message for this file
    window.vscode.postMessage({
      type: "FILE_RESPONSE",
      payload: {
        responseId: "apply",
        messageToken: file.messageToken,
        path: file.path,
        content: file.content,
      },
    });
  };

  const handleReject = (file: PendingBatchReviewFile) => {
    const newDecisions = new Map(decisions);
    newDecisions.set(file.messageToken, "reject");
    setDecisions(newDecisions);
    setViewingDiffFor(null);

    // Send reject message for this file
    window.vscode.postMessage({
      type: "FILE_RESPONSE",
      payload: {
        responseId: "reject",
        messageToken: file.messageToken,
        path: file.path,
      },
    });
  };

  const handleApplyAll = () => {
    // Mark all as applied
    const newDecisions = new Map<string, Decision>();
    files.forEach((file) => {
      newDecisions.set(file.messageToken, "apply");
    });
    setDecisions(newDecisions);

    // Send batch apply message
    window.vscode.postMessage({
      type: "BATCH_APPLY_ALL",
      payload: {
        files: files.map((f) => ({
          messageToken: f.messageToken,
          path: f.path,
          content: f.content,
        })),
      },
    });

    onClose();
  };

  const handleRejectAll = () => {
    // Mark all as rejected
    const newDecisions = new Map<string, Decision>();
    files.forEach((file) => {
      newDecisions.set(file.messageToken, "reject");
    });
    setDecisions(newDecisions);

    // Send batch reject message
    window.vscode.postMessage({
      type: "BATCH_REJECT_ALL",
      payload: {
        files: files.map((f) => ({
          messageToken: f.messageToken,
          path: f.path,
        })),
      },
    });

    onClose();
  };

  const handleWizardClose = () => {
    onClose();
  };

  const handleWizardFinish = () => {
    onClose();
  };

  // Create wizard steps - one for each file
  const fileSteps = files.map((file, index) => {
    const decision = decisions.get(file.messageToken);
    const isViewing = viewingDiffFor === file.messageToken;
    const stepNumber = index + 1;

    return (
      <WizardStep
        key={file.messageToken}
        name={`${stepNumber}. ${file.path.split("/").pop()}`}
        id={`file-step-${file.messageToken}`}
        footer={{
          isNextDisabled: !decision, // Require a decision before moving forward
        }}
        status={decision === "apply" ? "success" : decision === "reject" ? "error" : "default"}
      >
        <div className="batch-review-wizard-step">
          {/* File Header */}
          <Flex
            direction={{ default: "row" }}
            spaceItems={{ default: "spaceItemsMd" }}
            alignItems={{ default: "alignItemsCenter" }}
            className="batch-review-file-info"
          >
            <FlexItem>
              <FileIcon style={{ fontSize: "1.5rem" }} />
            </FlexItem>
            <FlexItem flex={{ default: "flex_1" }} className="batch-review-file-path">
              <strong>{file.path}</strong>
            </FlexItem>
            <FlexItem>
              {file.isNew && <Label color="green">New File</Label>}
              {file.isDeleted && <Label color="red">Deleted</Label>}
            </FlexItem>
          </Flex>

          {/* Decision Status */}
          {decision && (
            <Alert
              variant={decision === "apply" ? AlertVariant.success : AlertVariant.danger}
              isInline
              title={
                decision === "apply"
                  ? "✓ This file will be applied"
                  : "✗ This file will be rejected"
              }
              style={{ marginTop: "1rem", marginBottom: "1rem" }}
            />
          )}

          {/* Primary Action - Review in Editor */}
          <div className="batch-review-primary-action" style={{ marginBottom: "1.5rem" }}>
            <Button
              variant="secondary"
              onClick={() => handleReviewWithDecorators(file)}
              isDisabled={isViewing}
              size="lg"
              isBlock
            >
              {isViewing ? "Reviewing in Editor..." : "📝 Review in Editor with Changes"}
            </Button>
            <p style={{ textAlign: "center", marginTop: "0.5rem", color: "#6a6e73" }}>
              <small>Opens file with inline decorators showing all changes</small>
            </p>
          </div>

          {/* Diff Preview */}
          <Card>
            <CardBody className="batch-review-diff-container">
              <ModifiedFileDiffPreview diff={file.diff} path={file.path} />
            </CardBody>
          </Card>

          {/* File Actions */}
          <div className="batch-review-file-actions" style={{ marginTop: "1.5rem" }}>
            <Flex
              justifyContent={{ default: "justifyContentSpaceBetween" }}
              spaceItems={{ default: "spaceItemsMd" }}
            >
              <FlexItem flex={{ default: "flex_1" }}>
                <Button
                  variant="danger"
                  onClick={() => handleReject(file)}
                  isBlock
                  isDisabled={decision === "reject"}
                >
                  {decision === "reject" ? "✓ Rejected" : "Reject File"}
                </Button>
              </FlexItem>
              <FlexItem flex={{ default: "flex_1" }}>
                <Button
                  variant="primary"
                  onClick={() => handleApply(file)}
                  isBlock
                  isDisabled={decision === "apply"}
                >
                  {decision === "apply" ? "✓ Applied" : "Apply File"}
                </Button>
              </FlexItem>
            </Flex>
          </div>
        </div>
      </WizardStep>
    );
  });

  // Final review step
  const reviewStep = (
    <WizardStep
      name="Review & Finish"
      id="review-step"
      footer={{
        nextButtonText: "Finish Review",
        onNext: handleWizardFinish,
      }}
    >
      <div className="batch-review-summary">
        <Alert
          variant={AlertVariant.success}
          isInline
          title={`Review complete! ${reviewedCount} of ${files.length} files processed`}
          style={{ marginBottom: "1.5rem" }}
        />

        <Card>
          <CardBody>
            <h3>Summary</h3>
            <Flex direction={{ default: "column" }} spaceItems={{ default: "spaceItemsSm" }}>
              {files.map((file) => {
                const decision = decisions.get(file.messageToken);
                return (
                  <FlexItem key={file.messageToken}>
                    <Flex
                      spaceItems={{ default: "spaceItemsSm" }}
                      alignItems={{ default: "alignItemsCenter" }}
                    >
                      <FlexItem>
                        {decision === "apply" ? (
                          <CheckCircleIcon color="green" />
                        ) : decision === "reject" ? (
                          <TimesCircleIcon color="red" />
                        ) : (
                          <span>⏳</span>
                        )}
                      </FlexItem>
                      <FlexItem flex={{ default: "flex_1" }}>{file.path}</FlexItem>
                      <FlexItem>
                        {decision === "apply" && <Label color="green">Applied</Label>}
                        {decision === "reject" && <Label color="red">Rejected</Label>}
                        {!decision && <Label>Pending</Label>}
                      </FlexItem>
                    </Flex>
                  </FlexItem>
                );
              })}
            </Flex>

            {reviewedCount < files.length && (
              <Alert
                variant={AlertVariant.warning}
                isInline
                title={`${files.length - reviewedCount} file(s) still pending review`}
                style={{ marginTop: "1rem" }}
              >
                You can use the &quot;Back&quot; button to review remaining files, or finish now and
                review them later.
              </Alert>
            )}
          </CardBody>
        </Card>

        {/* Batch Actions */}
        <div style={{ marginTop: "1.5rem" }}>
          <Flex spaceItems={{ default: "spaceItemsMd" }}>
            <FlexItem flex={{ default: "flex_1" }}>
              <Button variant="secondary" onClick={handleRejectAll} isBlock>
                Reject All Remaining Files
              </Button>
            </FlexItem>
            <FlexItem flex={{ default: "flex_1" }}>
              <Button variant="primary" onClick={handleApplyAll} isBlock>
                Apply All Remaining Files
              </Button>
            </FlexItem>
          </Flex>
        </div>
      </div>
    </WizardStep>
  );

  return (
    <Modal
      variant={ModalVariant.large}
      isOpen={true}
      aria-labelledby="batch-review-wizard-label"
      aria-describedby="batch-review-wizard-description"
      className="batch-review-modal"
    >
      <Wizard
        height={600}
        header={
          <WizardHeader
            title="Review Code Changes"
            titleId="batch-review-wizard-label"
            description={`Analysis prepared ${files.length} file changes for your review • ${reviewedCount}/${files.length} reviewed (${Math.round(progressPercentage)}%)`}
            descriptionId="batch-review-wizard-description"
            onClose={handleWizardClose}
            closeButtonAriaLabel="Close review wizard"
          />
        }
        onClose={handleWizardClose}
      >
        {fileSteps}
        {reviewStep}
      </Wizard>
    </Modal>
  );
};

export default BatchReviewModal;
