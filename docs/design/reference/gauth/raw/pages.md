# Gauth pages: layout notes

Written by hand from [layout.json](layout.json) (`tools/capture/layout.mjs`, read on 2026-10-04 at 1440 x 900, 1920 x 1080, 1024 x 768 and 390 x 844) and the screenshots. Every number is a measured box in CSS pixels; x is from the left edge of the viewport.

## The app shell (Homework, Academy, Insights)

| Part | 1440 | 1920 | 1024 | 390 |
|---|---|---|---|---|
| Sidebar | `side-menu`, fixed, 220 wide, full height, 1px #edeef1 right rule | same | same | gone: a 60px `wap-header` with the logo and a menu button |
| Top bar | `pc-header`, fixed, 60 tall over the content column (220 to the right edge); white with a 1px #e4e6eb rule on Homework and Insights, transparent on Academy | same | same | the 60px mobile header |
| Content | `shell-layout_main`, x 220, the full remaining width | x 220, 1700 wide | x 220, 804 wide | full width |
| Folded sidebar | the collapse button folds it to an icon rail about 74 wide (screenshot `home-light-sidebar-folded`) | | | |

The sidebar widens and folds with `transition: width 0.5s ease-in-out`. Body text inherits `-apple-system, "system-ui", "Google Sans", Roboto, Arial, Helvatica` at 16px on white.

## Homework home (`/`)

- A 673 tall hero on a pale lilac gradient (`#f5f6ff`, fading downwards) with two soft colour blobs drawn by `::before` and `::after`.
- The column is 680 wide (`slogan_content` max-width), centred in the content area: x 490 at 1440, x 730 at 1920, x 282 at 1024.
- Order: the two-line serif title (104 tall), the 680 x 64 question field 30 below it, the 680 x 207 dashed upload panel 20 below that, then the subject chips (87 x 72 each, 12 apart) and the MORE pill.
- Below the fold, sections 960 wide: the Atlas band (headline, a 341 tall radius-48 showcase, four 228 x 150 feature cards in a 4-column grid with 16 gaps), the AI solution band (a phone mock beside three option rows), the live tutor band (radius 54 54 200 54), student comments, a disclaimer, the footer (244 tall).
- On a phone the hero title drops to 25/30 600 in the system font, the field is 322 x 36, and a 64px app banner sits fixed at the bottom.

## Academy catalogue (`/course/science`, `/course/math`, `/course/history`, `/course/my`)

- The page ground, sidebar and sticky toolbar are all `#faf9f5`; the current sidebar item and tab are `#f4ebe5`.
- `catalog_inner` is max-width 1089 with 32 padding, so the column is 1025 wide: x 318 at 1440, x 558 at 1920. At 1024 it is 740 wide from x 252.
- The title row: "Gauth Academy" (Playfair Display 36, a 48 box) at y 72, Create Course (141 x 37) right-aligned at y 81.
- `catalog_stickyToolbar`, 75 tall, sticky at top 60: the four category tabs (36 tall, 6 apart). When the page scrolls the title leaves and Create Course moves into the toolbar (screenshot `academy-math-light-show-more`).
- Each course section: 29 top padding, a heading row (80px cover, 24 gap, 22/28.6 title over a 16/22.4 grey line), a 3-column grid of 325.66 columns with 24 gaps, 36 bottom padding and a 1px #e7e6e3 rule.
- Science Labs and History Signature cards are 326 x 264 to 294 (147px cover); Math Curriculum cards are 326 x 178 (80px cover beside the title). Math shows six units per course and a "Show n more" button; Show more reveals the rest as the same cards.
- At 1024 the grid is two columns of 358. On a phone the Science Labs tab is gone (science lessons redirect to `/course/math`), the tabs scroll sideways, the title is 28px, the toolbar is sticky at 76, and unit cards become 358 x 112 rows (72px cover, radius 20).
- My Course, signed out: an empty state of three fanned course cards, "Build AI courses from any topic" (20/26 700), a grey line and a dark Create button.

## Unit page (`/course/math/algebra-1?unit=…`)

