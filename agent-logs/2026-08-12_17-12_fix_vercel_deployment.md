# Fix Vercel Deployment

- Identified issue causing 500 error on Vercel deployment:
  - `fs.writeFileSync` in `app/lib/slugStore.ts` was attempting to write to `tmp/slugs.json` under `process.cwd()`, which throws an `EROFS: read-only file system` error on Vercel. Changed it to write to `os.tmpdir()` when `process.env.VERCEL === '1'`.
  - Next.js was stripping search parameters from Apple Music URLs (e.g. `?i=...`), which broke track resolution. Fixed in `app/[...url]/page.tsx` by iterating over `searchParams` and re-attaching them to the canonical URL before redirecting to the resolving page.
- Cleaned up untracked test/scratch files in the project root by moving them to the ignored `tmp/` directory.
- Ran `auto_commit.py` to commit and push changes.
