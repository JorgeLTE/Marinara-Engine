import { Suspense, lazy, type ComponentProps } from "react";
import type { SpriteSide } from "@marinara-engine/shared";
import { Trash2 } from "lucide-react";
import { PinnedImageOverlay } from "./PinnedImageOverlay";
import type { PeekPromptData } from "./chat-area.types";

const ChatSettingsDrawer = lazy(async () => {
  const module = await import("./ChatSettingsDrawer");
  return { default: module.ChatSettingsDrawer };
});

const ChatFilesDrawer = lazy(async () => {
  const module = await import("./ChatFilesDrawer");
  return { default: module.ChatFilesDrawer };
});

const ChatGalleryDrawer = lazy(async () => {
  const module = await import("./ChatGalleryDrawer");
  return { default: module.ChatGalleryDrawer };
});

const ChatSetupWizard = lazy(async () => {
  const module = await import("./ChatSetupWizard");
  return { default: module.ChatSetupWizard };
});

const PeekPromptModal = lazy(async () => {
  const module = await import("./PeekPromptModal");
  return { default: module.PeekPromptModal };
});

type ChatData = ComponentProps<typeof ChatSettingsDrawer>["chat"];

type SharedSceneSettingsProps = {
  spriteArrangeMode: boolean;
  onToggleSpriteArrange: () => void;
  onResetSpritePlacements: () => void;
  onSpriteSideChange: (side: SpriteSide) => void;
};

type DeleteDialogProps = {
  messageId: string | null;
  onConfirm: () => void;
  onDeleteMore: () => void;
  onClose: () => void;
};

function DeleteConfirmationDialog({ messageId, onConfirm, onDeleteMore, onClose }: DeleteDialogProps) {
  if (!messageId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="mx-4 w-full max-w-xs rounded-xl bg-[var(--card)] p-5 shadow-2xl ring-1 ring-[var(--border)]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-4 text-center text-sm font-semibold">How to proceed?</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onConfirm}
            className="rounded-lg bg-[var(--destructive)] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--destructive)]/80"
          >
            Delete this message
          </button>
          <button
            onClick={onDeleteMore}
            className="rounded-lg bg-[var(--secondary)] px-4 py-2 text-xs font-medium transition-colors hover:bg-[var(--accent)]"
          >
            Delete more
          </button>
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

type MultiSelectBarProps = {
  open: boolean;
  selectedCount: number;
  onDelete: () => void;
  onCancel: () => void;
};

function MultiSelectBar({ open, selectedCount, onDelete, onCancel }: MultiSelectBarProps) {
  if (!open) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-[var(--card)] px-5 py-3 shadow-2xl ring-1 ring-[var(--border)]">
      <span className="text-xs font-medium text-[var(--muted-foreground)]">{selectedCount} selected</span>
      <button
        onClick={onDelete}
        disabled={selectedCount === 0}
        className="flex items-center gap-1.5 rounded-lg bg-[var(--destructive)] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--destructive)]/80 disabled:opacity-40"
      >
        <Trash2 size="0.75rem" />
        Delete selected
      </button>
      <button
        onClick={onCancel}
        className="rounded-lg px-4 py-2 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)]"
      >
        Cancel
      </button>
    </div>
  );
}

type ChatCommonOverlaysProps = {
  chat: ChatData | null | undefined;
  activeChatId: string;
  settingsOpen: boolean;
  filesOpen: boolean;
  galleryOpen: boolean;
  wizardOpen: boolean;
  peekPromptData: PeekPromptData | null;
  deleteDialogMessageId: string | null;
  multiSelectMode: boolean;
  selectedMessageCount: number;
  sceneSettings: SharedSceneSettingsProps;
  onCloseSettings: () => void;
  onCloseFiles: () => void;
  onCloseGallery: () => void;
  onWizardFinish: () => void;
  onClosePeekPrompt: () => void;
  onDeleteConfirm: () => void;
  onDeleteMore: () => void;
  onCloseDeleteDialog: () => void;
  onBulkDelete: () => void;
  onCancelMultiSelect: () => void;
};

export function ChatCommonOverlays({
  chat,
  activeChatId,
  settingsOpen,
  filesOpen,
  galleryOpen,
  wizardOpen,
  peekPromptData,
  deleteDialogMessageId,
  multiSelectMode,
  selectedMessageCount,
  sceneSettings,
  onCloseSettings,
  onCloseFiles,
  onCloseGallery,
  onWizardFinish,
  onClosePeekPrompt,
  onDeleteConfirm,
  onDeleteMore,
  onCloseDeleteDialog,
  onBulkDelete,
  onCancelMultiSelect,
}: ChatCommonOverlaysProps) {
  return (
    <>
      {chat && (
        <Suspense fallback={null}>
          {settingsOpen && (
            <ChatSettingsDrawer
              chat={chat}
              open={settingsOpen}
              onClose={onCloseSettings}
              spriteArrangeMode={sceneSettings.spriteArrangeMode}
              onToggleSpriteArrange={sceneSettings.onToggleSpriteArrange}
              onResetSpritePlacements={sceneSettings.onResetSpritePlacements}
              onSpriteSideChange={sceneSettings.onSpriteSideChange}
            />
          )}
        </Suspense>
      )}
      {chat && (
        <Suspense fallback={null}>
          {filesOpen && <ChatFilesDrawer chat={chat} open={filesOpen} onClose={onCloseFiles} />}
        </Suspense>
      )}
      {chat && (
        <Suspense fallback={null}>
          {galleryOpen && <ChatGalleryDrawer chat={chat} open={galleryOpen} onClose={onCloseGallery} />}
        </Suspense>
      )}
      {chat && (
        <Suspense fallback={null}>
          {wizardOpen && <ChatSetupWizard chat={chat} onFinish={onWizardFinish} />}
        </Suspense>
      )}
      <PinnedImageOverlay activeChatId={activeChatId} />
      <Suspense fallback={null}>
        {peekPromptData && <PeekPromptModal data={peekPromptData} onClose={onClosePeekPrompt} />}
      </Suspense>
      <DeleteConfirmationDialog
        messageId={deleteDialogMessageId}
        onConfirm={onDeleteConfirm}
        onDeleteMore={onDeleteMore}
        onClose={onCloseDeleteDialog}
      />
      <MultiSelectBar
        open={multiSelectMode}
        selectedCount={selectedMessageCount}
        onDelete={onBulkDelete}
        onCancel={onCancelMultiSelect}
      />
    </>
  );
}
