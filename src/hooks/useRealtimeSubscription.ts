import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type PostgresChangeEvent = "INSERT" | "UPDATE" | "DELETE";

export interface UseRealtimeSubscriptionOptions {
  table: string;
  schema?: string;
  events?: PostgresChangeEvent[];
  queryKeys: string[][];
  enabled?: boolean;
}

/**
 * Supabase Realtimeでテーブルの変更を監視し、
 * 変更があったらReact Queryのキャッシュを自動でinvalidateするフック。
 * 他プロダクト（Ad Brain等）からの書き込みもリアルタイムで検知する。
 *
 * queryKeys / events は ref で参照するため、親が毎レンダーで新しい配列を渡しても
 * チャンネルの購読が不必要に張り替わらない。
 */
export function useRealtimeSubscription({
  table,
  schema = "public",
  events = ["INSERT", "UPDATE", "DELETE"],
  queryKeys,
  enabled = true,
}: UseRealtimeSubscriptionOptions) {
  const queryClient = useQueryClient();
  const queryKeysRef = useRef(queryKeys);
  const eventsRef = useRef(events);
  queryKeysRef.current = queryKeys;
  eventsRef.current = events;

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel(`realtime-${schema}-${table}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema,
          table,
        },
        (payload) => {
          if (eventsRef.current.includes(payload.eventType as PostgresChangeEvent)) {
            queryKeysRef.current.forEach((key) => {
              queryClient.invalidateQueries({ queryKey: key });
            });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, schema, enabled, queryClient]);
}
