# dnd-kit DragOverlay and Custom Layout Sorting Strategy Patterns

## 1. DragOverlay Architecture
When using @dnd-kit/core and @dnd-kit/sortable in non-uniform or absolute layouts (such as Masonry or custom grid launchers), dragging an item directly in the DOM tree causes layout jitter, scroll boundaries triggering, and stacking context clipping.

`DragOverlay` decouples the visual drag representation from the DOM layout flow:
- Placed inside `<DndContext>` but outside `<SortableContext>`.
- Renders a lightweight clone of the active item that follows the pointer smoothly.
- The original item remains in the sortable tree with reduced opacity (e.g., 0.35) as a stable placeholder, preventing layout collapse.

## 2. Sorting Strategy Decoupling (`strategy={() => null}`)
Built-in strategies (`rectSortingStrategy`, `verticalListSortingStrategy`) compute 2D matrix translations and scale distortions (scaleX / scaleY) based on assumed standard row/col coordinates. In a variable-height Masonry layout, this causes cards to warp and jump.

Solution:
- Set `<SortableContext strategy={() => null}>`.
- Allow the layout layer (Masonry) to govern coordinate positions.
- Combine collision detection: `pointerWithin` first for precise pointer hit-testing, falling back to `closestCenter` when pointers drift into gaps.
- On drag end, calculate insertion position based on pointer Y relative to target card center Y (before/after) and clamp within logical partitions (e.g. pinned vs unpinned).