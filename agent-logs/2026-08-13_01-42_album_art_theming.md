# Album Art Theming Implementation - 2026-08-13

## Overview
Implemented a robust system for album art processing and UI theming to ensure visual consistency and accessibility across the application.

## Key Features

### 1. Reliable Album Art URL Resolution
- **Apple Music**: Normalizing to 1000x1000 resolution via URL manipulation of standard iTunes API response patterns.
- **Spotify**: Handling high-resolution image extraction from Spotify API metadata objects.
- **YouTube**: Resolving optimal thumbnails (`maxresdefault` fallback to `hqdefault`) for YouTube Music entities.

### 2. Server-Side Color Sampling
- **Library**: Utilizing `sharp` for high-performance image processing.
- **Process**:
  - Fetch remote image buffer.
  - Resize/thumbnail to minimize processing overhead.
  - Extract dominant palette/colors.
- **WCAG Accessibility**: Automated contrast ratio verification between extracted dominant colors and text (foreground) elements to ensure compliance.

### 3. CSS Custom Property Dynamic Theming
- **Implementation**: Mapping processed color palette to CSS Custom Properties (`--album-accent`, `--album-bg`, etc.) on the container elements.
- **Dynamic Updates**: Client-side hook updates CSS variables upon album transition, allowing for smooth CSS-based color transitions.
