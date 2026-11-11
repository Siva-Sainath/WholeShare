# Product photo sources

Used now, no key needed:
- Wikimedia Commons through `scripts/fetch-product-images.js`. Keeps CC0, public domain, CC BY and CC BY-SA only.
- Openverse through `scripts/fetch-openverse-images.js`. Aggregates Flickr, Wikimedia and museum collections. Filtered to cc0, pdm, by and by-sa photographs.

Both scripts write author, license and source page for every file into `src/web/public/img/products/CREDITS.json`. The Image credits link in the app reads it. Search results can still be off topic, so review new photos on a contact sheet before shipping them.

Good next sources, free API key needed:
- Pexels and Pixabay. Free commercial use, attribution optional.
- Unsplash. Free commercial use, attribution appreciated, hotlinking rules apply.
- Smithsonian Open Access and Library of Congress. CC0 or public domain, strong for industrial and textile history, weaker for modern products.

Rule: never ship a photo without a credits row. Prefer CC0 and public domain. CC BY and CC BY-SA need the credit shown.

## Sample damage photos

The damage photos in the sample business kits (`src/web/public/demo-kits/photos`) are real photographs, found through Openverse and credited in `src/web/public/demo-kits/photos/CREDITS.json`:
- Damaged Package, by dmuth, CC BY-SA 2.0 (two photos).
