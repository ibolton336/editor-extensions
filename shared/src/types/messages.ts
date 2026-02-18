import {
  RuleSet,
  EnhancedIncident,
  ChatMessage,
  AnalysisProfile,
  ConfigError,
  ServerState,
  SolutionState,
  Scope,
  PendingBatchReviewFile,
  HubConfig,
  GooseAgentState,
  GooseChatMessage,
} from "./types";

export const MessageTypes = {
  CHAT_MESSAGES_UPDATE: "CHAT_MESSAGES_UPDATE",
  CHAT_MESSAGE_STREAMING_UPDATE: "CHAT_MESSAGE_STREAMING_UPDATE",

  STATE_CHANGE: "STATE_CHANGE",
  FOCUS_VIOLATION: "FOCUS_VIOLATION",

  // Goose (experimental) — all goose messaging is self-contained here
  GOOSE_STATE_CHANGE: "GOOSE_STATE_CHANGE",
  GOOSE_CHAT_UPDATE: "GOOSE_CHAT_UPDATE",
  GOOSE_CHAT_STREAMING: "GOOSE_CHAT_STREAMING",
} as const;

export type MessageType = (typeof MessageTypes)[keyof typeof MessageTypes];

/**
 * Message types for VSCode extension -> Webview communication
 */

// Chat/messaging updates
export interface ChatMessagesUpdateMessage {
  type: "CHAT_MESSAGES_UPDATE";
  chatMessages: ChatMessage[];
  previousLength: number;
  timestamp: string;
}

// Chat streaming update (incremental - just one message)
export interface ChatMessageStreamingUpdateMessage {
  type: "CHAT_MESSAGE_STREAMING_UPDATE";
  message: ChatMessage;
  messageIndex: number;
  timestamp: string;
}

export interface StateChangeData {
  // Analysis
  ruleSets?: RuleSet[];
  enhancedIncidents?: EnhancedIncident[];
  isAnalyzing?: boolean;
  isAnalysisScheduled?: boolean;
  analysisProgress?: number;
  analysisProgressMessage?: string;

  // Solution workflow
  isFetchingSolution?: boolean;
  solutionState?: SolutionState;
  solutionScope?: Scope;
  isWaitingForUserInteraction?: boolean;
  isProcessingQueuedMessages?: boolean;
  pendingBatchReview?: PendingBatchReviewFile[];

  // Server
  serverState?: ServerState;
  isStartingServer?: boolean;
  isInitializingServer?: boolean;
  solutionServerConnected?: boolean;
  profileSyncConnected?: boolean;
  llmProxyAvailable?: boolean;

  // Profiles
  profiles?: AnalysisProfile[];
  activeProfileId?: string | null;
  isInTreeMode?: boolean;

  // Config errors
  configErrors?: ConfigError[];

  // Decorators
  activeDecorators?: Record<string, string>;

  // Settings
  solutionServerEnabled?: boolean;
  isAgentMode?: boolean;
  isContinueInstalled?: boolean;
  hubConfig?: HubConfig;
  hubForced?: boolean;
  profileSyncEnabled?: boolean;
  isSyncingProfiles?: boolean;
}

export interface StateChangeMessage {
  type: "STATE_CHANGE";
  data: StateChangeData;
  timestamp: string;
}

export interface FocusViolationMessage {
  type: "FOCUS_VIOLATION";
  violationId: string;
  violationMessage: string;
  timestamp: string;
}

// --- Goose (experimental) ---

export interface GooseStateChangeMessage {
  type: "GOOSE_STATE_CHANGE";
  gooseState: GooseAgentState;
  gooseError?: string;
  timestamp: string;
}

export interface GooseChatUpdateMessage {
  type: "GOOSE_CHAT_UPDATE";
  messages: GooseChatMessage[];
  timestamp: string;
}

export interface GooseChatStreamingMessage {
  type: "GOOSE_CHAT_STREAMING";
  messageId: string;
  content: string;
  done: boolean;
  timestamp: string;
}

/**
 * Union type of all possible webview messages
 */
export type WebviewMessage =
  | ChatMessagesUpdateMessage
  | ChatMessageStreamingUpdateMessage
  | StateChangeMessage
  | FocusViolationMessage
  | GooseStateChangeMessage
  | GooseChatUpdateMessage
  | GooseChatStreamingMessage;

/**
 * Type guards for message discrimination
 */
export function isChatMessagesUpdate(msg: WebviewMessage): msg is ChatMessagesUpdateMessage {
  return (msg as any).type === "CHAT_MESSAGES_UPDATE";
}

export function isChatMessageStreamingUpdate(
  msg: WebviewMessage,
): msg is ChatMessageStreamingUpdateMessage {
  return (msg as any).type === "CHAT_MESSAGE_STREAMING_UPDATE";
}

export function isStateChange(msg: WebviewMessage): msg is StateChangeMessage {
  return (msg as any).type === MessageTypes.STATE_CHANGE;
}

export function isFocusViolation(msg: WebviewMessage): msg is FocusViolationMessage {
  return (msg as any).type === MessageTypes.FOCUS_VIOLATION;
}

export function isGooseStateChange(msg: WebviewMessage): msg is GooseStateChangeMessage {
  return (msg as any).type === MessageTypes.GOOSE_STATE_CHANGE;
}

export function isGooseChatUpdate(msg: WebviewMessage): msg is GooseChatUpdateMessage {
  return (msg as any).type === MessageTypes.GOOSE_CHAT_UPDATE;
}

export function isGooseChatStreaming(msg: WebviewMessage): msg is GooseChatStreamingMessage {
  return (msg as any).type === MessageTypes.GOOSE_CHAT_STREAMING;
}
