// ──────────────────────────────────────────────
// Chat: Message — mode-aware rendering
// ──────────────────────────────────────────────
import { cn } from "../../lib/utils";
import {
  User,
  Bot,
  ChevronLeft,
  ChevronRight,
  Copy,
  RefreshCw,
  Trash2,
  GitBranch,
  Pencil,
  Check,
  X,
  Flag,
  Eye,
  Brain,
} from "lucide-react";
import type { Message } from "@marinara-engine/shared";
import { memo, useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback, type ReactNode } from "react";
import type { CharacterMap } from "./ChatArea";
import { useApplyRegex } from "../../hooks/use-apply-regex";
import { useUIStore } from "../../stores/ui.store";
import DOMPurify from "dompurify";

interface PersonaInfo {
  name?: string;
  avatarUrl?: string;
  nameColor?: string;
  dialogueColor?: string;
  boxColor?: string;
}

interface ChatMessageProps {
  message: Message & { swipes?: Array<{ id: string; content: string }> };
  isStreaming?: boolean;
  index: number;
  onDelete?: (messageId: string) => void;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onSetActiveSwipe?: (messageId: string, index: number) => void;
  onToggleConversationStart?: (messageId: string, current: boolean) => void;
  onPeekPrompt?: () => void;
  onBranch?: (messageId: string) => void;
  isLastAssistantMessage?: boolean;
  characterMap?: CharacterMap;
  chatMode?: string;
  isGrouped?: boolean;
  personaInfo?: PersonaInfo;
  groupChatMode?: string;
  chatCharacterIds?: string[];
}

/** Regex to match <speaker="name">dialogue</speaker> tags. */
const SPEAKER_TAG_RE = /<speaker="([^"]*)">([\s\S]*?)<\/speaker>/g;

/**
 * Process speaker tags into ReactNodes with per-character dialogue coloring.
 * Non-speaker text gets the default dialogueColor.
 */
function renderWithSpeakerTags(
  text: string,
  defaultDialogueColor: string | undefined,
  speakerColorMap: Map<string, string> | undefined,
): ReactNode[] {
  if (!speakerColorMap || !SPEAKER_TAG_RE.test(text)) {
    return highlightDialogue(text, defaultDialogueColor);
  }
  SPEAKER_TAG_RE.lastIndex = 0;

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = SPEAKER_TAG_RE.exec(text)) !== null) {
    // Text before the speaker tag — use default color
    if (match.index > lastIndex) {
      nodes.push(...highlightDialogue(text.slice(lastIndex, match.index), defaultDialogueColor));
    }
    const speakerName = match[1]!;
    const dialogue = match[2]!;
    const speakerColor = speakerColorMap.get(speakerName) ?? defaultDialogueColor;
    // Render the dialogue content (without the tags) using the speaker's color
    nodes.push(<span key={`s${key++}`}>{highlightDialogue(dialogue, speakerColor)}</span>);
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last speaker tag
  if (lastIndex < text.length) {
    nodes.push(...highlightDialogue(text.slice(lastIndex), defaultDialogueColor));
  }

  return nodes;
}

/**
 * Apply markdown-style inline formatting: **bold** and *italic*.
 * Returns an array of ReactNodes.
 */
function applyInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  // Match **bold** first, then *italic* (order matters to avoid conflict)
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[2] != null) {
      // **bold**
      nodes.push(<strong key={`${keyPrefix}b${key++}`}>{match[2]}</strong>);
    } else if (match[3] != null) {
      // *italic*
      nodes.push(<em key={`${keyPrefix}i${key++}`}>{match[3]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes.length > 0 ? nodes : [text];
}

/**
 * Highlight quoted dialogue — text in "", "", «», or '' gets bold + colored.
 * Returns an array of ReactNodes (strings + <strong> elements).
 */
function highlightDialogue(text: string, dialogueColor?: string): ReactNode[] {
  // Match text in various quotation marks (curly doubles already normalised to straight)
  const regex = /(?:"([^"]+)"|«([^»]+)»|‘([^’]+)’)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match — apply inline markdown
    if (match.index > lastIndex) {
      nodes.push(...applyInlineMarkdown(text.slice(lastIndex, match.index), `d${key}`));
    }
    // The full match including quotes
    const fullMatch = match[0];
    // Determine which capture group matched
    const innerText = match[1] ?? match[2] ?? match[3] ?? "";
    // Get the opening and closing quotes from the full match
    const openQuote = fullMatch[0];
    const closeQuote = fullMatch[fullMatch.length - 1];

    nodes.push(
      <strong
        key={key++}
        style={dialogueColor ? { color: dialogueColor } : undefined}
        className={!dialogueColor ? "text-white" : undefined}
      >
        {openQuote}
        {innerText}
        {closeQuote}
      </strong>,
    );
    lastIndex = match.index + fullMatch.length;
  }

  // Add remaining text — apply inline markdown
  if (lastIndex < text.length) {
    nodes.push(...applyInlineMarkdown(text.slice(lastIndex), `d${key}`));
  }

  return nodes.length > 0 ? nodes : applyInlineMarkdown(text, "m");
}

