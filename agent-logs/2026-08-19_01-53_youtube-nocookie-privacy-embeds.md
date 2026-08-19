# YouTube Privacy-Enhanced Embeds & Ad Suppression

**Date:** 2026-08-19 01:53  
**Author:** Antigravity / Pair Programming Agent

## Summary
Updated all embedded YouTube `<iframe>` players (`YouTubeSection`, `YouTubePlayer`, and `ResolvingRedirect`) to use Google's Privacy-Enhanced domain `youtube-nocookie.com` with clean player parameters (`rel=0&modestbranding=1&iv_load_policy=3`) to restrict tracking cookies and suppress behavioral pre-roll ad delivery.

## Key Changes
1. **`app/components/track-view/YouTubeSection.tsx`**:
   - Updated iframe src to `https://www.youtube-nocookie.com/embed/${explicitVideoId}?autoplay=0&rel=0&modestbranding=1&iv_load_policy=3`.
2. **`app/components/track-view/YouTubePlayer.tsx`**:
   - Updated iframe src to `https://www.youtube-nocookie.com/embed/${currentVideoId}?autoplay=0&rel=0&modestbranding=1&iv_load_policy=3`.
3. **`app/components/ResolvingRedirect.tsx`**:
   - Updated iframe src to `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3`.
