

## Problem Analysis

The right panel shows only ~1 check item because the scrollable list area is being squeezed. Looking at the component hierarchy:

```text
ReviewRightPanel (w-[380px] h-full flex flex-col)
  └─ Tabs (flex flex-col h-full)
       ├─ TabsList (shrink-0, fixed height)
       └─ TabsContent (flex-1 flex flex-col overflow-hidden)
            └─ AICheckPanel (fragment <>)
                 ├─ Summary bar (shrink-0, ~80px)
                 ├─ Scrollable list (flex-1 overflow-y-auto) ← SHOULD expand
                 └─ Action bar (shrink-0, ~80px)
```

The issue: `TabsContent` from Radix UI doesn't have `min-height: 0` or proper flex behavior by default. When a flex child needs to scroll, it must have `min-h-0` to allow it to shrink below its content size. Without this, the scrollable area expands to its full content height instead of constraining and scrolling.

## Plan

### 1. Fix `TabsContent` flex behavior in `ReviewRightPanel.tsx` (line 51)

Add `min-h-0` to the `TabsContent` for the ai-check tab so the flex layout properly constrains the scrollable area:

```
Before: className="flex-1 flex flex-col overflow-hidden mt-0 ring-0 focus-visible:ring-0"
After:  className="flex-1 flex flex-col overflow-hidden mt-0 ring-0 focus-visible:ring-0 min-h-0"
```

Apply the same to the other TabsContent elements (lines 74, 89) for consistency.

### 2. Ensure scrollable list has `min-h-0` in `AICheckPanel.tsx` (line 202)

Add `min-h-0` to the scrollable container:

```
Before: className="flex-1 overflow-y-auto p-3 space-y-3"
After:  className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0"
```

### 3. Keep action bar at bottom as requested

The action bar ("0件選択済み / 全て選択 / クリア / チェックしたコメントを反映") stays at the bottom with `shrink-0` - no changes needed here.

### Result

- The scrollable list will fill all available space between the summary/filter header and the bottom action bar
- Multiple check items will be visible at once
- The action bar remains pinned at the bottom of the panel

