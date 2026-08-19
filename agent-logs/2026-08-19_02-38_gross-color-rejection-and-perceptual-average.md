# Agent Log: Gross Color Rejection List & Perceptual Average Color Ambient Engine

**Date:** 2026-08-19 02:38  
**Branch:** main  

## Overview
Replaced raw unpenalized single-cluster bucket dominance with a **Perceptual Weighted Average Ambient Engine** paired with a formal **Gross Color Rejection List** (`GROSS_COLOR_REJECTION_RULES`) in `app/lib/palette.ts`. This prevents muddy olive, baby poop, dirty mustard, and sludge tones from dominating album artwork backgrounds (such as *Hotel California*), while accurately capturing the true average atmosphere of the album and extracting vibrant accents for highlights.

## Changes Made
1. **Gross Color Rejection Rules (`app/lib/palette.ts`)**:
   - Added `GROSS_COLOR_REJECTION_RULES` specifying hue bounds and heavy penalty multipliers for unappealing tones:
     - `pantone-448c-sludge-olive` ($H \in [55^\circ, 95^\circ]$): 95% rejection penalty (0.05x).
     - `dirty-mustard-yellow` ($H \in [45^\circ, 55^\circ]$): 80% rejection penalty (0.20x).
     - `pea-soup-chartreuse` ($H \in [95^\circ, 110^\circ]$): 75% rejection penalty (0.25x).
   - Added positive aesthetic boosters for universally pleasing, rich album backdrop tones: Sunset ambers/warm corals (1.30x), twilight blues/sapphires (1.30x), velvet purples (1.25x), and lush forest emeralds (1.20x).
   - Added `sanitizeHarmoniousHsl` to gracefully remap any remaining gross tones to warm gold/amber ($42^\circ$) or deep emerald ($135^\circ$).

2. **Perceptual Average Color Ambient Engine (`extractArtworkHues`)**:
   - Replaced single-cluster peak dominance with a circular mean perceptual average across the artwork pixels.
   - Filtered near-blacks and specular whites and weighted pixels by saturation and aesthetic score multipliers so clean ambient lighting (sunset sky, dusk glow) guides the backdrop rather than background wall/foliage sludge.
   - Preserved striking accent hue extraction for distinct highlights and typography pop.

3. **Testing & Verification**:
   - Added unit tests in `app/lib/palette.test.ts` verifying rejection penalties, hue sanitization, and perceptual average calculation with synthetic sunset/sludge images.
   - Verified `bun test` passes (31/31 tests passing).
   - Verified `bun run build` compiles cleanly.
