-- Enable realtime for check_results table so dashboard auto-updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.check_results;