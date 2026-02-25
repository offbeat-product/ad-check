// Shared error handling helper for Supabase queries
import { useToast } from "@/hooks/use-toast";

export function handleSupabaseError(error: { message: string } | null, context?: string): boolean {
  if (!error) return false;
  console.error(`[Supabase${context ? ` ${context}` : ""}]`, error.message);
  return true;
}

/** Hook that returns a toast-integrated error handler */
export function useSupabaseErrorHandler() {
  const { toast } = useToast();

  return (error: { message: string } | null, context?: string): boolean => {
    if (!error) return false;
    console.error(`[Supabase${context ? ` ${context}` : ""}]`, error.message);
    toast({ title: "エラー", description: error.message, variant: "destructive" });
    return true;
  };
}
