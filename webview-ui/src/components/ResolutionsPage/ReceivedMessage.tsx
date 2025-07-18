import "./receivedMessage.css";
import React, { useState } from "react";
import { Message } from "@patternfly/chatbot";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import botAv from "./bot_avatar.svg?inline";
import { QuickResponse } from "../../../../shared/src/types/types";

interface QuickResponseWithToken extends QuickResponse {
  messageToken: string;
}

interface ReceivedMessageProps {
  content?: string;
  extraContent?: React.ReactNode;
  isLoading?: boolean;
  timestamp?: string | Date;
  quickResponses?: QuickResponseWithToken[];
  isProcessing?: boolean;
}

export const ReceivedMessage: React.FC<ReceivedMessageProps> = ({
  content,
  extraContent,
  isLoading,
  timestamp = new Date(),
  quickResponses,
  isProcessing = false,
}) => {
  const [selectedResponse, setSelectedResponse] = useState<string | null>(null);

  if (!content && !extraContent && !quickResponses?.length) {
    return null;
  }

  const formatTimestamp = (time: string | Date): string => {
    const date = typeof time === "string" ? new Date(time) : time;
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const handleQuickResponse = (responseId: string, messageToken: string) => {
    setSelectedResponse(responseId);
    window.vscode.postMessage({
      type: "QUICK_RESPONSE",
      payload: {
        responseId,
        messageToken,
      },
    });
  };

  const mappedQuickResponses = quickResponses?.map((response) => ({
    ...response,
    onClick: () => handleQuickResponse(response.id, response.messageToken),
    isDisabled: response.isDisabled || isProcessing || selectedResponse !== null,
    content: selectedResponse === response.id ? `✓ ${response.content}` : response.content,
  }));

  return (
    <Message
      timestamp={formatTimestamp(timestamp)}
      name="Konveyor"
      role="bot"
      avatar={botAv}
      content={content}
      quickResponses={mappedQuickResponses}
      extraContent={
        extraContent
          ? {
              afterMainContent: extraContent,
            }
          : undefined
      }
      additionalRehypePlugins={[rehypeRaw, rehypeSanitize]}
    />
  );
};

export default ReceivedMessage;
