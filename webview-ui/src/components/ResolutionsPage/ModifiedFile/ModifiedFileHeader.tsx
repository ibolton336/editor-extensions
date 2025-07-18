import React from "react";
import { CardTitle, Flex, FlexItem, Badge } from "@patternfly/react-core";

interface ModifiedFileHeaderProps {
  isNew: boolean;
  fileName: string;
  timestamp?: string;
  isPartialApply?: boolean;
}

export const ModifiedFileHeader: React.FC<ModifiedFileHeaderProps> = ({
  isNew,
  fileName,
  timestamp,
  isPartialApply = false,
}) => {
  const formattedTime = timestamp
    ? new Date(timestamp).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "";

  return (
    <CardTitle>
      <Flex>
        <FlexItem grow={{ default: "grow" }}>
          {isNew ? "Created file:" : "Modified file:"} <strong>{fileName}</strong>
          {isPartialApply && (
            <Badge isRead className="partial-apply-badge">
              Partial Apply
            </Badge>
          )}
        </FlexItem>
        {formattedTime && <FlexItem className="modified-file-timestamp">{formattedTime}</FlexItem>}
      </Flex>
    </CardTitle>
  );
};

export default ModifiedFileHeader;