/** Check whether text contains meaningful HTML tags. */
const HTML_TAG_RE =
  /<(?:div|span|style|table|p|br|img|a|ul|ol|li|h[1-6]|em|strong|b|i|pre|code|section|article|header|footer|nav|button|input|form|label|select|option|textarea|canvas|svg|video|audio|source|iframe|hr|blockquote|details|summary|figure|figcaption|main|aside|mark|small|sub|sup|del|ins|abbr|time|progress|meter|output|dialog|template|slot|ruby|rt|rp|bdi|bdo|wbr|area|map|track|embed|object|param|picture|portal|datalist|fieldset|legend|optgroup|caption|col|colgroup|thead|tbody|tfoot|th|td|dl|dt|dd|kbd|samp|var|cite|dfn|q|s|u|font|center)\b[^>]*>/i;

/**
 * Render message content, handling both plain text with dialogue highlighting
 * and HTML blocks that should be rendered as actual HTML.
 */
function renderContent(text: string, dialogueColor?: string, speakerColorMap?: Map<string, string>): ReactNode {
  // Normalise curly quotes to straight so they display consistently
  const normalized = text.replace(/[“”„‟]/g, '"').replace(/[‘’]/g, "'");

  // Strip speaker tags before HTML detection (they aren't real HTML)
  const withoutSpeakerTags = normalized.replace(/<\/?speaker(?:="[^"]*")?>/g, "");

  if (!HTML_TAG_RE.test(withoutSpeakerTags)) {
    // Split on *** horizontal rules (standalone line)
    const hrParts = normalized.split(/^\*{3,}$/m);
    if (hrParts.length > 1) {
      return (
        <>
          {hrParts.map((part, i) => (
            <span key={i}>
              {i > 0 && <hr className="my-3 border-t border-[var(--border)]" />}
              {renderWithSpeakerTags(part, dialogueColor, speakerColorMap)}
            </span>
          ))}
        </>
      );
    }
    return <>{renderWithSpeakerTags(normalized, dialogueColor, speakerColorMap)}</>;
  }

  // For HTML content, strip speaker tags before sanitizing
  const stripped = normalized.replace(SPEAKER_TAG_RE, "$2");

  // Convert newlines to <br> with compact spacing for HTML content
  const withBreaks = stripped.replace(/\n/g, '<br style="display:block;margin:0.2em 0">');

  // Content has HTML — sanitize and render it
  const clean = DOMPurify.sanitize(withBreaks, {
    ADD_TAGS: ["style"],
    ADD_ATTR: ["style", "class"],
    ALLOW_DATA_ATTR: true,
  });

  // Apply dialogue bolding inside sanitised HTML, but skip text already
  // wrapped in a <font color="..."> tag so author-specified colors take priority.
  const boldColor = dialogueColor ?? "white";
  const withDialogue = clean.replace(/(?<![=\w])"([^"<>]+)"/g, (match, inner, offset) => {
    // Find the last opening tag before this match — if it's an unclosed <font color=...>, skip
    const before = clean.slice(0, offset);
    const lastFontOpen = before.lastIndexOf("<font ");
    if (lastFontOpen !== -1) {
      const lastFontClose = before.lastIndexOf("</font>");
      if (lastFontClose < lastFontOpen) return match; // we're inside a <font> tag
    }
    return `<strong style="color:${boldColor}">"${inner}"</strong>`;
  });

  // Convert *** horizontal rules to <hr> tags in HTML path
  const withHr = withDialogue.replace(
    /(?:^|(?<=<br[^>]*>))\s*\*{3,}\s*(?:$|(?=<br[^>]*>))/g,
    '<hr style="margin:0.75em 0;border:0;border-top:1px solid var(--border)">',
  );

  // Apply markdown-style bold/italic in HTML path
  const withMarkdown = withHr
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");

  return <div dangerouslySetInnerHTML={{ __html: withMarkdown }} />;
}

