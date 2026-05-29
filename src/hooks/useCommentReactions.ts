import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ReactionSummary } from "@/components/comments/RichCommentCard";
import { COMMENT_REACTION_CHOICES } from "@/lib/comment-reactions";

type ReactionSurface = "internal" | "shared" | "creator";

interface UseCommentReactionsOptions {
  commentIds: string[];
  surface: ReactionSurface;
  shareToken?: string;
  guestToken?: string;
  creatorId?: string | null;
  reactorName?: string;
}

interface ReactionRpcRow {
  comment_id?: unknown;
  emoji?: unknown;
  count?: unknown;
  reactors?: unknown;
}

interface ReactionActor {
  reactor_type?: unknown;
  reactor_id?: unknown;
  guest_token?: unknown;
}

interface MutationResult {
  error: { message?: string } | null;
}

interface ReactionDeleteBuilder {
  match(values: Record<string, string>): Promise<MutationResult>;
}

interface ReactionTable {
  insert(values: {
    comment_id: string;
    emoji: string;
    reactor_type: "internal";
    reactor_id: string;
    reactor_name: string;
  }): Promise<MutationResult>;
  delete(): ReactionDeleteBuilder;
}

type ReactionRpc = (
  fn: "get_comment_reactions",
  args: { p_comment_ids: string[] }
) => Promise<{ data: ReactionRpcRow[] | null; error: { message?: string } | null }>;

type CommentFunctionInvoke = (
  fn: "shared-comments" | "creator-comments",
  options: { body: Record<string, unknown> }
) => Promise<{ data: unknown; error: { message?: string } | null }>;

const EMPTY_REACTIONS = COMMENT_REACTION_CHOICES.map((emoji) => ({
  emoji,
  count: 0,
  reactedByMe: false,
}));

function normalizeActor(actor: unknown): ReactionActor | null {
  if (actor && typeof actor === "object" && !Array.isArray(actor)) return actor as ReactionActor;
  return null;
}

function actorMatches(surface: ReactionSurface, actor: ReactionActor, actorId: string | null) {
  if (!actorId) return false;
  const reactorId = actor.reactor_id == null ? "" : String(actor.reactor_id);
  const guestToken = actor.guest_token == null ? "" : String(actor.guest_token);
  const reactorType = actor.reactor_type == null ? "" : String(actor.reactor_type);

  if (surface === "internal") return reactorType === "internal" && reactorId === actorId;
  if (surface === "creator") return reactorType === "creator" && reactorId === actorId;
  return reactorId === actorId || guestToken === actorId;
}

function applyReactionToggle(
  current: Record<string, ReactionSummary[]>,
  commentId: string,
  emoji: string
): Record<string, ReactionSummary[]> {
  const base = current[commentId] ?? EMPTY_REACTIONS;
  return {
    ...current,
    [commentId]: base.map((reaction) => {
      if (reaction.emoji !== emoji) return reaction;
      const nextReactedByMe = !reaction.reactedByMe;
      return {
        ...reaction,
        reactedByMe: nextReactedByMe,
        count: Math.max(0, reaction.count + (nextReactedByMe ? 1 : -1)),
      };
    }),
  };
}

