# Brand kit in the system

Source: the Jafson Jammu brand kit (design-system artifact). Tokens, fonts and logo files live in `packages/design-tokens`
(`tokens.css`, `tokens.json`, `fonts/`, `brand/`); `pnpm --filter @jafson/design-tokens sync` copies fonts and brand files into each app's `public/`.

Applied: flame/charcoal/ink on white and mist; Montserrat everywhere, Fredoka only in the Kids section (cream, tangerine, `radius-xl`, age chips "4-5 yrs");
pill buttons with ink text on flame (one flame action per section); the doodle pattern on one area per screen and faded out before copy and buttons;
announcement bar (one message, dismissible), white header with the horizontal logo, 2px flame underline on the current section, search field, bag;
product cards with brand name, 4:5 photo, price row, sizes; size chips (selected = ink, unavailable = dashed and struck through); 150-200ms motion, no marquees or autoplay;
sentence-case plain copy; footer with stores, contact, follow and the Chameron legal line. Admin uses the same tokens, fonts and logo.

Not applied / open items
- **Dark theme** tokens exist in the kit; the apps ship the light theme only.
- **"Brands" content**: products now carry a `brand` field (default "Jafson"). Enter the real brand on each product in the back-office; third-party brand names must be real and permitted.
- **Chameron Stores lockup** next to the footer legal line comes from the Chameron Industries kit, which was not provided. The legal line is in place without the lockup.
- **Photography** is still stock lifestyle imagery. The kit asks for plain-background product shots at 4:5, 2000px, same light across a collection.
- **Logo files are PNG**; the kit recommends a vector redraw for the header and any large print. Kids logo raster is 1,200px.
- **Descriptor "Surplus goods"**: web uses descriptor-free logos until the owner confirms.
- Store line "Brands you know. Prices that make sense." is a proposal and is not used on the site. Confirm the website address and add CIN and GSTIN to the footer line once issued.

## Components pass (kit "Components" section)
Brought in line with the kit's component previews and READMEs:
- **Badges**: New (ink), `Sale N% off`, Bestseller (gold), `Only N left` (flame-tint), at most two, shown only when true (low stock uses real units left, only when 12 or fewer remain across sizes). Attribute pills (fit, fabric) sit under the product title.
- **Button**: "Add to bag" (flame) beside a dark "Buy now" (adds the item and goes to checkout), outline "Add to wishlist". Disabled buttons say why ("Select a size", "Out of stock").
- **Logo**: header logo is 40px high (122px wide) so it never drops below the kit's 120px minimum for the horizontal logo.
- **Kids**: the Kids badge tops kidswear collection and product pages.
- **Invoice / packing slip**: white page, charcoal horizontal logo top-left, 2px flame rule, tabular figures, Chameron legal line. Customer invoice at `/order/<number>/invoice` (print or save as PDF). It reads **Order invoice** until `SELLER_GSTIN` is set; it only becomes **Tax invoice** once a GSTIN is configured. Nothing is invented. Admin packing slip uses the same layout.
- **Hang tags**: Back-office > Products > Hang tags. 55 x 90 mm, front white logo on charcoal (no pattern), back with brand, product, size, colour, MRP, price, a real Code 128 barcode of the SKU (verified to scan), "Jafson Jammu". Printing gives one side per page. **The layout does not include the garment labelling declarations** (manufacturer or packer, country of origin, month and year of manufacture, net quantity): confirm and add them before printing.
- **Packaging and social**: templates in `packages/design-tokens/applications/` (delivery bag, mailer box lid, Kids sticker, 1:1 and story posts). Render with `pnpm --filter @jafson/design-tokens render <out-dir>`. The pattern fades out around logos and headlines, which the kit's own samples don't do but its rules require.

Still open: Chameron Stores lockup file (from the Chameron kit), GSTIN/CIN/address for invoices (`SELLER_*` in `apps/api/.env.example`), vector logo for large print, real product photography.
