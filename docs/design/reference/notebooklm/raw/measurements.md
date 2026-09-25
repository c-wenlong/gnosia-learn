# Raw measurements (computed styles, CSS px), notebook.google.com, 2026-09-25, viewport 1200x797 @2x
Colors below are LIGHT theme unless noted. Selector in [brackets].

## Fonts
- Loaded faces: Google Sans 400 (fonts.gstatic.com/s/googlesans/v62), Google Sans Text 400/500, Google Symbols variable wght 100-700 (fonts.gstatic.com/s/googlesymbols/v462). Google Sans Code 400-700 declared (code), KaTeX_* declared (math). Body default font is unset (Times New Roman), every component sets its own.
- Icons: Google Symbols ligature font, font-feature-settings "liga". Sizes seen: 24px (menu, icon buttons), 18px (button leading icon, settings), 20px box.

## Home (welcome-page)
- page-header.welcome-page-navbar: h64, bg surface (#fff / dark #22262b), container padding-left 20px, gap 12px. Logo img 234.7x20 at x20,y22.
- Settings button (nb-button extendable, mdc-button): h32, radius 96px, border 1px #dde1eb (stroke-default), padding 0 12 0 8, gap 8, label 14/20 500 Google Sans Text #1b1b1c, icon 18px. transition border .28s cubic-bezier(.4,0,.2,1)
- pro-badge: 28.8x19.2, bg #edeffa (brand-light-blue), radius 8px, padding 1.6px 4px, text grey.
- Avatar: 32x32 circle.
- Search icon button: 40x40, border 1px #dde1eb, radius 9999, padding 8, icon 24 #1b1b1c.
- View toggle group (grid|list) [project-view-toggle-group]: 129x42, border 1px #c4c7c5 (outline-variant), radius 16px; segment 48x40; checked segment bg #edeffa, text #1b1b1c 14/20 500, check icon shown (padding-left 30 anim .15s cubic-bezier(.4,0,.2,1) .045s).
- Sort button [project-filter-button]: 143.7x42, border 1px #c4c7c5, radius 9999, padding 0 16, label 14 500 #1f1f1f + arrow_drop_down.
- Create new [create-new-button mat-tonal-button]: 140.8x40, bg #000 (dark: #fff), text #fff (dark #22262b), radius 100px, padding 0 24, label 14/20 500, icon "add" 18px. transition box-shadow .28s cubic-bezier(.4,0,.2,1).
- Section toggle (All / My notebooks / Discover / Collections) [project-section-toggle]: group transparent border, radius 28; option h40 radius 24; checked bg #edeffa text #1b1b1c 14/20 400; unchecked text #1f1f1f.
- Page title "My notebooks": Google Sans 24/32 400 #1b1b1c (headline-small), at x60,y212.
- Table [project-table, mat-table]: header cell h56, 14/20 500 #1f1f1f, padding 0 16, border-bottom 1px #c4c7c5. Body row h52, cell 14/20 400 #1f1f1f, border-bottom 1px #c4c7c5. Row emoji 16px. Row actions icon button 32x32 padding 4 color #5e5e5e radius 9999. Table x60..1128 (content width 1068 at 1200 viewport).

## Menu (mat-menu, settings)
- Panel: bg #fff / dark #22262b, radius 8px, width 224.9 (settings), shadow level "0 3px 1px -2px rgba(0,0,0,.2), 0 2px 2px 0 rgba(0,0,0,.14), 0 1px 5px 0 rgba(0,0,0,.12)", padding 8px 0.
- Item: h48, padding 0 12, label Google Sans Text 14/20 500 (#1b1b1c / dark #f2f2f2), icon 24px margin-right 12 color on-surface-variant (#444746 / dark #c4c7c5).
- Highlighted/hover item (dark): bg rgba(227,227,227,.12).
- Divider: 1px, margin 8px 0.
- Settings items: Gemini Notebook help, Send feedback, Discord, Output language, Notifications, Remove watermarks, Licenses, Device (theme submenu: Light mode / Dark mode / Device), Usage, Manage subscription.

## Home grid view
- project-button card [mat-card.project-button-card.<color>-background]: 320x224 (max-inline 20rem, block 14rem), radius 12, border 1px transparent, no shadow, bg = --nlm-tiles-{green|orange|pink|blue|cyan|yellow}. Cursor pointer. No hover style found in CSS for legacy UI (hover shows nothing), more button 32x32 icon 20px #5e5e5e.
  - Emoji icon container 48x48 circle (bg var(--nlm-fills-surface-panel) set via --project-button-emoji-background-color, visible only luminous?). Emoji ~40px.
  - Title: Google Sans 24/32 400 #1f1f1f, padding 0 24, 2-line clamp with ellipsis.
  - Subtitle: Google Sans Text 14/24 (computed; renders ~12px) #535559, "date · N sources", middle dot weight 900 padding 0 4.
- Create new card [create-new-action-button, outlined]: 320x224, radius 12, border 1px var(--nlm-stroke-default), transparent. Content column gap 8 padding 16. Icon circle 64x64 radius 5rem bg --nlm-brand-light-blue, icon add 24px color --nlm-ctas-text-and-icon. Label mat-title-large Google Sans 22/36 400 #1b1b1c.
- Grid: cards 320 wide, gutter ~41px (x60, 421, 782... at 1200 viewport), rows 224 + ~16px gap.
- Section toggle checked has outline 1px var(--mat-sys-outline-variant). Toggle options margin 4px, radius 1.5rem. Label font = body-medium.
- View toggle vars: selected bg --nlm-brand-light-blue, divider outline-variant, shape corner-large (16px).
- Sort button border rgb(196,199,197) light / rgb(64,65,68) dark, h42.

## Global
- Media queries used: max-width 599.98 (28 rules, main mobile breakpoint), 359.98, 600-959.98 (tablet), min 1024, 1280/1300, 890, 665, 640, 520, 480, 440, 350, 319. Material breakpoints: 600 / 960 / 1280.
- High contrast: no product HC theme. Only (forced-colors: active) OS rules (outlines/borders).
- Motion: dominant easing cubic-bezier(0.4,0,0.2,1) (standard); also cubic-bezier(0,0,0.2,1) (decelerate), cubic-bezier(0.4,0,0.6,1), cubic-bezier(0.05,0.7,0.1,1) (emphasized decelerate). Durations 45ms, 90ms, 150ms, 0.2s, 0.25s, 280ms, 0.3s, 365ms, 0.4s, 0.5s; spinners 1333ms/1568ms/5332ms; shimmer 1.4s/6s linear. Card fade-in 0.4s ease-in-out; collapse 0.3s ease-out. prefers-reduced-motion disables card animations.
- Blur: backdrop-filter blur(0.875rem) (14px) on translucent panels; filter blur(81px) decorative glow.
- Two UI generations in CSS: legacy (active: body without .luminous-ui) and "luminous-ui" (redesign behind a flag, NOT active for this account; not captured).

## Discover tab
- Category shelf header: Google Sans 24/32 400 #1b1b1c; "View all" text button h40 radius 9999 padding 0 16 label 14 500 + chevron_right. Shelf header padding-bottom 1rem, next shelf margin-top 1.75rem.
- Featured cover card [project-button-card.cover-image-card]: 320x224 radius 12, no border, background-image linear-gradient(to bottom, transparent 20.06%, rgba(0,0,0,.6) 68.33%) over cover image, cover/center. All text #fff. Publisher logo 32x32 radius 16 border 1px stroke-default; publisher name 14/24 400. Public globe icon 24px #fff bottom-right. Title 24/32 Google Sans, subtitle 14/24. Hover (expert badge variant): image scale(1.08) transition transform .3s.
- nb-button type text-secondary: label --nlm-text-cta-text-tertiary; icon --nlm-text-secondary-text; ripple rgba(0,0,0,.1); disabled label --nlm-text-secondary-text.

## Collections tab: empty state = only the outlined "Create collection" card (same as create-new card).

## Dialog: Create collection (mat-dialog)
- Backdrop rgba(0,0,0,.32) (= --nlm-fills-scrim light; dark .6), transition opacity .4s cubic-bezier(.25,.8,.25,1).
- Surface 544 wide (content-driven), bg #fff (dark #22262b), radius 16px (--mat-dialog-container-shape 1rem), no shadow, enter transform .15s cubic-bezier(0,0,.2,1).
- Title: Google Sans Text 16/32 500 #1b1b1c, padding 4 12 (at dialog padding 12) ; close icon button 40x40 padding 8 icon 24.
- Body padding ~32px sides (field x360 vs surface x328).
- Outlined text field: h56, padding 0 16, outline 1px #dde1eb (stroke-default), radius 4px; focused outline 2px #0b57d0 (mat-sys-primary); label 16px #444746, floated label #0b57d0 transition .15s cubic-bezier(.4,0,.2,1); input 16/24 #1f1f1f.
- Section label "Add notebooks (n)": 14/24 500 #444746.
- Search field (in list box): h40 with search icon, placeholder "Search notebooks...".
- List option (mat-list-option): h48, padding-left 16, trailing checkbox. List box has 1px border + scrollbar.
- Checkbox: 18x18 box in 40x40 target (padding 11), border 2px #444746 radius 2px; checked bg+border #0b57d0 check #fff; transition 90ms cubic-bezier(.4,0,.6,1) off / cubic-bezier(0,0,.2,1) on; checkmark 180ms.
- Actions: Cancel text button h40 radius 9999 padding 0 12 label 14/500 #1b1b1c; hover state layer #0b57d0 @ .08. Primary "Create" unelevated h40 radius 96 padding 0 24: enabled bg #4259ff text #fff, hover layer #fff @ .08; disabled bg rgba(31,31,31,.12) text #5e5e5e.
- Focus ring (all mat buttons, keyboard only :focus-visible): 3px solid --mat-focus-indicator-border-color (#4259ff light / #c3cafc dark), drawn outside the button: margin -5px (filled/tonal/text) or -6px (outlined), radius inherit. Icon buttons: ring at inset 0. .header-icon-button: outline 2px solid --nlm-strong-focus-indicator offset 2px.

## States & overlays (home)
- Icon button hover (on card): state layer #5e5e5e @ .08, 32x32 circle.
- Sort menu panel: 112 wide, items "Most recent", "Title", same menu styles.
- Card actions menu: Edit title (edit), Add to collection (library_add), Pin to top (keep), Delete (delete). Icons 24 outline Google Symbols.
- Delete confirm dialog: surface 704x241 radius 16 #fff; title "Delete this notebook?" 16/32 500 padding 4 12 with close button; header and footer separated by 1px dividers (visible in screenshot); body 14/24 400 #303030; buttons: Cancel = outlined (border 1px #dde1eb, radius 96, h40, padding 0 16, 14/20 500 #1b1b1c), Delete = filled primary (#4259ff, #fff, 14/20 **400**, padding 0 16, radius 96). Destructive action uses the brand blue, not red.
- Tooltip (mat-tooltip): bg #303030 (inverse-surface), text #f2f2f2, Google Sans Text 12/16 400 tracking .096px (body-small), padding 4 8, radius 4, h24. Appears ~0.5s after hover below trigger.

## Home search
- Search expands into a pill field 300x42 (outlined, focused outline mat-sys-primary) + "Cancel" text button colored #0b57d0 (mat-sys-primary). Result meta "Search results (3)" / "3 results": 12/20 400 tracking .096 #444746, padding-bottom 16. Results use grid cards.

## Announcement modal (first open after update)
- Dialog 1000 wide radius 16 #fff; brand mark on top; headline p.mat-headline-small Google Sans 24/32 #1b1b1c centered; divider; 3 columns each: illustration tile (bg #edeffa-ish lavender, radius ~12) + h3.mat-title-medium 16/32 500 #1b1b1c + p.mat-body-medium 14/20 #444746. Close icon button 40, icon #444746.

## Notebook workspace (3 panels) at 1200x797
- Page bg --nlm-fills-surface-page #edeffa (dark #1a1d22). Header 64h (no bg): brand mark 40 circle at x20, title editable Google Sans 22/36 400 #1b1b1c at x76. Right: "Create notebook" tonal (bg #000/#fff) h32 radius 96 padding 0 16 0 12 label 14/20 400 + add icon; icon buttons 32x32 padding 4 icon 24 #1b1b1c (copy/duplicate?, analytics, share, settings), PRO badge, apps, avatar 32.
- Panels: section.source-panel / chat-panel / studio-panel, bg #fff (--nlm-fills-surface-panel, dark #22262b), radius 16, no border, no shadow. Gutter 16 (x16, 322, 894). Widths at 1200: sources 289.8, chat 556.4, studio 289.8; top y64, height 710.6 (bottom margin ~22 for disclaimer). Panel collapse transition inline-size .2s ease-in-out.
- Panel header: h48 + border-bottom 1px #dde1eb (stroke-default). Title h2 Google Sans 16/52 400 #1b1b1c, padding-left 16. Right icon (dock_to_right / tune / more_vert) 36x36 padding 6 icon 24 #444746.
- Disclaimer footer: 12/20 400 tracking .096 #303030 centered, "Gemini Notebook can be inaccurate; please double check its responses."

### Sources panel
- "Add sources": outlined button full width 245.8x32 radius 96 border 1px #dde1eb, padding 0 12 0 8, label 14/20 500 #1b1b1c, add icon 18.
- Web discovery box: bg #f9f9f9 (--nlm-fills-ui-light-grey-fill), border 1px #dde1eb, radius 16, padding 8, gap 16; textarea 14/24 placeholder "Search the web for new sources"; two chip menu buttons (globe "Web" + ▾, "Fast research" sparkle + ▾) h32 radius 96 padding 0 8 label 14 500 with 1px border; search icon button 32 padding 6 icon 20 #5e5e5e (disabled grey fill circle when empty).
- Toolbar row: two icon buttons (18px icons) + "Select all" 14/24 #1b1b1c + checkbox.
- Source row [single-source-container]: h32 (css block 3rem/3.25rem, rendered 32), padding 0 8, gap 4, radius 8. Type icon 24px coloured (PDF red #db372d = --nlm-icons-red, Markdown blue #3271ea = --nlm-icons-blue, web favicon, YouTube #f00), title 14/24 400 #1b1b1c ellipsis. Hover/opened: bg #edeffa (dark #1a1d22) and a more_vert icon appears. Checkbox checked (source style): bg + border #dde1eb, check #5e5e5e (neutral, not blue).

### Chat panel
- User message bubble [from-user-message-card-content]: bg #edeffa (dark #1a1d22), radius 20 20 0 20 (bottom-right square), padding 0 6 0 2, max 700, min-h 65, text 16/24 --nlm-text-titles-and-labels. Right aligned.
- Model message [to-user-message-card-content]: no bg, radius 16, text 16/24 Google Sans Text 400 --nlm-text-body-text (#303030 / #c7c7c7), bold = weight 600. Lists disc, li margin-bottom 8. Message block padding-bottom 20.
- Inline code: Google Sans Code 14/24 500, bg #f2f2f2, padding 4, (radius ~4 est. from screenshot).
- Citation marker: 22x22 circle, bg --nlm-fills-ui-light-grey-fill #f9f9f9, text --nlm-text-secondary-text #5e5e5e, 11px 500 (label-small), margin-left 4, hover opacity .5, transition opacity .2s linear. Stale/deleted: color grey-70 opacity .5.
- Message actions (save to note, copy, thumbs): icon buttons 32x32 padding 4, #1b1b1c.
- Query box: container 524x74 radius ~16 with 1px border (#dde1eb est. from screenshot), textarea 16/24 #303030 placeholder "Ask a question or create something"; source count 14/24 #1b1b1c-ish grey; send button 40x40 circle bg rgba(0,0,0,.08) icon arrow_forward #5e5e5e (disabled look when empty).
- Query box border: div.input-group border 1px #919191 (--nlm-stroke-focus light), radius 16, padding 16, 524x74.

### Studio panel
- Promo banner: 261.8x72 radius 8 padding 12, background linear-gradient(267.52deg, rgba(60,255,82,.15) -0.57%, rgba(113,130,255,.15) 89.06%) (= live-updates-badge gradient family), emoji 🎉, text 12/16 500 tracking .096 #1b1b1c, "Try it" tonal button h32 radius 96 padding 0 12 bg #000 text #fff 14/20 400, close icon.
- Create-artifact tiles [create-artifact-button-container]: 2-column grid, tile 126.9x56 (block 3.5rem) radius 12, padding ~12, gap 8 between tiles. Label mat-label-medium Google Sans Text 12/16 500 tracking .096, 1-line ellipsis (label max-width clamps by panel width via container queries 285/300/320px). Icon 16px top-left; chevron_right on the right (edit pencil appears on hover, opacity transition). Colour = --nlm-tiles-X bg with --nlm-tiles-on-X fg:
  Audio Overview=blue, Slide Deck=yellow, Video Overview=green, Mind Map=pink, Reports=yellow, Flashcards=orange, Quiz=cyan, Infographic=pink, Data Table=blue.
  Hover: state layer --nlm-tiles-on-X-hover (on-colour @ 8%). Disabled tile: bg rgba(0,0,0,.08) text #919191.
- "New!" badge: bg #000 text #fff 11/16 500 tracking .096, radius 9999, padding 0 7, h16.
- Studio divider line, then artifact library list: item [artifact-item-button] h64 (4rem) margin-bottom 8, icon 24 in 32 box coloured with tile on-colour (flashcards #8c2e2a), title mat-title-small 14/16 500 #303030 ellipsis, meta 12/16 tracking .096 #5e5e5e "19 sources · 204d ago", more_vert trailing. Failed/cancelled item: bg --nlm-grey-98 radius 16. Disabled item opacity .5.
- "Add note" floating button: bg #000 text #fff (dark inverse), h40 radius 96 padding 0 24 label 14 500, sticky_note icon; floats over list bottom-centre.

### Citation popover + source viewer
- Clicking a citation opens a popover AND switches the Sources panel to the source viewer, scrolled to the cited passage.
- Citation popover: 420x420 max, bg #fff, radius 8, shadow "0 1px 2px 0 rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15)" (Google elevation 1), header source filename 14/24 500 #1b1b1c padding 12 16 with divider; body 16/24 #303030 scrollable; footer link "View source" 14/24 #4259ff.
- Source viewer (in Sources panel): header collapse icon; title div.source-title Google Sans 22/36 #1b1b1c; "Source guide" expandable pill bg #edeffa radius 16 h40 padding 0 16 label 16/32 500 + sparkle icon + expand_more; body text 16/24 #1b1b1c; cited passage highlighted: span.highlighted bg #edeffa weight 700 #1b1b1c.

### Studio artifact viewer (Flashcards)
- Opening an artifact widens the Studio panel 289.8 -> 450px (transition inline-size .2s ease-in-out); chat shrinks. Header becomes breadcrumb "Studio > App" (Google Sans 16/52, "Studio" clickable) with collapse icon.
- Artifact header: title Google Sans ~22 #1b1b1c + share / fullscreen / more icons; "View 19 sources" outlined small button h32 radius 96 padding 0 24.
- Loading: centred circular spinner (brand blue, est.).
- Flashcard content renders in a cross-origin sandboxed iframe (usercontent host): computed styles NOT readable. Values below ESTIMATED FROM SCREENSHOT (pixel sampling):
  - Hint "Press "Space" to flip, "←/→" to navigate" ~12px #919191 centred.
  - Card 418x~330 radius ~24. Front: bg #303030, text #fff Google Sans ~28/40, counter "1 / 55" ~12px, "See answer" ~12px #919191 bottom. Back: bg #fff border 1px #dde1eb, answer text #1b1b1c ~28px, "Explain" outlined chip.
  - Controls row: prev circle 48 border 1px #c7c7c7 (disabled) icon #c7c7c7; wrong pill ~66x40 border 1px #dde1eb icon+count #ca4637 (≈ --nlm-icons-red); right pill icon+count #4ea455 (≈ green); next circle border 1px #4259ff icon #4259ff.
- Feedback footer: "Good content" / "Bad content" outlined buttons h40 radius 16 (not pill) padding 0 24, thumb icons.

### Quiz (iframe; ESTIMATED FROM SCREENSHOT)
- Note on sampling: screencapture PNGs are in the display colour profile; a known token #4259ff samples as #4758f6, so sampled colours drift a few units. Each estimate below is mapped to the nearest real token where one is obvious.
- Counter "1 / 12" ~12px grey; question Google Sans Text ~16/28 500 #1b1b1c.
- Option card: full width, radius ~12, padding ~16, bg #f9f9f9 (grey-98), hover bg #e3e3e3 (grey-90, sampled #e2e2e2), text ~16/24 #303030 with "A." prefix.
- "Next" primary button: bg #4259ff, text #fff, h~40, radius ~12-16 (rounded rect, not pill), centred width ~50%.
- Answered states (correct/incorrect) NOT captured: selecting an answer writes quiz progress to the user's notebook.

### Mind map (iframe; ESTIMATED FROM SCREENSHOT)
- Horizontal tree, root at left. Root node pill-ish rect bg ≈ #c3cafc (--nlm-blue-90), text black ~11px. Child nodes bg ≈ #c2d3eb (light blue, no exact token found), text black ~10px, radius ~4. Edges: curved bezier, stroke ≈ #7c8bf3 (--nlm-blue-70) ~1.5px. Expand/collapse chevron badge right of each node (small circle).
- Left control column: expand-all, zoom +, zoom −, download: icon buttons with 1px #dde1eb divider, icons #444746.

### Note editor (Studio > Note)
- Title input Google Sans 22/32 400 #1b1b1c, padding 20 0, 1px transparent border (becomes visible on focus, est.). Delete icon button 40 padding 8 #444746.
- Rich-text toolbar [rich-text-editor-menu .menubar__content] h32: undo/redo icon buttons 32 #5e5e5e, "Normal" block-style menu button h28 radius 9999 padding 0 16 14/24 500 + arrow_drop_down, Bold/Italic 32 #444746, more (…); toolbar row sits between 1px #dde1eb rules (est. from screenshot).
- Editor body 14/24 Google Sans Text #303030.
- Footer "Convert to source" outlined small button h32 radius 16 padding 0 24 with icon.

### Configure Chat dialog
- Surface 720x482 radius 16 #fff. Title Google Sans 22/36 400 #1b1b1c padding 8 0 + close icon button (filled circle bg on hover, 40).
- Intro mat-body-large 16/24 #303030 padding 24 24 0. Section label mat-title-small 14/24 500 #1b1b1c padding 8 4. Helper mat-body-medium 14/24 #303030.
- Choice chips (mat-button-toggle, standalone): h40 (+1px border = 42), radius 24, border 1px #dde1eb, label 14 500 #1f1f1f, padding 0 16 (est); selected: bg #4259ff text #fff + leading check icon (label padding-left 30, animated .15s cubic-bezier(.4,0,.2,1) .045s); hover: overlay #1f1f1f @ .08; gap 8 between chips.
- Footer divider + "Save" filled primary h40 radius 96 padding 0 24.

### Chat overflow menu: "Customize notebook", "Delete chat history" + caption "Chat history is private to you." 12/20 tracking .096 #303030. Panel 185 wide.

### Share dialog
- Surface 440x436 radius 16 #fff. Header: share icon + title 'Share "<name>"' Google Sans Text 16/32 500 + close.
- Add people field: outlined text field (focused: label #0b57d0, 2px primary outline).
- Section heading "People with access" Google Sans 16/16 500 tracking .2px #1b1b1c; "Notify people" + blue checkbox (checked #0b57d0 bg).
- Person row: avatar 32 circle, name 14/20 500 #1b1b1c, email 12px #5e5e5e (est), role select "Owner" disabled color rgba(31,31,31,.38).
- "Notebook Access" + lock icon; select "Restricted" 14/24 #1f1f1f; helper 14/24 #5e5e5e.
- Select (mat-select) panel: bg #f0f4f9 (mat-sys-surface-container), radius 0 0 4 4, level-2 shadow, padding 8 0; option h48 padding 0 16 16/20 #1f1f1f; selected bg rgba(31,31,31,.12) + trailing check #0b57d0. Arrow 10x5.
- Footer: split button "Copy link" outlined, leading segment radius 24 0 0 24 text #4259ff 14 500 padding 0 24 + link icon, trailing arrow segment; "Save" unelevated radius 24 disabled (bg rgba(31,31,31,.12) text #5e5e5e).

### Add sources dialog (?addSource=true)
- Surface 882x594 radius 16 #fff. Decorative glow: two 400px circles above the top edge, radial-gradient(circle, transparent 0, #4259ff 70%) left and (…, #45ec6d 70%) right, blurred (filter blur(81.1px)), giving a soft blue-to-green wash along the top.
- Title h1 Google Sans 24/32 400 #1f1f1f centred, padding 16 0, two lines: "Create Audio and Video Overviews from" / "your documents", where the second line is gradient text: linear-gradient(270deg, #3cff52, #7182ff) with background-clip:text.
- Web search box (focused variant): border 1px #4259ff radius 16 padding 8, same chips (Web, Fast Research) + search icon.
- Drop zone: bg #f9f9f9, border 2px dashed #dde1eb, radius 16, padding 48, title mat-title-large Google Sans 22/36 "or drop your files", sub 14/24 #5e5e5e "pdf, images, docs, audio, and more".
- Source-type buttons: outlined, bg #fff, border 1px #dde1eb, h40 radius 96 padding 0 24, 14/20 500 #1b1b1c + leading icon (upload, YouTube+link, Drive, Play Books, clipboard). Row gap ~12.
- Source limit bar: mat-progress-bar h16 radius 16, track rgba(163,163,163,.2), fill #0b57d0 (mat-sys-primary); count "21 / 300" 14/24 #303030.

### Toast (mat-snack-bar) "Copied to clipboard."
- 344x48 (min-width 344), bg #000 light (--mat-snack-bar-container-color; dark #fff), radius 16, shadow level3 "0 3px 5px -1px rgba(0,0,0,.2), 0 6px 10px 0 rgba(0,0,0,.14), 0 1px 18px 0 rgba(0,0,0,.12)"; label 14/20 400 #f2f2f2 padding 14 8 14 16. Bottom-centre, 8px above viewport bottom.
- Chat also shows a timestamp divider "Today • 2:07 PM" 12px grey centred.
- Message action row: keep (pin to note), copy, thumb_up, thumb_down icon buttons 32, icons ~18-20 #1b1b1c.

## DARK THEME (notebook), computed
- body/page #1a1d22; panel #22262b; panel header divider #37383b; panel title #f2f2f2; body text #c7c7c7.
- Add sources outlined: border #37383b, text #f2f2f2. Discovery box bg #1a1d22 border #37383b.
- Source title #f2f2f2; source checkbox checked bg/border #37383b, check #ababab. Source row hover bg #1a1d22.
- Model message text #c7c7c7; user bubble bg #1a1d22 text #f2f2f2.
- Inline code bg #3e4a59 (= --nlm-fills-ui-grey-fill dark) text #c7c7c7.
- Citation bg #1a1d22 text #ababab.
- Query box border #37383b; send button bg rgba(255,255,255,.08) icon #ababab.
- "Create notebook" tonal: bg #fff text #22262b. "Add note": bg #fff text #1a1d22. "Try it": bg #fff.
- Studio tile (blue): bg #32343e text #d4dafa (nlm-tiles dark values apply).
- Promo gradient identical to light. Artifact title #c7c7c7. Disclaimer #c7c7c7.
- Home dark (from first pass): header bg #22262b, create-new button bg #fff text #22262b, menu panel #22262b, menu item text #f2f2f2, menu hover rgba(227,227,227,.12).
- Dark dialog surface #131314 (mat-sys-surface, darker than panels), backdrop rgba(0,0,0,.32). Chip unselected text #e3e3e3 border #37383b; selected bg #4259ff text #fff (same as light). Save #4259ff/#fff.
- Dark citation popover bg #131314 (surface), same shadow; link #c3cafc; source guide pill #2f334b (brand-light-blue dark); highlighted passage bg #32343e text #f2f2f2.

## MOBILE (viewport 406x797, dark), computed
- Breakpoint: layout switches below 600px (max-width 599.98px). Tablet band 600-959.98.
- notebook-header grows to 96px (two rows: brand + title + settings/PRO/apps/avatar; second row: "+" create pill, share).
- The three panels become tabs: mat-tab-header h49, three tabs (Sources / Chat / Studio) each h48 padding 0 24, label Google Sans Text 14/20 500 #e3e3e3 (dark); active indicator 2px #a8c7fa (mat-sys-primary dark) under the label width only (31.6px, not full tab).
- Panel chrome removed: content sits on page bg #1a1d22; chat query box full width 382 (12px side margin), padding 12 (desktop 16), border 1px #5e5e5e dark.
- Dialogs keep 16 radius but fill width minus ~56px margins (Configure Chat 280 wide); chips wrap to multiple rows.
- Header title Google Sans 22/36 #f2f2f2 truncates with ellipsis.
- Mobile home: header 64 bg panel colour; controls row wraps (sort pill + "Create" pill 110x40 bg #fff/#22262b text + search icon); section toggle scrolls horizontally (overflow scroll, scrollbar hidden); list view forced (rows 52h, cell 14/20 #e3e3e3, border 1px rgb(64,65,68) dark); side padding 20; "Recent notebooks" and "Featured notebooks" headings Google Sans 24/32 #f2f2f2; "View all" outlined pill h40 padding 0 12 0 16.
- "All" tab (desktop too) = "Recent notebooks" list + "Featured notebooks" shelf.

## Icons
- Font: "Google Symbols" (Google's superset of Material Symbols), ligature text, font-variation-settings normal = FILL 0, wght 400, GRAD 0, opsz auto → OUTLINED style. Sizes in use: 16 (studio tiles), 18 (button leading icons, source toolbar), 20 (card more, discovery search), 24 (menus, header icon buttons, source type), 32 (rare), 192 (illustration).
- Some icons use class material-symbols-outlined (same look).
- Ligatures seen in notebook: add content_copy trending_up share settings dock_to_right dock_to_left language keyboard_arrow_down search_spark search label_auto sort attach_file markdown more_vert drive_pdf tune landscape_2 photo_spark keep_pin copy_all thumb_up thumb_down arrow_forward close audio_magic_eraser chevron_forward tablet subscriptions flowchart auto_tab_group cards_star quiz stacked_bar_chart table_view sticky_note_2. Home: grid_view view_list check arrow_drop_down public edit library_add keep delete collapse_content.
- Source type colours: pdf/drive_pdf #db372d, markdown #3271ea, YouTube #ff0000.
