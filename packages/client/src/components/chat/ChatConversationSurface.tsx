import type { ComponentProps } from "react";
import type { Message, SpriteSide } from "@marinara-engine/shared";
import { ConversationView } from "./ConversationView";
import { ChatCommonOverlays } from "./ChatCommonOverlays";
import type { CharacterMap, PeekPromptData, PersonaInfo } from "./chat-area.types";

type SceneInfo =
  | {
      variant: "origin";
      sceneChatId: string;
    }
  | {
      variant: "scene";
      sceneChatId: string;
      originChatId?: string;
      description?: string;
    };

type ConversationSurfaceProps = {
  activeChatId: string;
  chat: ComponentProps<typeof ChatCommonOverlays>["chat"];
  messages: Message[] | undefined;
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  pageCount: number;
  characterMap: CharacterMap;
  characterNames: string[];
  personaInfo?: PersonaInfo;
  chatCharIds: string[];
  connectedChatName?: string;
  sceneInfo?: SceneInfo;
  settingsOpen: boolean;
  filesOpen: boolean;
  galleryOpen: boolean;
  wizardOpen: boolean;
  peekPromptData: PeekPromptData | null;
  deleteDialogMessageId: string | null;
  multiSelectMode: boolean;
  selectedMessageIds: Set<string>;
  spriteArrangeMode: boolean;
  onDelete: (messageId: string) => void;
  onRegenerate: (messageId: string) => void;
  onEdit: (messageId: string, content: string) => void;
  onPeekPrompt: () => void;
  onToggleSelectMessage: (messageId: string) => void;
  onSwitchChat?: () => void;
  onConcludeScene?: () => void;
  onAbandonScene?: () => void;
  onOpenSettings: () => void;
  onOpenFiles: () => void;
  onOpenGallery: () => void;
  onCloseSettings: () => void;
  onCloseFiles: () => void;
  onCloseGallery: () => void;
  onWizardFinish: () => void;
  onClosePeekPrompt: () => void;
  onResetSpritePlacements: () => void;
  onSpriteSideChange: (side: SpriteSide) => void;
  onToggleSpriteArrange: () => void;
  onDeleteConfirm: () => void;
  onDeleteMore: () => void;
  onCloseDeleteDialog: () => void;
  onBulkDelete: () => void;
  onCancelMultiSelect: () => void;
  lastAssistantMessageId: string | null;
};

export function ChatConversationSurface({
  activeChatId,
  chat,
  messages,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  pageCount,
  characterMap,
  characterNames,
  personaInfo,
  chatCharIds,
  connectedChatName,
  sceneInfo,
  settingsOpen,
  filesOpen,
  galleryOpen,
  wizardOpen,
  peekPromptData,
  deleteDialogMessageId,
  multiSelectMode,
  selectedMessageIds,
  spriteArrangeMode,
  onDelete,
  onRegenerate,
  onEdit,
  onPeekPrompt,
  onToggleSelectMessage,
  onSwitchChat,
  onConcludeScene,
  onAbandonScene,
  onOpenSettings,
  onOpenFiles,
  onOpenGallery,
  onCloseSettings,
  onCloseFiles,
  onCloseGallery,
  onWizardFinish,
  onClosePeekPrompt,
  onResetSpritePlacements,
  onSpriteSideChange,
  onToggleSpriteArrange,
  onDeleteConfirm,
  onDeleteMore,
  onCloseDeleteDialog,
  onBulkDelete,
  onCancelMultiSelect,
  lastAssistantMessageId,
}: ConversationSurfaceProps) {
  return (
    <div data-component="ChatArea.Conversation" className="flex flex-1 overflow-hidden">
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <ConversationView
          chatId={activeChatId}
          messages={messages}
          isLoading={isLoading}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={fetchNextPage}
          pageCount={pageCount}
          characterMap={characterMap}
          characterNames={characterNames}
          personaInfo={personaInfo}
          chatCharIds={chatCharIds}
          onDelete={onDelete}
          onRegenerate={onRegenerate}
          onEdit={onEdit}
          onPeekPrompt={onPeekPrompt}
          lastAssistantMessageId={lastAssistantMessageId}
          onOpenSettings={onOpenSettings}
          onOpenFiles={onOpenFiles}
          onOpenGallery={onOpenGallery}
          multiSelectMode={multiSelectMode}
          selectedMessageIds={selectedMessageIds}
          onToggleSelectMessage={onToggleSelectMessage}
          connectedChatName={connectedChatName}
          onSwitchChat={onSwitchChat}
          sceneInfo={sceneInfo}
          onConcludeScene={onConcludeScene}
          onAbandonScene={onAbandonScene}
        />
      </div>

      <ChatCommonOverlays
        chat={chat}
        activeChatId={activeChatId}
        settingsOpen={settingsOpen}
        filesOpen={filesOpen}
        galleryOpen={galleryOpen}
        wizardOpen={wizardOpen}
        peekPromptData={peekPromptData}
        deleteDialogMessageId={deleteDialogMessageId}
        multiSelectMode={multiSelectMode}
        selectedMessageCount={selectedMessageIds.size}
        sceneSettings={{
          spriteArrangeMode,
          onToggleSpriteArrange,
          onResetSpritePlacements,
          onSpriteSideChange,
        }}
        onCloseSettings={onCloseSettings}
        onCloseFiles={onCloseFiles}
        onCloseGallery={onCloseGallery}
        onWizardFinish={onWizardFinish}
        onClosePeekPrompt={onClosePeekPrompt}
        onDeleteConfirm={onDeleteConfirm}
        onDeleteMore={onDeleteMore}
        onCloseDeleteDialog={onCloseDeleteDialog}
        onBulkDelete={onBulkDelete}
        onCancelMultiSelect={onCancelMultiSelect}
      />
    </div>
  );
}