- Same shell and ground as Academy. A sticky 86 tall back bar holds the back link.
- The course banner: 1025 x 89, radius 20, tinted with the course colour (Algebra 1 is green #ecf4e5; the catalogue gives each course its own tint, green, sand or blue, in its covers).
- `courseBody` is a 2-column grid: the unit rail 310 and the learning map 683, 32 apart (248 and 460 at 1024). The rail is sticky at top 86.
- The learning map: a 683 x 84 unit header, then the topic path (coins on a winding dotted connector, the label to the right, the coins offset left and right alternately), unit after unit down the page (11,574 tall at 1440).
- The Start panel (`learningPanel`, max-width 460) is fixed 726 from the top, centred over the map, with a green glow under it.
- On a phone the rail is gone, the banner is sticky at 76, and the Start panel is fixed at the bottom.

## Science lesson player (`/course/science/<lesson>/learn`)

- Full screen, no shell. `canvas_runtime` on `#fcfcfc` with a dot grid; the board pans and zooms (drag, Ctrl/Cmd + scroll) and the narration moves it on its own.
- Header (40 tall at y 11, x 24 to 1420): a 40px exit button and the lesson title (Playfair Display 16/21 600) at the left; five 32px round buttons at the right (previous block, play or pause, next block, reset view, settings).
- The chapter column starts at x 40, y 88, 470 wide; notes are 416 wide. Chapters sit side by side as the lesson moves on.
- The section rail: 240 wide, right-aligned at x 1176, vertically centred (y 391 at 900 tall), a 2px track at its right edge.
- A right-edge mask (`canvas_rightMask`, 420 wide) fades the board under the rail.
- The Ask Tutor dock: a 228 x 52 pill centred at the bottom (y 828), widening to 820 when opened.
- The audio dialog is 400 x 238, centred. The quiz card is 560 x 296, docked at the bottom centre in place of the Ask Tutor bar.
- The lesson ends on a Completed screen (cover, a laurel "Completed" title, Share and View Canvas); it was seen during exploration but not captured by the kit.
- A phone is redirected to `/course/math`.

## Math lesson player (`/course/math/<course>/<lesson>/learn`)

- Full screen on `#faf9f5`. A 2-column grid: the tutor column 360 (300 at 1024) and the teaching area.
- The tutor column: the animated mascot (53px) at y 56, the status line under it, the transcript, and the 296 x 48 Ask gauth field at y 822.
- The header is 66 tall: a 40px exit button at the left; the progress group (max-width 752) centred over the teaching area with page arrows; pause, speed and chapters buttons (40px, round) at the right.
- The slide plays in a white radius-32 frame, 1048 x 820 at 1440.
- On a phone the layout changes to `lesson_mobileLessonPage`: a 48px header, the slide full width, and chapter panels as bottom sheets.

## History lesson player (`/course/history/<lesson>/learn`)

- Full screen on `#faf9f5`. A 54px header: exit at the left, the chapter pills (max-width 800) centred.
- The scene: an 880 x 495 frame centred (x 280, y 173 at 1440). A 60px play disc at the lower left (x 144) and one caption line centred at the foot.
- The chapter panel is a 400 wide sheet from the right edge.

## Atlas (`/atlas`)

- Its own shell: a 56 tall white header (logo, a menu button, Sign in) and a 230 wide white drawer below it (New Topic, search, topics). At 1024 the drawer is closed (0 wide).
- The landing column: the title at y 171 (683 wide at 1440), the slogan, the 920 x 148 prompt box, two recommendation chips centred under it.
- Popular Stories: a 1080 wide 3-column grid of 338.66 columns with 32 gaps (two columns of 480 with 24 gaps at 1024), then an FAQ with a 2-column video list (480 columns, 48 gaps).
- A story opens as a 960 x 540 video preview over a dark scrim, then a story page: the story image in a 1034 x 582 radius-20 frame, a View and Details rail floating at its right edge, a strip of story thumbnails under it, Generate Video and Share at the top right.
- On a phone: a 54 tall sticky header, the title at 24/28.8, a 2-column story list of 177 columns ("Popular Case"), and a story page with a back button, the image, a thumbnail strip and the story text.

## Insights (`/news`)

- The app shell. A 720 wide column centred in the content (x 470 at 1440): a breadcrumb, News and Blog pill tabs, a featured article (a 371 wide text block beside a 333 x 200 image), then article rows (a 171 x 96 image beside an 18/27 title and a two-line summary, a 1px #f5f5f7 rule between rows).
- Body text here is 13px #333333.
