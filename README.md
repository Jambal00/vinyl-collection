# Vinyl Collection

Pete's vinyl collection app: catalog records by barcode or search (MusicBrainz + Cover Art Archive, with Discogs as a backup), keep a wishlist for record stores, and see where each record goes on the shelf.

- Live at https://jambal00.github.io/vinyl-collection/
- Single page (`index.html`) plus a service worker (`sw.js`) so the wishlist works with weak signal.
- Data lives in the Bowling Bro Supabase project, in its own `vc_records` and `vc_settings` tables with row-level security (each person sees only their own rows).
- Planning: story map in the Vinyl Collection project.
