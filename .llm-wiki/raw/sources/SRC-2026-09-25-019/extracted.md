# Shortest-Column Masonry Algorithm and Dynamic Web Layout Architecture

## 1. Overview and Problem Statement
Traditional CSS Grid enforces uniform row heights: if one item in a row is tall, all neighboring cells are stretched or left with dead vertical whitespace. Next-row items must wait for the tallest item to end before starting.

## 2. Core Shortest-Column Greedy Algorithm
1. Calculate column count based on available container width:
   cols = max(1, floor((containerWidth + gap) / (minColumnWidth + gap)))
2. Maintain an array tracking cumulative column heights: colHeights = [0, 0, ..., 0]
3. For each sequential item:
   - Find the column with the minimum height: minCol = colHeights.indexOf(min(colHeights))
   - Position the item at:
     X = minCol * (colWidth + gap)
     Y = colHeights[minCol]
   - Increment the column height: colHeights[minCol] += itemHeight + gap
4. Set container height to max(colHeights) to prevent content clipping and ensure accurate scrollHeight.

## 3. Dynamic Measurement and ResizeObserver Guardrails
- Use ResizeObserver to watch container width and individual card heights.
- Prevent infinite loops by applying an update threshold (abs(newHeight - oldHeight) >= 1px) and batching updates with requestAnimationFrame.
- Isolate CSS transforms: use an outer absolute wrapper for Masonry (translate3d(x, y, 0)) and an inner wrapper for drag-and-drop or interactive transforms to avoid destructive property overwriting.