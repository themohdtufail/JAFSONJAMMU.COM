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
