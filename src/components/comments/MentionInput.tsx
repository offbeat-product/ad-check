import { useState, useEffect, useRef, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface MentionMember {
  id: string;
  user_id: string | null;
  display_name: string;
  email: string;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  members: MentionMember[];
  onMentions?: (userIds: string[]) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export default function MentionInput({ value, onChange, members, onMentions, placeholder, className, onKeyDown }: MentionInputProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = members.filter((m) => {
    const q = query.toLowerCase();
    return (m.display_name?.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
  }).slice(0, 5);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChange(val);

    const cursorPos = e.target.selectionStart;
    // Find @ before cursor
    const before = val.slice(0, cursorPos);
    const atIdx = before.lastIndexOf("@");
    if (atIdx >= 0 && (atIdx === 0 || before[atIdx - 1] === " " || before[atIdx - 1] === "\n")) {
      const afterAt = before.slice(atIdx + 1);
      if (!afterAt.includes(" ") && !afterAt.includes("\n")) {
        setMentionStart(atIdx);
        setQuery(afterAt);
        setShowDropdown(true);
        setSelectedIdx(0);
        return;
      }
    }
    setShowDropdown(false);
  }, [onChange]);

  const insertMention = useCallback((member: MentionMember) => {
    const before = value.slice(0, mentionStart);
    const textarea = textareaRef.current;
    const cursorPos = textarea?.selectionStart ?? value.length;
    const after = value.slice(cursorPos);
    const mentionText = `@${member.display_name || member.email.split("@")[0]} `;
    const newValue = before + mentionText + after;
    onChange(newValue);
    setShowDropdown(false);

    // Extract all mentioned user_ids
    if (onMentions) {
      const mentionedIds: string[] = [];
      members.forEach((m) => {
        const name = m.display_name || m.email.split("@")[0];
        if (newValue.includes(`@${name}`) && m.user_id) {
          mentionedIds.push(m.user_id);
        }
      });
      onMentions(mentionedIds);
    }

    setTimeout(() => {
      if (textarea) {
        const pos = before.length + mentionText.length;
        textarea.selectionStart = pos;
        textarea.selectionEnd = pos;
        textarea.focus();
      }
    }, 0);
  }, [value, mentionStart, onChange, onMentions, members]);

  const handleKeyDownInternal = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showDropdown && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.min(prev + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filtered[selectedIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowDropdown(false);
        return;
      }
    }
    onKeyDown?.(e);
  }, [showDropdown, filtered, selectedIdx, insertMention, onKeyDown]);

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDownInternal}
        placeholder={placeholder}
        className={className}
      />
      {showDropdown && filtered.length > 0 && (
        <div ref={dropdownRef} className="absolute bottom-full left-0 mb-1 w-full bg-popover border border-border rounded-md shadow-lg z-[9999] max-h-40 overflow-y-auto">
          {filtered.map((m, i) => (
            <button
              key={m.id}
              type="button"
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors",
                i === selectedIdx ? "bg-accent text-accent-foreground" : "hover:bg-muted"
              )}
              onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[9px] font-bold text-primary-foreground shrink-0">
                {(m.display_name || m.email)[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <span className="font-medium">{m.display_name || m.email.split("@")[0]}</span>
                <span className="text-muted-foreground ml-1.5">{m.email}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
