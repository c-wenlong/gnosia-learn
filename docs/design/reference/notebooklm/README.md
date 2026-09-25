# Gemini Notebook (NotebookLM) design reference

A token set and component reference for Google's Gemini Notebook (formerly NotebookLM), for building mockups in Figma or Paper that match the product. It was extracted from notebook.google.com on 2026-09-25 while signed in, and covers the UI generation that is live for this account.

| File | What it is |
|---|---|
| [tokens.json](tokens.json) | W3C DTCG tokens in Tokens Studio's multi-set layout: `core` (palettes, type, radii, shadows, spacing, sizes, breakpoints, motion) plus `light` and `dark` semantic sets and a `$themes` list. Import with Tokens Studio → Load from file. |
| [style-guide.html](style-guide.html) | One self-contained page that renders every token and component in both themes (toggle top right). Open it in a browser, or paste sections into Paper. |
| [components.md](components.md) | The discovery list, then each component's anatomy, measurements, tokens and states with screenshots, then the Gaps. |
| [screenshots/](screenshots) | `{page}-{theme}-{state}.png` captures of the real product. |
| [raw/](raw) | The unprocessed readings: every CSS custom property value (`*.tsv`) and per-element computed styles (`measurements.md`). |
| [tools/](tools) | `build_tokens.py` (raw → tokens.json) and `build_style_guide.py` (tokens.json + template → style-guide.html). |

## How the values were read

Colours, type, radii and shadows come from the running product: CSS custom properties on `body` read with `getComputedStyle` (the product's own `--nlm-*` tokens are declared as `light-dark(light, dark)`, so one read gives both themes), `--mat-sys-*` read once per theme, and computed styles on each component. State styles (hover, focus, disabled) come from the stylesheet rules themselves where the live state could not be held. Every token records its source in `$extensions.source`. A token whose source says **estimated** was sampled from a screenshot, because that part of the UI (flashcards, quiz, mind map) renders in a cross-origin iframe.

## Rebuild

```bash
python3 tools/build_tokens.py && python3 tools/build_style_guide.py
```

Edit `raw/*.tsv` or the builders, never the generated files.

## Use in Figma

Import `tokens.json` with Tokens Studio, choose the Light or Dark theme, and set fonts to Google Sans (display and headlines) and Google Sans Text (everything else) if you have them installed. Use Material Symbols Outlined for icons at 16/18/20/24px. Anything the capture could not reach is listed under Gaps in [components.md](components.md#gaps).
