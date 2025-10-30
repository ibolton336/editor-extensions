import "./resolutionsPage.css";
import React, { useMemo, useCallback } from "react";
import { Page, PageSection, PageSidebar, PageSidebarBody, Title } from "@patternfly/react-core";
import { CheckCircleIcon } from "@patternfly/react-icons";
import {
  ChatMessage,
  ChatMessageType,
  Incident,
  type ToolMessageValue,
  type ModifiedFileMessageValue,
} from "@editor-extensions/shared";
import { openFile } from "../../hooks/actions";
import { IncidentTableGroup } from "../IncidentTable/IncidentTableGroup";
import { SentMessage } from "./SentMessage";
import { ReceivedMessage } from "./ReceivedMessage";
import { ToolMessage } from "./ToolMessage";
import { ModifiedFileMessage } from "./ModifiedFile";
import { useExtensionStore } from "../../store/store";
import { sendVscodeMessage as dispatch } from "../../utils/vscodeMessaging";
import {
  Chatbot,
  ChatbotContent,
  ChatbotDisplayMode,
  ChatbotFootnote,
  ChatbotFooter,
  MessageBox,
} from "@patternfly/chatbot";
import { ChatCard } from "./ChatCard/ChatCard";
import LoadingIndicator from "./LoadingIndicator";
import { MessageWrapper } from "./MessageWrapper";
import { useScrollManagement } from "../../hooks/useScrollManagement";

// Unified hook for both modes - using Zustand store
const useResolutionData = () => {
  const chatMessages = useExtensionStore((state) => state.chatMessages);
  const solutionState = useExtensionStore((state) => state.solutionState);
  const solutionScope = useExtensionStore((state) => state.solutionScope);
  const isFetchingSolution = useExtensionStore((state) => state.isFetchingSolution);
  const isAnalyzing = useExtensionStore((state) => state.isAnalyzing);
  const streamingMessageId = useExtensionStore((state) => state.streamingMessageId);
  const streamingContent = useExtensionStore((state) => state.streamingContent);

  const isTriggeredByUser = useMemo(
    () => Array.isArray(solutionScope?.incidents) && solutionScope?.incidents?.length > 0,
    [solutionScope?.incidents],
  );

  const hasNothingToView = useMemo(() => {
    return solutionState === "none" && (!Array.isArray(chatMessages) || chatMessages?.length === 0);
  }, [solutionState, chatMessages]);

  const hasContent = useMemo(() => {
    return (
      solutionState === "received" || (Array.isArray(chatMessages) && chatMessages?.length > 0)
    );
  }, [solutionState, chatMessages]);

  const hasResponseWithErrors = useMemo(
    () => false, // No longer tracking solution response errors
    [solutionState],
  );

  return {
    isTriggeredByUser,
    hasNothingToView,
    hasContent,
    hasResponseWithErrors,
    chatMessages,
    isFetchingSolution,
    isAnalyzing,
    solutionState,
    streamingMessageId,
    streamingContent,
  };
};

// Component for rendering user request messages
const UserRequestMessages: React.FC<{
  solutionScope: any;
  onIncidentClick: (incident: Incident) => void;
  isReadOnly: boolean;
}> = ({ solutionScope, onIncidentClick, isReadOnly }) => {
  const USER_REQUEST_MESSAGES: ChatMessage[] = [
    {
      kind: ChatMessageType.String,
      value: { message: "Here is the scope of what I would like you to fix:" },
      messageToken: "1",
      timestamp: new Date().toISOString(),
      extraContent: (
        <ChatCard color="yellow">
          <IncidentTableGroup
            onIncidentSelect={onIncidentClick}
            incidents={solutionScope?.incidents || []}
            isReadOnly={isReadOnly}
          />
        </ChatCard>
      ),
    },
    {
      kind: ChatMessageType.String,
      value: { message: "Please provide resolution for this issue." },
      messageToken: "2",
      timestamp: new Date().toISOString(),
    },
  ];

  return (
    <>
      {USER_REQUEST_MESSAGES.map((msg) => (
        <MessageWrapper key={msg.messageToken}>
          <SentMessage
            timestamp={msg.timestamp}
            content={msg.value.message as string}
            extraContent={msg.extraContent}
          />
        </MessageWrapper>
      ))}
    </>
  );
};

