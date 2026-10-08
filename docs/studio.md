# DuckRobe studio

The studio keeps the duck visible while the wardrobe scrolls. Desktop uses a
large fitting room beside a two-column wardrobe; phones use a persistent preview
above a three-column wardrobe. The layout follows the available viewport height,
including compact portrait and landscape windows.

The main controls are Undo, Colors, Moves, Play and Save look. The outfit name
opens the equipped pieces and Take it all off. Collections and favorites live in
Filter; language, model export, sharing and project information live in More.
Choosing a hat or eyewear frames the head; other pieces and complete looks frame
the whole duck. Manual framing and orbit controls remain available.

## Editing and storage

Appearance edits are kept in the existing `duckrobe.wardrobe.v2` browser storage.
Save look creates a reusable snapshot; it is distinct from keeping the current
edit. Existing saved looks and favorites remain compatible. The storage status
reports failed writes instead of claiming the edit was saved.

Undo (or Cmd/Ctrl+Z outside text inputs and dialogs) restores up to 40 appearance
edits in the current page session. It includes outfits, individual pieces,
removal, clearing, random selection, colors, palette locking, restored saved looks
and received look links. A continuous native color-picker gesture is one edit.
Undo leaves catalog filters, saved looks and favorites alone. Deleting a saved
look offers a separate ten-second Undo action in the notification.

Manual color changes keep those colors across complete outfits. Match this look
restores the selected outfit's palette and automatic palette matching. Browsing
another category retains the search and collection filter.

Play opens the existing simulation with the current outfit. Dress up returns to
the mounted wardrobe with its browsing state, scroll, appearance and focus intact.
Simulation behavior and exported model formats are unchanged.

## Shared look links

More → Copy look link shares the exact garment IDs and two body colors without an
account or server. Clipboard-denied browsers show a selectable link instead.
Valid incoming links apply as an undoable edit, even with a locally locked
palette; invalid or incompatible links leave the current appearance intact.
Accepted look parameters are removed from the URL so refresh does not reapply
an old look. Other hash parameters are retained.

The versioned, bounded codec and its validation cases were selectively ported
from [StriverAlex/DuckRobe commit c29ffa5be6](https://github.com/StriverAlex/DuckRobe/commit/c29ffa5be6),
by hubowen. Links remain compatible with that fork's postcard QR codes.
The world's activities, postcard album, QR rendering and replay system were not
included in this integration; the imported feature requires no new dependency.

## Validation

Run `npm run check:sharing` for complete/mixed outfit round trips, colors,
malformed tokens, unknown items, wrong slots and decompression bounds.
With the development server running, `npm run check:studio` covers layout,
framing, disclosures, undo, sharing and mobile scroll behavior; `npm run check:ui`
covers existing wardrobe, storage and export interactions. Run
`npm run check:playground:ui` for the root and Pages deployment round trips.
Browser screenshots are written under `test-results/` and are local QA artifacts.
Responsive headless checks do not establish physical-phone GPU performance.
