# Vinyl Collection

Pete's vinyl collection app: catalog records by barcode or search (MusicBrainz + Cover Art Archive, with Discogs as a backup), keep a wishlist for record stores, and see where each record goes on the shelf.

- Live at https://jambal00.github.io/vinyl-collection/
- Single page (`index.html`) plus a service worker (`sw.js`) so the wishlist works with weak signal.
- Data lives in the Bowling Bro Supabase project, in its own `vc_records` and `vc_settings` tables with row-level security (each person sees only their own rows).
- Planning: story map in the Vinyl Collection project.

## Releasing a change
Update the `vc-version` meta tag at the top of `index.html` (e.g. `2026-11-26 14:25`) with every release. Open copies of the app compare it with a fresh copy of the page when they come back into view and every few minutes, and show a **New version available · Tap to refresh** pill when it differs (same pattern as Bowling Bro').

## Record values
Values come from Discogs through the `vc-values` Supabase edge function (source in `supabase/functions/vc-values`).
It matches each record to Discogs (barcode, then catalog number, then artist and title), stores the latest value on
`vc_records` and every check in `vc_values`. Owned records use Discogs' suggested price for the record's grade, or the
lowest listed price; wishlist records use the lowest listed price. A pg_cron job (`vc-values-daily`) refreshes up to
15 records a day that are more than 30 days old. Requires a Discogs token in Settings.
