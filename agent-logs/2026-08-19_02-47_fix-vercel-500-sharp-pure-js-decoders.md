# Agent Log: Fix Vercel 500 Crash via Pure JS Image Decoders

**Date:** 2026-08-19 02:47  
**Branch:** main  

## Root Cause
The production deployment on Vercel crashed on `/[...url]` routes (`Status: 500 (FUNCTION_INVOCATION_FAILED)`, duration 11ms) due to `sharp` failing to load in the AWS Lambda Linux x64 serverless runtime:
```
Error: Failed to load external module sharp: Error: Could not load the "sharp" module using the linux-x64 runtime ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file: No such file or directory
```
Because `import sharp from 'sharp'` was imported at the top level of `app/lib/palette.ts` (which is imported by `TrackView.tsx`), the native library initialization failure crashed the entire serverless function during module load.

## Resolution
1. **Zero-Native Pure JS Image Decoding**:
   - Replaced native `sharp` dependency in `app/lib/palette.ts` with pure JavaScript decoders `jpeg-js` and `pngjs`.
   - Implemented `decodeImageToRgba()` with magic byte inspection (JPEG `FF D8`, PNG `89 50 4E 47`) and graceful fallback.
   - Added lightweight in-memory grid sampling `sampleImageBufferToGrid()` to step-sample raw RGBA pixels directly into an 80x80 buffer.
2. **Package & Build Configuration**:
   - Removed `sharp` from `package.json` dependencies and trusted/ignored scripts.
   - Added `jpeg-js` and `pngjs` (plus `@types/pngjs`).
   - Configured `serverExternalPackages: ["postgres"]` in `next.config.ts`.
3. **Verification**:
   - All 32 unit tests passing in `bun test`.
   - Production Next.js Turbopack build passed cleanly via `bun run build`.
