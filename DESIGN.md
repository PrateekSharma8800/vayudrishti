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

## What it is not
- No gradients for decoration, no glossy buttons, no neon, no card-inside-card boxing.
- No motion that cannot be turned off: `prefers-reduced-motion` stops all animation; `prefers-reduced-transparency` makes glass solid.

## Inspirations
Apple Music (full-height sidebar, large page titles, floating bar), Liquid Glass (materials, concentric shapes, specular edge), DocuLens (warm ink and a soft serif).
