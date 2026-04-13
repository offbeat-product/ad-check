export const GLOBAL_SEARCH_OPEN_EVENT = "adcheck:open-global-search";

export function openGlobalSearch(): void {
  window.dispatchEvent(new Event(GLOBAL_SEARCH_OPEN_EVENT));
}