export function useCommentReactions({
  commentIds,
  surface,
  shareToken,
  guestToken,
  creatorId,
  reactorName,
}: UseCommentReactionsOptions) {
  const { user } = useAuth();
  const [reactionsByCommentId, setReactionsByCommentId] = useState<Record<string, ReactionSummary[]>>({});
  const commentIdKey = useMemo(() => [...new Set(commentIds)].sort().join("|"), [commentIds]);
  const actorId = surface === "internal" ? user?.id ?? null : surface === "creator" ? creatorId ?? null : guestToken ?? null;
  const invokeCommentFunction = useMemo(
    () => supabase.functions.invoke.bind(supabase.functions) as unknown as CommentFunctionInvoke,
    []
  );

  const fetchReactions = useCallback(async () => {
    const ids = commentIdKey ? commentIdKey.split("|").filter(Boolean) : [];
    if (ids.length === 0) {
      setReactionsByCommentId({});
      return;
    }

    const next: Record<string, ReactionSummary[]> = Object.fromEntries(
      ids.map((id) => [id, EMPTY_REACTIONS.map((reaction) => ({ ...reaction }))])
    );

    try {
      const { data, error } = await (supabase.rpc.bind(supabase) as unknown as ReactionRpc)("get_comment_reactions", {
        p_comment_ids: ids,
      });
      if (error) throw error;

      for (const row of data ?? []) {
        const commentId = row.comment_id == null ? "" : String(row.comment_id);
        const emoji = row.emoji == null ? "" : String(row.emoji);
        if (!commentId || !COMMENT_REACTION_CHOICES.includes(emoji as (typeof COMMENT_REACTION_CHOICES)[number])) continue;

        const reactors = Array.isArray(row.reactors) ? row.reactors.map(normalizeActor).filter((actor): actor is ReactionActor => actor !== null) : [];
        const count = typeof row.count === "number" ? row.count : Number(row.count ?? reactors.length);
        const existing = next[commentId] ?? EMPTY_REACTIONS.map((reaction) => ({ ...reaction }));
        next[commentId] = existing.map((reaction) =>
          reaction.emoji === emoji
            ? {
                emoji,
                count: Number.isNaN(count) ? reactors.length : count,
                reactedByMe: reactors.some((actor) => actorMatches(surface, actor, actorId)),
              }
            : reaction
        );
      }

      setReactionsByCommentId(next);
    } catch (error) {
      console.error("[get_comment_reactions]", error);
    }
  }, [actorId, commentIdKey, surface]);

  useEffect(() => {
    void fetchReactions();
  }, [fetchReactions]);

  const toggleReaction = useCallback(
    async (commentId: string, emoji: string) => {
      if (!COMMENT_REACTION_CHOICES.includes(emoji as (typeof COMMENT_REACTION_CHOICES)[number])) return;
      const previous = reactionsByCommentId;
      const alreadyReacted = reactionsByCommentId[commentId]?.some(
        (reaction) => reaction.emoji === emoji && reaction.reactedByMe
      );

      setReactionsByCommentId((current) => applyReactionToggle(current, commentId, emoji));

      try {
        if (surface === "internal") {
          if (!user?.id) throw new Error("ログインユーザーが見つかりません");
          const reactionTable = supabase.from("comment_reactions" as never) as unknown as ReactionTable;
          if (alreadyReacted) {
            const { error } = await reactionTable.delete().match({
              comment_id: commentId,
              emoji,
              reactor_type: "internal",
              reactor_id: user.id,
            });
            if (error) throw error;
          } else {
            const { error } = await reactionTable.insert({
              comment_id: commentId,
              emoji,
              reactor_type: "internal",
              reactor_id: user.id,
              reactor_name: reactorName || user.email?.split("@")[0] || "User",
            });
            if (error) throw error;
          }
        } else if (surface === "shared") {
          if (!shareToken || !guestToken) throw new Error("共有コメントのリアクション情報が不足しています");
          const { data, error } = await invokeCommentFunction("shared-comments", {
            body: {
              action: "toggle_reaction",
              share_token: shareToken,
              comment_id: commentId,
              emoji,
              guest_token: guestToken,
              reactor_name: reactorName,
            },
          });
          if (error) throw error;
          const response = data as { error?: string } | null;
          if (response?.error) throw new Error(response.error);
        } else {
          if (!shareToken) throw new Error("クリエイターコメントのリアクション情報が不足しています");
          const { data, error } = await invokeCommentFunction("creator-comments", {
            body: {
              action: "toggle_reaction",
              share_token: shareToken,
              comment_id: commentId,
              emoji,
            },
          });
          if (error) throw error;
          const response = data as { error?: string } | null;
          if (response?.error) throw new Error(response.error);
        }
      } catch (error) {
        setReactionsByCommentId(previous);
        console.error("[toggle_comment_reaction]", error);
      }
    },
    [guestToken, invokeCommentFunction, reactionsByCommentId, reactorName, shareToken, surface, user]
  );

  return { reactionsByCommentId, toggleReaction, refetchReactions: fetchReactions };
}