/** Build style object for name color (supports gradients). */
function nameColorStyle(color?: string): React.CSSProperties | undefined {
  if (!color) return undefined;
  if (color.startsWith("linear-gradient")) {
    return {
      background: color,
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
    };
  }
  return { color };
}

export const ChatMessage = memo(function ChatMessage({
  message,
  isStreaming,
  index,
  onDelete,
  onRegenerate,
  onEdit,
  onSetActiveSwipe,
  onToggleConversationStart,
  onPeekPrompt,
  onBranch,
  isLastAssistantMessage,
  characterMap,
  chatMode,
  isGrouped,
  personaInfo,
  groupChatMode,
  chatCharacterIds,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isNarrator = message.role === "narrator";
  const isRoleplay = chatMode === "roleplay" || chatMode === "visual_novel";
  const chatFontSize = useUIStore((s) => s.chatFontSize);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showThinking, setShowThinking] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const scrollRestoreRef = useRef<{ el: HTMLElement; top: number } | null>(null);
  const msgRef = useRef<HTMLDivElement>(null);

  // Parse message extra for conversation start flag
  const extra = useMemo(() => {
    if (!message.extra) return {};
    return typeof message.extra === "string" ? JSON.parse(message.extra) : message.extra;
  }, [message.extra]);
  const isConversationStart = !!extra.isConversationStart;
  const thinking = extra.thinking as string | undefined;

  // Model name display
  const showModelName = useUIStore((s) => s.showModelName);
  const modelName = !isUser && showModelName ? (extra.generationInfo?.model ?? null) : null;
  const genInfo = !isUser && showModelName ? extra.generationInfo : null;
  const genLabel = useMemo(() => {
    if (!genInfo) return null;
    const parts: string[] = [];
    if (genInfo.model) parts.push(genInfo.model);
    if (genInfo.tokensPrompt != null || genInfo.tokensCompletion != null) {
      const p = genInfo.tokensPrompt ?? "?";
      const c = genInfo.tokensCompletion ?? "?";
      parts.push(`${p}→${c} tok`);
    }
    if (genInfo.durationMs != null) parts.push(`${(genInfo.durationMs / 1000).toFixed(1)}s`);
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [genInfo]);
  // useLayoutEffect runs after DOM mutation but before browser paint — prevents visible scroll jump
  useLayoutEffect(() => {
    if (editing && editRef.current) {
      editRef.current.style.height = editRef.current.scrollHeight + "px";
      editRef.current.focus({ preventScroll: true });
    }
    // Restore scroll position saved before the state change
    if (scrollRestoreRef.current) {
      scrollRestoreRef.current.el.scrollTop = scrollRestoreRef.current.top;
      scrollRestoreRef.current = null;
    }
  }, [editing]);

  const startEditing = useCallback(() => {
    const sp = msgRef.current?.closest("[class*='overflow-y']") as HTMLElement | null;
    if (sp) scrollRestoreRef.current = { el: sp, top: sp.scrollTop };
    setEditContent(message.content);
    setEditing(true);
  }, [message.content]);

  const handleSaveEdit = () => {
    if (editContent.trim() !== message.content) {
      onEdit?.(message.id, editContent.trim());
    }
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(message.content);
    setEditing(false);
  };

  // Apply regex scripts to AI output (assistant/narrator roles)
  const { applyToAIOutput } = useApplyRegex();

  // Resolve character info
  const charInfo = message.characterId && characterMap ? characterMap.get(message.characterId) : null;
  const userName = personaInfo?.name ?? "You";
  const charName = charInfo?.name ?? message.characterId ?? "Assistant";

  const displayContent = useMemo(() => {
    let text = isUser || isSystem ? message.content : applyToAIOutput(message.content);
    // Resolve common display macros
    text = text.replaceAll("{{user}}", userName);
    text = text.replaceAll("{{char}}", charName);
    return text;
  }, [message.content, isUser, isSystem, applyToAIOutput, userName, charName]);

  const displayName = isUser ? userName : charName;
  const avatarUrl = isUser ? (personaInfo?.avatarUrl ?? null) : (charInfo?.avatarUrl ?? null);

  // Resolve colors: character colors for assistant, persona colors for user
  const msgColors = isUser ? personaInfo : charInfo;
  const dialogueColor = msgColors?.dialogueColor;
  const boxBgColor = msgColors?.boxColor;
  const msgNameColor = msgColors?.nameColor;

  // Build speaker → dialogueColor map for group chat speaker tag coloring
  const speakerColorMap = useMemo(() => {
    if (!characterMap || characterMap.size <= 1) return undefined;
    const map = new Map<string, string>();
    for (const [, info] of characterMap) {
      if (info.name && info.dialogueColor) {
        map.set(info.name, info.dialogueColor);
      }
    }
    return map.size > 0 ? map : undefined;
  }, [characterMap]);

  // Merged group chat: cycling avatars + cycling name color
  const isMergedGroup = groupChatMode === "merged" && !isUser && chatCharacterIds && chatCharacterIds.length > 1;
  const mergedAvatars = useMemo(() => {
    if (!isMergedGroup || !characterMap || !chatCharacterIds) return [];
    return chatCharacterIds.map((id) => characterMap.get(id)?.avatarUrl).filter(Boolean) as string[];
  }, [isMergedGroup, characterMap, chatCharacterIds]);
  const mergedNameColors = useMemo(() => {
    if (!isMergedGroup || !characterMap || !chatCharacterIds) return [];
    const fallbackPalette = ["#c084fc", "#f472b6", "#fb923c", "#4ade80", "#60a5fa", "#facc15"];
    return chatCharacterIds.map((id, i) => {
      const raw = characterMap.get(id)?.nameColor;
      return raw || fallbackPalette[i % fallbackPalette.length]!;
    });
  }, [isMergedGroup, characterMap, chatCharacterIds]);
  // Cycle index for merged group avatars/names — driven by a ref + RAF to avoid re-renders
  const cycleIndexRef = useRef(0);
  const cycleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mergedNameRef = useRef<HTMLSpanElement>(null);
  const mergedAvatarRefs = useRef<(HTMLImageElement | null)[]>([]);

  useEffect(() => {
    if (!isMergedGroup) return;
    const total = Math.max(mergedAvatars.length, mergedNameColors.length);
    if (total <= 1) return;
    cycleTimerRef.current = setInterval(() => {
      cycleIndexRef.current = (cycleIndexRef.current + 1) % total;
      const idx = cycleIndexRef.current;
      // Update avatar opacity via DOM directly (no re-render)
      mergedAvatarRefs.current.forEach((img, i) => {
        if (img) img.style.opacity = i === idx ? "1" : "0";
      });
      // Update name color opacity via DOM directly
      const nameEl = mergedNameRef.current;
      if (nameEl) {
        const spans = nameEl.querySelectorAll<HTMLSpanElement>("[data-cycle-name]");
        spans.forEach((span, i) => {
          span.style.opacity = i === idx % mergedNameColors.length ? "1" : "0";
        });
      }
    }, 2000);
    return () => {
      if (cycleTimerRef.current) clearInterval(cycleTimerRef.current);
    };
  }, [isMergedGroup, mergedAvatars.length, mergedNameColors.length]);

  /** Build a stable style object for a given name color (gradient or plain). */
  function nameColorToStyle(c: string): React.CSSProperties {
    if (c.startsWith("linear-gradient")) {
      return {
        background: c,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      };
    }
    return { color: c, WebkitTextFillColor: c };
  }

  /** Render a stack of absolutely-positioned "Narrator" labels that crossfade via opacity. */
  const mergedNameElement =
    isMergedGroup && mergedNameColors.length > 0 ? (
      <span ref={mergedNameRef} className="relative inline-block">
        {/* Invisible sizer so the parent reserves the right width */}
        <span className="invisible">Narrator</span>
        {mergedNameColors.map((c, i) => (
          <span
            key={i}
            data-cycle-name
            className="absolute inset-0"
            style={{
              ...nameColorToStyle(c),
              opacity: i === 0 ? 1 : 0,
              transition: "opacity 1s ease",
            }}
          >
            Narrator
          </span>
        ))}
      </span>
    ) : null;

  // Render content with dialogue highlighting (or HTML rendering)
  const text = typeof displayContent === "string" ? displayContent : message.content;
  const isHtmlContent = HTML_TAG_RE.test(text);
  const renderedContent = useMemo(() => {
    return renderContent(text, dialogueColor, speakerColorMap);
  }, [text, dialogueColor, speakerColorMap]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ─── Swipe navigation ───
  const swipeCount = message.swipeCount ?? 0;
  const hasSwipes = swipeCount > 1;

  const handleSwipePrev = useCallback(() => {
    if (message.activeSwipeIndex > 0) {
      onSetActiveSwipe?.(message.id, message.activeSwipeIndex - 1);
    }
  }, [message.id, message.activeSwipeIndex, onSetActiveSwipe]);

  const handleSwipeNext = useCallback(() => {
    if (message.activeSwipeIndex < swipeCount - 1) {
      onSetActiveSwipe?.(message.id, message.activeSwipeIndex + 1);
    }
  }, [message.id, message.activeSwipeIndex, swipeCount, onSetActiveSwipe]);

  // ─── System messages (shared across modes) ───
  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <div className="rounded-full bg-[var(--secondary)] px-4 py-1.5 text-[11px] text-[var(--muted-foreground)]">
          {message.content}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // Roleplay Mode — immersive narrative
  // ═══════════════════════════════════════════════
  if (isRoleplay) {
    // Narrator messages
    if (isNarrator) {
      return (
        <div
          className="rpg-narrator-msg group animate-message-in mb-4 px-2"
          style={{ animationDelay: `${Math.min(index * 30, 200)}ms`, animationFillMode: "backwards" }}
        >
          <div className="relative rounded-xl border border-amber-500/10 bg-black/40 px-5 py-4">
            {/* Delete button */}
            {onDelete && (
              <button
                onClick={() => onDelete(message.id)}
                className="absolute right-2 top-2 rounded-md p-1 text-white/20 opacity-0 transition-all hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            )}
            <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-amber-400/70">
              <span className="h-px flex-1 bg-amber-400/20" />
              Narrator
              <span className="h-px flex-1 bg-amber-400/20" />
            </div>
            <div
              className="whitespace-pre-wrap text-amber-100/80 italic"
              style={{ fontSize: chatFontSize, lineHeight: 1.5 }}
            >
              {displayContent}
            </div>
          </div>
        </div>
      );
    }

    return (
      <>
        <div
          ref={msgRef}
          className={cn("group mb-4 flex gap-3 animate-message-in px-2", isUser && "flex-row-reverse")}
          style={{ animationDelay: `${Math.min(index * 30, 200)}ms`, animationFillMode: "backwards" }}
        >
          {/* Avatar Column */}
          {!isGrouped && (
            <div className="flex-shrink-0 pt-1">
              {isMergedGroup && mergedAvatars.length > 0 ? (
                <div className="rpg-avatar-glow relative h-10 w-10">
                  {mergedAvatars.map((url, i) => (
                    <img
                      key={url}
                      ref={(el) => {
                        mergedAvatarRefs.current[i] = el;
                      }}
                      src={url}
                      alt="Group"
                      className="absolute inset-0 h-10 w-10 rounded-full object-cover ring-2 ring-white/10 transition-opacity duration-700"
                      style={{ opacity: i === 0 ? 1 : 0 }}
                    />
                  ))}
                </div>
              ) : avatarUrl ? (
                <div className={cn(!isUser && "rpg-avatar-glow")}>
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="h-10 w-10 rounded-full object-cover ring-2 ring-white/10"
                  />
                </div>
              ) : (
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full ring-2 shadow-lg",
                    isUser
                      ? "bg-gradient-to-br from-neutral-500 to-neutral-600 ring-white/15"
                      : "bg-gradient-to-br from-purple-500 to-pink-600 ring-purple-400/20",
                  )}
                >
                  {isUser ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
                </div>
              )}
            </div>
          )}

          {/* Spacer if grouped (no avatar) */}
          {isGrouped && <div className="w-10 flex-shrink-0" />}

          {/* Content */}
          <div className={cn("flex max-w-[82%] flex-col gap-0.5", isUser && "items-end", editing && "w-[82%]")}>
            {/* Name + time (only if not grouped) */}
            {!isGrouped && (
              <div className={cn("flex items-baseline gap-2 px-1", isUser && "flex-row-reverse")}>
                <span
                  className={cn(
                    "text-[12px] font-bold tracking-tight",
                    !msgNameColor && !isMergedGroup && (isUser ? "text-neutral-300" : "rpg-char-name"),
                  )}
                  style={!isMergedGroup ? nameColorStyle(msgNameColor) : undefined}
                >
                  {isMergedGroup ? mergedNameElement : displayName}
                </span>
                <span className="text-[10px] text-white/30">{formatTime(message.createdAt)}</span>
                {genLabel && (
                  <span className="text-[9px] text-white/25 italic truncate max-w-[250px]" title={genLabel}>
                    {genLabel}
                  </span>
                )}
              </div>
            )}

            {/* Conversation start marker */}
            {isConversationStart && (
              <div className="flex items-center gap-1.5 px-1 mb-1">
                <span className="h-px flex-1 bg-amber-400/30" />
                <span className="text-[9px] font-semibold uppercase tracking-widest text-amber-400/70">New Start</span>
                <span className="h-px flex-1 bg-amber-400/30" />
              </div>
            )}

            {/* Message bubble */}
            <div
              className={cn(
                "relative rounded-2xl px-4 py-3",
                isUser
                  ? "rounded-tr-sm text-neutral-100 ring-1 ring-white/10"
                  : "rounded-tl-sm text-white/90 ring-1 ring-white/8",
                !boxBgColor && (isUser ? "bg-white/12" : "bg-white/8"),
                isGrouped && (isUser ? "rounded-tr-2xl" : "rounded-tl-2xl"),
                isStreaming && "rpg-streaming",
                isConversationStart && "ring-amber-400/30",
                editing && "w-full",
              )}
              style={{
                fontSize: chatFontSize,
                lineHeight: 1.5,
                ...(boxBgColor ? { backgroundColor: boxBgColor } : {}),
              }}
            >
              {editing ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    ref={editRef}
                    value={editContent}
                    onChange={(e) => {
                      setEditContent(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = e.target.scrollHeight + "px";
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSaveEdit();
                      if (e.key === "Escape") handleCancelEdit();
                    }}
                    className="w-full resize-none rounded-lg bg-black/30 px-3 py-2 text-white outline-none ring-1 ring-white/20 focus:ring-blue-400/50"
                    style={{ fontSize: chatFontSize, lineHeight: 1.5 }}
                  />
                  <div className="flex items-center gap-1.5 justify-end">
                    <button
                      onClick={handleCancelEdit}
                      className="rounded-md p-1 text-white/40 hover:bg-white/10 hover:text-white/70"
                      title="Cancel (Esc)"
                    >
                      <X size={13} />
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      className="rounded-md p-1 text-emerald-400/70 hover:bg-emerald-400/10 hover:text-emerald-400"
                      title="Save (Cmd+Enter)"
                    >
                      <Check size={13} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className={cn("break-words", !isHtmlContent && "whitespace-pre-wrap")}>
                  {isStreaming && !message.content ? (
                    <div className="flex items-center gap-1 py-0.5">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400/60 [animation-delay:0ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400/60 [animation-delay:150ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400/60 [animation-delay:300ms]" />
                    </div>
                  ) : (
                    <>
                      {renderedContent}
                      {isStreaming && (
                        <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse rounded-full bg-blue-400" />
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Swipes */}
            {hasSwipes && (
              <div className="flex items-center gap-1.5 px-1 text-[10px] text-white/40">
                <button
                  className="rounded-md p-0.5 transition-colors hover:bg-white/10 disabled:opacity-30"
                  onClick={handleSwipePrev}
                  disabled={message.activeSwipeIndex <= 0}
                >
                  <ChevronLeft size={12} />
                </button>
                <span className="tabular-nums">
                  {message.activeSwipeIndex + 1}/{swipeCount}
                </span>
                <button
                  className="rounded-md p-0.5 transition-colors hover:bg-white/10 disabled:opacity-30"
                  onClick={handleSwipeNext}
                  disabled={message.activeSwipeIndex >= swipeCount - 1}
                >
                  <ChevronRight size={12} />
                </button>
              </div>
            )}

            {/* Hover actions */}
            <div
              className={cn(
                "flex items-center gap-0.5 px-1 opacity-0 transition-all group-hover:opacity-100",
                isUser && "flex-row-reverse",
              )}
            >
              <ActionBtn icon={copied ? "\u2713" : <Copy size={11} />} onClick={handleCopy} title="Copy" dark />
              <ActionBtn icon={<Pencil size={11} />} onClick={startEditing} title="Edit" dark />
              <ActionBtn
                icon={<RefreshCw size={11} />}
                onClick={() => onRegenerate?.(message.id)}
                title="Regenerate"
                dark
              />
              <ActionBtn
                icon={<Flag size={11} />}
                onClick={() => onToggleConversationStart?.(message.id, isConversationStart)}
                title={isConversationStart ? "Remove conversation start" : "Mark as new start"}
                className={isConversationStart ? "text-amber-400/80 hover:text-amber-300" : undefined}
                dark
              />
              {isLastAssistantMessage && !isUser && (
                <ActionBtn icon={<Eye size={11} />} onClick={() => onPeekPrompt?.()} title="Peek prompt" dark />
              )}
              {thinking && !isUser && (
                <ActionBtn
                  icon={<Brain size={11} />}
                  onClick={() => setShowThinking(true)}
                  title="View thoughts"
                  dark
                />
              )}
              <ActionBtn
                icon={<GitBranch size={11} />}
                onClick={() => onBranch?.(message.id)}
                title="Branch from here"
                dark
              />
              <ActionBtn
                icon={<Trash2 size={11} />}
                onClick={() => onDelete?.(message.id)}
                title="Delete"
                className="hover:text-red-400"
                dark
              />
            </div>
          </div>
        </div>

        {/* Thinking modal */}
        {showThinking && thinking && <ThinkingModal thinking={thinking} onClose={() => setShowThinking(false)} />}
      </>
    );
  }

  // ═══════════════════════════════════════════════
  // Conversation Mode — iMessage / texting style
  // ═══════════════════════════════════════════════
  return (
    <div
      ref={msgRef}
      className={cn(
        "group flex animate-message-in",
        isUser ? "justify-end" : "justify-start",
        isGrouped ? "mb-0.5" : "mb-3",
      )}
      style={{ animationDelay: `${Math.min(index * 30, 200)}ms`, animationFillMode: "backwards" }}
    >
      <div className={cn("flex max-w-[72%] gap-2", isUser && "flex-row-reverse", editing && "w-[85%] max-w-[85%]")}>
        {/* Avatar — only show for first in group */}
        {(!isUser || avatarUrl) && (
          <div className={cn("flex-shrink-0 self-end", isGrouped && "invisible")}>
            {isMergedGroup && mergedAvatars.length > 0 ? (
              <div className="relative h-8 w-8">
                {mergedAvatars.map((url, i) => (
                  <img
                    key={url}
                    ref={(el) => {
                      mergedAvatarRefs.current[i] = el;
                    }}
                    src={url}
                    alt="Group"
                    className="absolute inset-0 h-8 w-8 rounded-full object-cover transition-opacity duration-700"
                    style={{ opacity: i === 0 ? 1 : 0 }}
                  />
                ))}
              </div>
            ) : avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-[11px] font-bold text-[var(--muted-foreground)]">
                {displayName[0]}
              </div>
            )}
          </div>
        )}

        <div className={cn("flex flex-col gap-0.5", isUser ? "items-end" : "items-start", editing && "w-full")}>
          {/* Name — only for first in group */}
          {!isGrouped && !isUser && (
            <span
              className={cn(
                "px-3 text-[11px] font-semibold",
                !msgNameColor && !isMergedGroup && "text-[var(--muted-foreground)]",
              )}
              style={!isMergedGroup ? nameColorStyle(msgNameColor) : undefined}
            >
              {isMergedGroup ? mergedNameElement : displayName}
            </span>
          )}

          {/* Conversation start marker */}
          {isConversationStart && (
            <div className="flex items-center gap-1.5 px-2 mb-0.5">
              <span className="h-px flex-1 bg-amber-500/30" />
              <span className="text-[9px] font-semibold uppercase tracking-widest text-amber-500/70">New Start</span>
              <span className="h-px flex-1 bg-amber-500/30" />
            </div>
          )}

          {/* Bubble */}
          <div
            className={cn(
              "texting-bubble relative px-3.5 py-2",
              isUser
                ? "texting-bubble-user rounded-2xl rounded-br-md"
                : "texting-bubble-other rounded-2xl rounded-bl-md",
              isGrouped && isUser && "rounded-br-2xl rounded-tr-md",
              isGrouped && !isUser && "rounded-bl-2xl rounded-tl-md",
              isStreaming && "ring-2 ring-[var(--primary)]/20",
              isConversationStart && "ring-1 ring-amber-500/30",
              editing && "w-full",
            )}
            style={{ fontSize: chatFontSize, lineHeight: 1.5, ...(boxBgColor ? { backgroundColor: boxBgColor } : {}) }}
          >
            {editing ? (
              <div className="flex flex-col gap-2">
                <textarea
                  ref={editRef}
                  value={editContent}
                  onChange={(e) => {
                    setEditContent(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = e.target.scrollHeight + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSaveEdit();
                    if (e.key === "Escape") handleCancelEdit();
                  }}
                  className="w-full resize-none rounded-lg bg-[var(--secondary)] px-3 py-2 outline-none ring-1 ring-[var(--primary)]/40"
                  style={{ fontSize: chatFontSize, lineHeight: 1.5 }}
                />
                <div className="flex items-center gap-1.5 justify-end">
                  <button
                    onClick={handleCancelEdit}
                    className="rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                    title="Cancel (Esc)"
                  >
                    <X size={12} />
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="rounded-md p-1 text-emerald-500 hover:bg-emerald-500/10"
                    title="Save (Cmd+Enter)"
                  >
                    <Check size={12} />
                  </button>
                </div>
              </div>
            ) : (
              <div className={cn("break-words", !isHtmlContent && "whitespace-pre-wrap")}>
                {isStreaming && !message.content ? (
                  <div className="flex items-center gap-1 py-0.5">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--muted-foreground)]/60 [animation-delay:0ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--muted-foreground)]/60 [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--muted-foreground)]/60 [animation-delay:300ms]" />
                  </div>
                ) : (
                  <>
                    {renderedContent}
                    {isStreaming && (
                      <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse rounded-full bg-white/70" />
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Timestamp + model — only for last in a group or standalone */}
          {!isGrouped && (
            <div className={cn("flex items-center gap-2 px-3", isUser && "flex-row-reverse")}>
              <span className="text-[10px] text-[var(--muted-foreground)]/50">{formatTime(message.createdAt)}</span>
              {genLabel && (
                <span
                  className="text-[9px] text-[var(--muted-foreground)]/40 italic truncate max-w-[250px]"
                  title={genLabel}
                >
                  {genLabel}
                </span>
              )}
            </div>
          )}

          {/* Swipes */}
          {hasSwipes && (
            <div className="flex items-center gap-1.5 px-2 text-[10px] text-[var(--muted-foreground)]">
              <button
                className="rounded p-0.5 transition-colors hover:bg-[var(--accent)] disabled:opacity-30"
                onClick={handleSwipePrev}
                disabled={message.activeSwipeIndex <= 0}
              >
                <ChevronLeft size={11} />
              </button>
              <span className="tabular-nums">
                {message.activeSwipeIndex + 1}/{swipeCount}
              </span>
              <button
                className="rounded p-0.5 transition-colors hover:bg-[var(--accent)] disabled:opacity-30"
                onClick={handleSwipeNext}
                disabled={message.activeSwipeIndex >= swipeCount - 1}
              >
                <ChevronRight size={11} />
              </button>
            </div>
          )}

          {/* Hover actions */}
          <div
            className={cn(
              "flex items-center gap-0 px-1 opacity-0 transition-all group-hover:opacity-100",
              isUser && "flex-row-reverse",
            )}
          >
            <ActionBtn icon={copied ? "✓" : <Copy size={10} />} onClick={handleCopy} title="Copy" />
            <ActionBtn icon={<Pencil size={10} />} onClick={startEditing} title="Edit" />
            <ActionBtn icon={<RefreshCw size={10} />} onClick={() => onRegenerate?.(message.id)} title="Regenerate" />
            <ActionBtn
              icon={<Flag size={10} />}
              onClick={() => onToggleConversationStart?.(message.id, isConversationStart)}
              title={isConversationStart ? "Remove conversation start" : "Mark as new start"}
              className={isConversationStart ? "text-amber-500" : undefined}
            />
            {isLastAssistantMessage && !isUser && (
              <ActionBtn icon={<Eye size={10} />} onClick={() => onPeekPrompt?.()} title="Peek prompt" />
            )}
            {thinking && !isUser && (
              <ActionBtn icon={<Brain size={10} />} onClick={() => setShowThinking(true)} title="View thoughts" />
            )}
            <ActionBtn icon={<GitBranch size={10} />} onClick={() => onBranch?.(message.id)} title="Branch from here" />
            <ActionBtn
              icon={<Trash2 size={10} />}
              onClick={() => onDelete?.(message.id)}
              title="Delete"
              className="hover:text-[var(--destructive)]"
            />
          </div>
        </div>
      </div>

      {/* Thinking modal */}
      {showThinking && thinking && <ThinkingModal thinking={thinking} onClose={() => setShowThinking(false)} />}
    </div>
  );
});

// ── Thinking modal ──
function ThinkingModal({ thinking, onClose }: { thinking: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="relative mx-4 flex max-h-[70vh] w-full max-w-xl flex-col rounded-xl bg-[var(--card)] shadow-2xl ring-1 ring-[var(--border)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
            <Brain size={14} className="text-[var(--muted-foreground)]" />
            Model Thoughts
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
          >
            <X size={14} />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-3">
          <pre className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--muted-foreground)]">
            {thinking}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ── Action button ──
function ActionBtn({
  icon,
  onClick,
  title,
  className,
  dark,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
  className?: string;
  dark?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-md p-1 transition-all active:scale-90",
        dark
          ? "text-white/40 hover:bg-white/10 hover:text-white/70"
          : "text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]",
        className,
      )}
    >
      {icon}
    </button>
  );
}

function formatTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
