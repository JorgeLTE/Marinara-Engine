// ──────────────────────────────────────────────
// Game: Choice Cards UI
//
// Renders VN-style clickable choice cards when the
// GM emits [choices: "A" | "B" | "C"] tags.
// ──────────────────────────────────────────────
import { useState } from "react";
import { cn } from "../../lib/utils";
import { AnimatedText } from "./AnimatedText";

interface GameChoiceCardsProps {
  choices: string[];
  onSelect: (choice: string) => void;
  disabled?: boolean;
}

export function GameChoiceCards({ choices, onSelect, disabled }: GameChoiceCardsProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const handleSelect = (choice: string, index: number) => {
    if (disabled || selected !== null) return;
    setSelected(index);
    // Brief animation before sending
    setTimeout(() => {
      onSelect(choice);
    }, 300);
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-3 pb-3">
      <div className="flex max-h-[min(52dvh,calc(100dvh-10.5rem))] flex-col rounded-2xl border border-white/15 bg-black/50 p-3 backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.3)] md:max-h-none">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-white/90">
            Choose your action
          </span>
        </div>

        <div className="flex flex-col gap-2 overflow-y-auto overscroll-contain pr-1">
          {choices.map((choice, i) => (
            <button
              key={i}
              onClick={() => handleSelect(choice, i)}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              disabled={disabled || selected !== null}
              className={cn(
                "group relative overflow-hidden rounded-xl border px-4 py-3 text-left text-sm transition-all duration-200",
                selected === i
                  ? "border-[var(--primary)]/50 bg-[var(--primary)]/20 text-white ring-2 ring-[var(--primary)]/30 scale-[0.98]"
                  : selected !== null
                    ? "border-white/5 bg-white/3 text-white/30 opacity-50"
                    : "border-white/10 bg-white/5 text-white/90 hover:border-[var(--primary)]/30 hover:bg-[var(--primary)]/10 hover:text-white",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              {/* Choice number badge */}
              <span
                className={cn(
                  "mr-2.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[0.625rem] font-bold transition-colors",
                  selected === i
                    ? "bg-[var(--primary)] text-white"
                    : hoveredIndex === i
                      ? "bg-[var(--primary)]/30 text-[var(--primary)]"
                      : "bg-white/10 text-white/60",
                )}
              >
                {i + 1}
              </span>
              <AnimatedText html={choice} />

              {/* Hover shine effect */}
              <div
                className={cn(
                  "pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 transition-opacity duration-300",
                  hoveredIndex === i && selected === null && "opacity-100",
                )}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
