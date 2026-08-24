# Brand assets

Real files are in place — nothing left as placeholder.

| File | What it is |
|---|---|
| `ccc-logo-{dark,light}.png` | Full lockup: shield + "CCC" + tagline. Used on the login/invite pages. |
| `ccc-mark-{dark,light}.png` | Shield only, cropped from the lockup above. Used in the nav rail and mobile top bar — the full lockup is too tall/portrait to read at that size. |
| `doc-analytica-{dark,light}.png` | Footer credit. `-light` is the mark+wordmark version (near-black text, reads on light backgrounds); `-dark` is the mark-only version (no text, so no contrast problem on a dark page). |
| `favicon-32.png`, `favicon-256.png`, `apple-touch-icon.png` | Generated from the shield mark. |
| `source/` | The three original files as supplied, kept for reference if these ever need regenerating. |

## How the CCC PNGs were made

The only source was a flat JPEG on a solid black background — no transparent
original existed. `ccc-logo-dark.png` was produced by keying the black
background out to alpha (luminance-driven) and `ccc-logo-light.png` by
inverting the white mark to black **while explicitly re-detecting and
preserving the green "1%"** — a plain `filter: invert(1)` would have
flipped that green to magenta, which is exactly the pitfall PLAN.md section
7.4 warned about. If a real vector source ever turns up, it's worth
swapping these raster versions for it, but there's no artifact-quality
problem with what's here.

## Doc Analytica — the file-naming reversal

The two Doc Analytica images were originally described (first message) as
"first = light mode, second = dark mode," where first is the mark-only icon
and second is the mark+wordmark. When re-uploaded, they arrived named the
other way around — `logo dark mode.png` (mark-only) and
`logo light mode.png` (mark+wordmark).

The new naming is what's wired in, and it's also the one that actually
works: the wordmark samples as near-black (~#01010B), so it only reads on a
**light** background. The mark-only file has no text at all, so it's safe
on **either** background — including dark, where the wordmark would have
been close to invisible. If this guess is wrong, swap the two filenames.
