# VayuDrishti: design philosophy

**Direction: Atmosphere.** *Make the invisible visible.*

*Vayu* (वायु) is air. *Drishti* (दृष्टि) is sight. The product exists to let people see something they normally cannot, so the interface behaves like a lens on the air: calm, clear, and quietly alive.

## What it is
- **A lens, not a dashboard.** Glass surfaces are translucent because a lens is something you see through. The sidebar, header buttons and the floating bar are glass; content sits on a lighter frosted material.
- **The air has a colour.** A slow haze drifts behind the page. After a live fetch it takes the colour of the current US AQI band (sage, sand, clay, rose, plum), and the glass picks it up. This is the signature move: nothing else on the page needs to shout.
- **The iris.** Scores are shown as a ring that fills in while its number counts up, like an eye opening. The logo is the same idea: an eye with a line of wind beneath it, and a pupil that slowly looks around.
- **Breath, not bounce.** Motion follows a breathing cadence (4 to 5 seconds, eased, never springy for long). One entrance sequence on load, gentle reveals on scroll, numbers that count only when they change.

## Look
- **Warm paper and ink**, never pure white or pure black, so it is easy on the eyes for long sessions. Light and dark are both first-class.
- **Type:** Fraunces (soft, variable serif) for headlines and numbers; Inter for everything you read or type. Body text 14px at 1.6 line height.
- **Colour is data.** One sage accent for actions. Warm clay is the second chart series. The AQI bands are the only other colours, and they always come with a text label.
- **Concentric corners:** window 12, sidebar 28, rows 14, panels 24, fields 14, buttons and bars fully round.

## Tools for the field
Some of this app is used standing at a roadside, in sun and glare, one-handed, with attention elsewhere. Those parts follow different rules from the dashboard.
- **Big, forgiving targets.** The field counter's two buttons are the largest things on the page (at least 132px tall), so a tap never misses and nobody has to look hard.
- **One job per screen moment.** A huge timer, two count buttons, and only then the secondary actions. The first tap starts the clock, so there is no "start" step to forget.
- **Numbers are the interface.** Counts and times use the display serif with tabular figures so they do not jitter as they change.
- **Quiet feedback.** A light vibration per tap where the device supports it, a longer one when time is up, and the screen is kept awake while counting. Nothing flashes.
- **Honest results.** A count that is too short is not scaled up to an hour; the app says so instead of producing a confident-looking number.
- **Help where the question happens.** A hint under each field, a guide that explains how to take a reading, and calculators that fill the form for you.

## Paper
The report is the same lens on white paper. When printing, the sidebar, forms and floating bar disappear, the page is dated, and a dark theme is swapped for the light one for the duration (charts are redrawn in dark ink and nothing is saved). Gauges print full and animation is off, so the page is complete the moment it is captured.

## Motion, in full
Everything that moves, so nothing moves by accident:
- Page load: header, sidebar, title and summary ease in, once.
- Sections ease in as they scroll into view.
- A pill glides to the active link in the sidebar.
- Rings fill and their numbers count up; stat numbers count only when they change.
- Haze drifts very slowly and changes colour with the air quality over about two seconds.
- Buttons lift slightly on hover and press down on tap.
- Shimmering placeholders while live data loads.
- The theme switch cross-fades colours instead of snapping.
- The live dot breathes; the logo's pupil looks around.

`prefers-reduced-motion` turns all of it off. `prefers-reduced-transparency` makes glass solid. On phones only the header, the floating bar and the drawer keep their blur, because blurring every panel is costly on cheaper devices.

## What it is not
- No gradients for decoration, no glossy buttons, no neon, no card-inside-card boxing.
- No colour that is not data, and no data colour without a text label.
- No motion that cannot be turned off.

## Inspirations
Apple Music (full-height sidebar, large page titles, floating bar), Liquid Glass (materials, concentric shapes, specular edge), DocuLens (warm ink and a soft serif).