const ResolutionPage: React.FC = () => {
  // ✅ Selective subscriptions
  const solutionScope = useExtensionStore((state) => state.solutionScope);
  const isProcessingQueuedMessages = useExtensionStore((state) => state.isProcessingQueuedMessages);
  const isWaitingForUserInteraction = useExtensionStore(
    (state) => state.isWaitingForUserInteraction,
  );

  // Unified data hook
  const {
    isTriggeredByUser,
    hasNothingToView,
    chatMessages,
    isFetchingSolution,
    isAnalyzing,
    streamingMessageId,
    streamingContent,
  } = useResolutionData();

  // Show processing state while:
  // - Fetching solution from LLM
  // - Processing queued messages (in non-agent mode)
  // - Waiting for user interaction
  const isProcessing =
    isFetchingSolution || isProcessingQueuedMessages || isWaitingForUserInteraction;

  const { messageBoxRef, triggerScrollOnUserAction } = useScrollManagement(
    chatMessages,
    isProcessing,
  );

  // Event handlers
  const handleIncidentClick = (incident: Incident) =>
    dispatch(openFile(incident.uri, incident.lineNumber ?? 0));

  // Render chat messages
  const renderChatMessages = useCallback(() => {
    if (!Array.isArray(chatMessages) || chatMessages?.length === 0) {
      return null;
    }

    return chatMessages.map((msg) => {
      if (!msg) {
        return null;
      }

      if (msg.kind === ChatMessageType.Tool) {
        const { toolName, toolStatus } = msg.value as ToolMessageValue;
        return (
          <MessageWrapper key={msg.messageToken}>
            <ToolMessage
              toolName={toolName}
              status={toolStatus as "succeeded" | "failed" | "running"}
              timestamp={msg.timestamp}
            />
          </MessageWrapper>
        );
      }

      if (msg.kind === ChatMessageType.ModifiedFile) {
        const fileData = msg.value as ModifiedFileMessageValue;
        return (
          <MessageWrapper key={msg.messageToken}>
            <ModifiedFileMessage
              data={fileData}
              timestamp={msg.timestamp}
              onUserAction={triggerScrollOnUserAction}
            />
          </MessageWrapper>
        );
      }

      if (msg.kind === ChatMessageType.String) {
        const message = msg.value?.message as string;
        const selectedResponse = msg.selectedResponse;
        // Only use streaming content if this is the LAST message and actively streaming
        // This prevents out-of-order rendering and race conditions
        const isLastMessage =
          chatMessages[chatMessages.length - 1]?.messageToken === msg.messageToken;
        const displayContent =
          isLastMessage && streamingMessageId === msg.messageToken && streamingContent
            ? streamingContent
            : message;
        return (
          <MessageWrapper key={msg.messageToken}>
            <ReceivedMessage
              timestamp={msg.timestamp}
              content={displayContent}
              quickResponses={
                Array.isArray(msg.quickResponses) && msg.quickResponses.length > 0
                  ? msg.quickResponses.map((response) => ({
                      ...response,
                      messageToken: msg.messageToken,
                      isDisabled: response.id === "run-analysis" && isAnalyzing,
                      isSelected: selectedResponse === response.id,
                    }))
                  : undefined
              }
            />
          </MessageWrapper>
        );
      }

      return null;
    });
  }, [chatMessages, isFetchingSolution, isAnalyzing, triggerScrollOnUserAction, streamingMessageId, streamingContent]);

  return (
    <Page
      className="resolutions-page"
      sidebar={
        <PageSidebar isSidebarOpen={false}>
          <PageSidebarBody />
        </PageSidebar>
      }
    >
      <PageSection>
        <Title headingLevel="h1" size="2xl" style={{ display: "flex", alignItems: "center" }}>
          Generative AI Results
          {isProcessing && <LoadingIndicator />}
          {!isProcessing && <CheckCircleIcon style={{ marginLeft: "10px", color: "green" }} />}
        </Title>
      </PageSection>
      <Chatbot displayMode={ChatbotDisplayMode.embedded}>
        <ChatbotContent>
          <MessageBox ref={messageBoxRef} style={{ paddingBottom: "2rem" }}>
            {/* User request messages - shown in both modes when triggered by user */}
            {isTriggeredByUser && (
              <UserRequestMessages
                solutionScope={solutionScope}
                onIncidentClick={handleIncidentClick}
                isReadOnly={true}
              />
            )}

            {/* No content to view */}
            {hasNothingToView && (
              <MessageWrapper>
                <ReceivedMessage content="No resolutions available." />
              </MessageWrapper>
            )}

            {/* Render all content */}
            {renderChatMessages()}
          </MessageBox>
        </ChatbotContent>
        <ChatbotFooter>
          <ChatbotFootnote
            className="footnote"
            label="Always review AI generated content prior to use."
            popover={{
              title: "Verify information",
              description:
                "AI is experimental and can make mistakes. We cannot guarantee that all information provided by AI is up to date or without error. You should always verify responses using reliable sources, especially for crucial information and decision making.",
            }}
          />
        </ChatbotFooter>
      </Chatbot>
    </Page>
  );
};

export default ResolutionPage;
