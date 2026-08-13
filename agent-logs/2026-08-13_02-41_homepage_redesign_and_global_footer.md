# Homepage Redesign & Global URL Tip Footer

## Summary
- Redesigned the homepage `app/page.tsx` with tabbed controls for switching between pasting a URL / searching, or explicitly entering Artist and Track/Album fields.
- Submitting fields routes directly to `/<artist>/<trackOrAlbum>`.
- Created `app/components/UrlTipFooter.tsx` and integrated it into `app/layout.tsx` to display a universal tip about pasting raw YouTube/Spotify/Apple Music links directly into the URL bar.
- Updated `app/globals.css` with responsive tab styles and global footer styling.
