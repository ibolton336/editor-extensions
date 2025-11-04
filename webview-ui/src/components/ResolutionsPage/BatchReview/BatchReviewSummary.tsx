import React, { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  CardFooter,
  Button,
  List,
  ListItem,
  Title,
  Label,
  Flex,
  FlexItem,
} from "@patternfly/react-core";
import { CheckCircleIcon } from "@patternfly/react-icons";
import { useExtensionStore } from "../../../store/store";
import { BatchReviewModal } from "./BatchReviewModal";
import "./batchReviewSummary.css";

export const BatchReviewSummary: React.FC = () => {
  const pendingFiles = useExtensionStore((state) => state.pendingBatchReview || []);
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (pendingFiles.length === 0) return null;

  const handleApplyAll = () => {
    // Send message to apply all files
    window.vscode.postMessage({
      type: "BATCH_APPLY_ALL",
      payload: {
        files: pendingFiles.map(f => ({
          messageToken: f.messageToken,
          path: f.path,
          content: f.content,
        })),
      },
    });
  };

  const handleRejectAll = () => {
    // Send message to reject all files
    window.vscode.postMessage({
      type: "BATCH_REJECT_ALL",
      payload: {
        files: pendingFiles.map(f => ({
          messageToken: f.messageToken,
          path: f.path,
        })),
      },
    });
  };

  return (
    <div className="batch-review-summary">
      <Card className="batch-review-summary-card">
        <CardHeader>
          <CardTitle>
            <Flex alignItems={{ default: "alignItemsCenter" }}>
              <FlexItem>
                <Title headingLevel="h3" size="lg">
                  📦 Changes Ready for Review
                </Title>
              </FlexItem>
              <FlexItem>
                <Label color="blue" isCompact>
                  {pendingFiles.length} files
                </Label>
              </FlexItem>
            </Flex>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <p style={{ marginBottom: "1rem", color: "#6a6e73" }}>
            All file changes have been prepared. Review each change or apply/reject all at once.
          </p>
          <List isPlain isBordered>
            {pendingFiles.slice(0, 8).map((file) => (
              <ListItem key={file.messageToken}>
                <Flex alignItems={{ default: "alignItemsCenter" }}>
                  <FlexItem>
                    <CheckCircleIcon color="green" />
                  </FlexItem>
                  <FlexItem>
                    <strong>{file.path}</strong>
                  </FlexItem>
                  <FlexItem>
                    {file.isNew && <Label color="green">New</Label>}
                    {file.isDeleted && <Label color="red">Deleted</Label>}
                  </FlexItem>
                </Flex>
              </ListItem>
            ))}
            {pendingFiles.length > 8 && (
              <ListItem>
                <em style={{ color: "#6a6e73" }}>
                  ... and {pendingFiles.length - 8} more files
                </em>
              </ListItem>
            )}
          </List>
        </CardBody>
        <CardFooter>
          <Flex spaceItems={{ default: "spaceItemsSm" }}>
            <FlexItem>
              <Button variant="primary" onClick={() => setIsModalOpen(true)}>
                Review Changes
              </Button>
            </FlexItem>
            <FlexItem>
              <Button variant="secondary" onClick={handleApplyAll}>
                Apply All ({pendingFiles.length})
              </Button>
            </FlexItem>
            <FlexItem>
              <Button variant="link" onClick={handleRejectAll}>
                Reject All
              </Button>
            </FlexItem>
          </Flex>
        </CardFooter>
      </Card>

      {isModalOpen && (
        <BatchReviewModal
          files={pendingFiles}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
};

export default BatchReviewSummary;
