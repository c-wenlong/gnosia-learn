# Gauth component measurements

Computed styles read from www.gauth.com on 2026-10-04 by `tools/capture/measure.mjs`, signed out, in headless Chromium at 1440 x 900 (the Mobile group at 390 x 844), and written here by `tools/capture/build-measurements.mjs` from [components-computed.json](components-computed.json). One table per component: a column per state, a row per property. A cell that repeats the first state's value reads `=`. Colours are hex, with `@ alpha` when translucent. "Painted layers" lists the first nodes inside the component that paint a fill, border, shadow or outline; "Ancestor paint" the same for its parents.

States: `hover` is a real pointer hover; `focus-visible` a real keyboard focus (Shift+Tab, Tab); `pressed` is forced with DevTools (`CSS.forcePseudoState` :active:hover), so no button was pressed; `focused` is a text field clicked into; `filled` is sample text typed and deleted again, with nothing sent; `opened`, `expanded` and the rest are resting states reached by the page or by a UI toggle.

## Components

### Dialogs and overlays

#### promo-dialog

Promo dialog. The announcement every page opens with ("Introducing Gauth Academy"): a 600px white card at radius 24 with a 0 8 20 shadow, a Playfair Display 24/31.2 800 title, a 14/19.6 grey subtitle, a media panel, a full-width black button and a round close button.

Page: home. Selector: `[class*="atlas-intro-modal_aw-atlas-intro-modal__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 600 x 542.14 |
| Padding | 0px |
| Border | none |
| Radius | 24px |
| Background | #ffffff |
| Box shadow | #0f1114 @ 0.1 0px 8px 20px 0px |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Text node | h2.atlas-intro-modal_aw-atlas-intro-modal-title: Playfair Display 24px/31.2px 800, #21252e |
| Transition | none |
| Icon | 0 x 0, colour #000000 |
| Painted layers | div.atlas-intro-modal_aw-atlas-intro-modal 600.0x542.1 bg #ffffff r 24px shadow #0f1114 @ 0.1 0px 8px 20px 0px; xg-prompt.xgplayer-prompt.controls-follow 24.0x11.0 bg #000000 @ 0.5 r 50px; xg-loading.xgplayer-loading 0.0x0.0 bg #3e424b r 20px; xg-start-inner 0.0x0.0 bg #000000 @ 0.38 r 50%; xg-replay.xgplayer-replay 0.0x0.0 bg #1f232b @ 0.9 r 20px; xg-error.xgplayer-error 0.0x0.0 bg #000000 |
| How | at rest |

Crops: `promo-dialog-default.png`.

#### promo-title

Promo dialog title.

Page: home. Selector: `[class*="atlas-intro-modal_aw-atlas-intro-modal-title__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 540 x 31.2 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | Playfair Display 24px/31.2px 800 |
| Letter spacing | normal |
| Colour | #21252e |
| Transition | none |
| Ancestor paint | 2 up div.atlas-intro-modal_aw-atlas-intro-modal bg #ffffff shadow #0f1114 @ 0.1 0px 8px 20px 0px |
| How | at rest |

Crops: `promo-title-default.png`.

#### promo-subtitle

Promo dialog subtitle.

Page: home. Selector: `[class*="atlas-intro-modal_aw-atlas-intro-modal-subtitle__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 540 x 39.19 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | Playfair Display 14px/19.6px 400 |
| Letter spacing | normal |
| Colour | #646a77 |
| Transition | none |
| Ancestor paint | 2 up div.atlas-intro-modal_aw-atlas-intro-modal bg #ffffff shadow #0f1114 @ 0.1 0px 8px 20px 0px |
| How | at rest |

Crops: `promo-subtitle-default.png`.

#### promo-confirm

Promo dialog button. "Explore now": black, radius 14, 48px tall, Playfair Display 18/27 600. Hover turns it #21252e; pressed scales it to 0.99. Measured, never pressed.

Page: home. Selector: `[class*="atlas-intro-modal_aw-atlas-intro-modal-confirm__"]`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 540 x 48 | = | = | 534.6 x 47.52 |
| Padding | 10.5px 16px | = | = | = |
| Border | none | = | = | = |
| Radius | 14px | = | = | = |
| Background | #000000 | #21252e | = | #21252e |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | Playfair Display 18px/27px 600 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #ffffff | = | = | = |
| Transition | background-color, transform 0.16s, 0.16s ease, ease delay 0s, 0s | = | = | = |
| Cursor | pointer | = | = | = |
| Painted layers | button.atlas-intro-modal_aw-atlas-intro-modal-confirm 540.0x48.0 bg #000000 r 14px | button.atlas-intro-modal_aw-atlas-intro-modal-confirm 540.0x48.0 bg #21252e r 14px | = | button.atlas-intro-modal_aw-atlas-intro-modal-confirm 534.6x47.5 bg #21252e r 14px |
| Ancestor paint | 2 up div.atlas-intro-modal_aw-atlas-intro-modal bg #ffffff shadow #0f1114 @ 0.1 0px 8px 20px 0px | = | = | = |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |
| Transform | - | = | = | matrix(0.99, 0, 0, 0.99, 0, 0) |

Crops: `promo-confirm-default.png`, `promo-confirm-hover.png`, `promo-confirm-focus-visible.png`, `promo-confirm-pressed.png`.

#### promo-close

Promo dialog close button.

Page: home. Selector: `[class*="atlas-intro-modal_aw-atlas-intro-modal-close__"]`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 28 x 28 | = | = | = |
| Padding | 0px | = | = | = |
| Border | none | = | = | = |
| Radius | 999px | = | = | = |
| Background | transparent | = | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | Arial 13.3333px/normal 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #000000 | = | = | = |
| Transition | opacity 0.16s ease | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 28 x 28, colour #000000 | = | = | = |
| Ancestor paint | 1 up div.atlas-intro-modal_aw-atlas-intro-modal bg #ffffff shadow #0f1114 @ 0.1 0px 8px 20px 0px | = | = | = |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |
| Opacity | - | 0.85 | = | 0.85 |

Crops: `promo-close-default.png`, `promo-close-hover.png`, `promo-close-focus-visible.png`, `promo-close-pressed.png`.

#### create-dialog

Create a Course dialog. Opened from Create Course: a #faf9f5 sheet with radius 24, a greeting, three suggestion chips, Shuffle, and a prompt field over a blue-to-lilac glow. Nothing was typed into the prompt but sample text, then deleted; no suggestion was pressed.

Page: my. Selector: `role=dialog "Create a Course"`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 720 x 611 |
| Padding | 0px |
| Border | none |
| Radius | 24px |
| Background | #faf9f5 |
| Box shadow | #141a24 @ 0.18 0px 16px 36px 0px |
| Outline | none |
| Font | SF Pro 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | h2: SF Pro 18px/25.2px 700, #21252e |
| Transition | none |
| Icon | 720 x 232, colour #21252e, fill #000000 |
| Painted layers | section.course-create-modal_modal 720.0x611.0 bg #faf9f5 r 24px shadow #141a24 @ 0.18 0px 16px 36px 0px; div.course-create-modal_bottomGradient 720.0x232.0 image linear-gradient(#faf9f5 @ 0, #faf9f5 56.268%); header::before.course-create-modal_header 720pxx72px bg #faf9f5; button 310.0x54.0 bg #ffffff border T:1px solid #eeeeee / R:1px solid #eeeeee / B:1px solid #eeeeee / L:1px solid #eeeeee r 16px; button 310.0x54.0 bg #ffffff border T:1px solid #eeeeee / R:1px solid #eeeeee / B:1px solid #eeeeee / L:1px solid #eeeeee r 16px; button 310.0x54.0 bg #ffffff border T:1px solid #eeeeee / R:1px solid #eeeeee / B:1px solid #eeeeee / L:1px solid #eeeeee r 16px |
| Ancestor paint | 1 up div.course-create-modal_overlay bg #1a1f26 @ 0.42 |
| How | at rest |

Crops: `create-dialog-default.png`.

#### create-suggestion

Course suggestion chip. A white chip with a 600 label and an arrow; pressing one would start a course, so it was only hovered and focused.

Page: my. Selector: `role=dialog "Create a Course" button`. States: default, hover, focus-visible.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 310 x 54 | = | = |
| Padding | 14px 20px | = | = |
| Gap | 8px | = | = |
| Border | 1px solid #eeeeee | 1px solid #d9ddd9 | = |
| Radius | 16px | = | = |
| Background | #ffffff | #fcfdfc | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | SF Pro 14px/21px 700 | = | = |
| Letter spacing | normal | = | = |
| Colour | #21252e | = | = |
| Text node | p: -apple-system 14px/21px 600, #21252e | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 13 x 12, colour #21252e | = | = |
| Painted layers | button 310.0x54.0 bg #ffffff border T:1px solid #eeeeee / R:1px solid #eeeeee / B:1px solid #eeeeee / L:1px solid #eeeeee r 16px | button 310.0x54.0 bg #fcfdfc border T:1px solid #d9ddd9 / R:1px solid #d9ddd9 / B:1px solid #d9ddd9 / L:1px solid #d9ddd9 r 16px | = |
| How | at rest | mouse hover | Shift+Tab, Tab |

Crops: `create-suggestion-default.png`, `create-suggestion-hover.png`, `create-suggestion-focus-visible.png`.

#### create-prompt

Course prompt field. The white radius-16 prompt field at the foot of the dialog with a round send button that stays grey until there is text.

Page: my. Selector: `role=dialog "Create a Course" textarea`. States: default, focused, filled.

| Property | default | focused | filled |
|---|---|---|---|
| Size (w x h) | 648 x 60 | = | = |
| Padding | 13px 10px 13px 16px | = | = |
| Gap | 12px | = | = |
| Border | 1px solid #e4e6eb | = | = |
| Radius | 16px | = | = |
| Background | #ffffff | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | SF Pro 16px/normal 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #21252e | = | = |
| Transition | none | = | = |
| Icon | 20 x 20, colour #ffffff | = | = |
| Painted layers | div.course-create-modal_inputBar 648.0x60.0 bg #ffffff border T:1px solid #e4e6eb / R:1px solid #e4e6eb / B:1px solid #e4e6eb / L:1px solid #e4e6eb r 16px; button 32.0x32.0 bg #9ca2ac @ 0.2 r 16px | = | div.course-create-modal_inputBar 648.0x60.0 bg #ffffff border T:1px solid #e4e6eb / R:1px solid #e4e6eb / B:1px solid #e4e6eb / L:1px solid #e4e6eb r 16px; button 32.0x32.0 bg #21252e r 16px |
| Ancestor paint | 3 up section.course-create-modal_modal bg #faf9f5 shadow #141a24 @ 0.18 0px 16px 36px 0px | = | = |
| How | at rest | clicked into the field | typed "Photosynthesis", then deleted; nothing sent |
| Text node | - | = | textarea: SF Pro 16px/24px 400, #21252e |

Crops: `create-prompt-default.png`, `create-prompt-focused.png`, `create-prompt-filled.png`.

#### create-close

Dialog close button.

Page: my. Selector: `role=dialog "Create a Course" close`. States: default, hover, focus-visible.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 10px | = | = |
| Background | transparent | #21252e @ 0.06 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | Arial 13.3333px/normal 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #000000 | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #000000 | = | = |
| Ancestor paint | 2 up section.course-create-modal_modal bg #faf9f5 shadow #141a24 @ 0.18 0px 16px 36px 0px | = | = |
| How | at rest | mouse hover | Shift+Tab, Tab |
| Painted layers | - | button.course-create-modal_closeButton 32.0x32.0 bg #21252e @ 0.06 r 10px | = |

Crops: `create-close-default.png`, `create-close-hover.png`, `create-close-focus-visible.png`.

#### audio-dialog

Enable audio dialog. Shown when a science lesson opens: a 400px white Astryx dialog at radius 20 with a 0 12 32 shadow at 16%, an Inter 24/32 600 title, a 14/20 grey line and two 48px buttons at radius 16.

Page: lesson-science. Selector: `dialog[class*="canvas_dialog__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 400 x 238 |
| Padding | 0px |
| Border | none |
| Radius | 20px |
| Background | #ffffff |
| Box shadow | #000000 @ 0.16 0px 12px 32px 0px |
| Outline | none |
| Font | Figtree 16px/normal 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Text node | h2.canvas_title: Inter 24px/32px 600, #1f232b |
| Transition | none |
| Painted layers | dialog.astryx-dialog.standard 400.0x238.0 bg #ffffff r 20px shadow #000000 @ 0.16 0px 12px 32px 0px; button.astryx-button.secondary 165.0x48.0 bg #ffffff border T:1px solid #d0d5dd / R:1px solid #d0d5dd / B:1px solid #d0d5dd / L:1px solid #d0d5dd r 16px; button.astryx-button.secondary 163.0x48.0 bg #1f232b r 16px |
| How | at rest |

Crops: `audio-dialog-default.png`.

#### audio-not-now

Secondary button (Not now). White, 1px #d0d5dd border, radius 16, Inter 15/20 500. Pressed scales it to 0.98. Its focus ring is Astryx's 2px #0064e0 outline.

Page: lesson-science. Selector: `button "Not now"`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 165 x 48 | = | = | 161.7 x 47.04 |
| Padding | 0px | = | = | = |
| Gap | 8px | = | = | = |
| Border | 1px solid #d0d5dd | = | = | = |
| Radius | 16px | = | = | = |
| Background | #ffffff | = | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | Inter 15px/20px 500 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #1f232b | = | = | = |
| Text node | span: Inter 15px/20px 500, #1f232b | = | = | = |
| Transition | background-image, background-color, color, opacity, transform 0.125s cubic-bezier(0.24, 1, 0.4, 1) | = | = | = |
| Transform | matrix(1, 0, 0, 1, 0, 0) | = | = | matrix(0.98, 0, 0, 0.98, 0, 0) |
| Cursor | pointer | = | = | = |
| Painted layers | button.astryx-button.secondary 165.0x48.0 bg #ffffff border T:1px solid #d0d5dd / R:1px solid #d0d5dd / B:1px solid #d0d5dd / L:1px solid #d0d5dd r 16px | = | = | button.astryx-button.secondary 161.7x47.0 bg #ffffff border T:1px solid #d0d5dd / R:1px solid #d0d5dd / B:1px solid #d0d5dd / L:1px solid #d0d5dd r 16px |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |

Crops: `audio-not-now-default.png`, `audio-not-now-hover.png`, `audio-not-now-focus-visible.png`, `audio-not-now-pressed.png`.

#### audio-enable

Primary button (Enable audio). Near-black #1f232b, radius 16, white Inter 15/20 500. Measured, never pressed.

Page: lesson-science. Selector: `button "Enable audio"`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 163 x 48 | = | = | 159.74 x 47.04 |
| Padding | 0px | = | = | = |
| Gap | 8px | = | = | = |
| Border | none | = | = | = |
| Radius | 16px | = | = | = |
| Background | #1f232b | = | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | Inter 15px/20px 500 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #ffffff | = | = | = |
| Text node | span: Inter 15px/20px 500, #ffffff | = | = | = |
| Transition | background-image, background-color, color, opacity, transform 0.125s cubic-bezier(0.24, 1, 0.4, 1) | = | = | = |
| Transform | matrix(1, 0, 0, 1, 0, 0) | = | = | matrix(0.98, 0, 0, 0.98, 0, 0) |
| Cursor | pointer | = | = | = |
| Painted layers | button.astryx-button.secondary 163.0x48.0 bg #1f232b r 16px | = | = | button.astryx-button.secondary 159.7x47.0 bg #1f232b r 16px |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |

Crops: `audio-enable-default.png`, `audio-enable-hover.png`, `audio-enable-focus-visible.png`, `audio-enable-pressed.png`.

#### story-preview

Story preview. A story card opens a video preview over a dark scrim, with a white Explore pill under it.

Page: atlas. Selector: `[class*="user-cases_exploreButton__"] parent`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 960 x 620 |
| Padding | 0px |
| Gap | 20px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Text node | xg-icon.xgplayer-time.xg-time-right: -apple-system 14px/36px 400, #ffffff |
| Transition | none |
| Icon | 32 x 32, colour #000000 |
| Painted layers | div.user-cases_playerFrame 960.0x540.0 bg #000000 r 18px shadow #000000 @ 0.48 0px 28px 80px 0px; div.user-cases_player.browser_videoWrapper 960.0x540.0 bg #000000; video 960.0x540.0 bg #000000; xg-prompt.xgplayer-prompt.controls-follow 24.0x11.0 bg #000000 @ 0.5 r 50px; xg-loading.xgplayer-loading 0.0x0.0 bg #3e424b r 20px; xg-start-inner 83.5x83.5 bg #000000 @ 0.38 r 50% |
| How | at rest |

Crops: `story-preview-default.png`.

#### explore-button

Explore button.

Page: atlas. Selector: `[class*="user-cases_exploreButton__"]`. States: default, hover, focus-visible.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 116 x 44 | = | = |
| Padding | 0px 20px | = | = |
| Gap | 8px | = | = |
| Border | none | = | = |
| Radius | 999px | = | = |
| Background | #ffffff | #f4f4f4 | = |
| Box shadow | #ffffff @ 0.08 0px 10px 28px 0px | = | = |
| Outline | none | = | = |
| Font | Arial 14px/44px 700 | = | = |
| Letter spacing | normal | = | = |
| Colour | #000000 | = | = |
| Text node | span: Arial 14px/44px 700, #000000 | = | = |
| Transition | transform, background 0.16s, 0.16s ease, ease delay 0s, 0s | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.user-cases_exploreButton 116.0x44.0 bg #ffffff r 999px shadow #ffffff @ 0.08 0px 10px 28px 0px; span.user-cases_exploreArrow 7.0x10.0 border T:5px solid #000000 @ 0 / B:5px solid #000000 @ 0 / L:7px solid #000000 | button.user-cases_exploreButton 116.0x44.0 bg #f4f4f4 r 999px shadow #ffffff @ 0.08 0px 10px 28px 0px; span.user-cases_exploreArrow 7.0x10.0 border T:5px solid #000000 @ 0 / B:5px solid #000000 @ 0 / L:7px solid #000000 | = |
| How | at rest | mouse hover | Shift+Tab, Tab |
| Transform | - | matrix(1, 0, 0, 1, 0, -1) | = |

Crops: `explore-button-default.png`, `explore-button-hover.png`, `explore-button-focus-visible.png`.

#### audio-gate

Audio gate. The math player asks for a tap instead of a dialog: a line of text and a dark Continue button over the blurred slide.

Page: lesson-math. Selector: `button "Continue" parent`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 1046 x 818 |
| Padding | 32px |
| Gap | 16px |
| Border | none |
| Radius | 0px |
| Background | #ffffff @ 0.82 |
| Box shadow | none |
| Backdrop filter | blur(2px) |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | span: -apple-system 16px/24px 400, #21252e |
| Transition | none |
| Painted layers | div.shared_prompt 1046.0x818.0 bg #ffffff @ 0.82; button 180.0x48.0 bg #21252e r 16px |
| Ancestor paint | 1 up section.shared_playerFrame.shared_playerFrameWithAction bg #ffffff |
| How | at rest |

Crops: `audio-gate-default.png`.

#### continue-button

Continue button.

Page: lesson-math. Selector: `button "Continue"`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 180 x 48 | = | = | 176.4 x 47.04 |
| Padding | 0px 24px | = | = | = |
| Border | none | = | = | = |
| Radius | 16px | = | = | = |
| Background | #21252e | #343943 | = | #343943 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 16px/normal 700 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #ffffff | = | = | = |
| Transition | transform, background 0.12s, 0.16s ease, ease delay 0s, 0s | = | = | = |
| Cursor | pointer | = | = | = |
| Painted layers | button 180.0x48.0 bg #21252e r 16px | button 180.0x48.0 bg #343943 r 16px | = | button 176.4x47.0 bg #343943 r 16px |
| Ancestor paint | 1 up div.shared_prompt bg #ffffff @ 0.82 | = | = | = |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |
| Transform | - | = | = | matrix(0.98, 0, 0, 0.98, 0, 0) |

Crops: `continue-button-default.png`, `continue-button-hover.png`, `continue-button-focus-visible.png`, `continue-button-pressed.png`.

### Shell and navigation

#### header

Top bar. The 60px bar over the content column: white with a 1px bottom rule on Homework and Insights, transparent on Academy. Holds the question field on inner pages, Upgrade and Sign in.

Page: home. Selector: `[class*="pc-header_header__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 1440 x 60 |
| Padding | 0px |
| Border | T: none; R: none; B: 1px solid #e4e6eb; L: none |
| Radius | 0px |
| Background | #ffffff |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Text node | span: -apple-system 14px/21px 600, #76542a |
| Transition | none |
| Icon | 24 x 24, colour #000000 |
| Painted layers | header.pc-header_header 1440.0x60.0 bg #ffffff border B:1px solid #e4e6eb; div.pc-search-question-input_searchInputWrap 640.0x40.0 bg #ffffff @ 0.84 border T:1px solid #e4e6eb / R:1px solid #e4e6eb / B:1px solid #e4e6eb / L:1px solid #e4e6eb r 30px; div.pc-search-question-input_line 1.0x14.0 bg #c7c7cc; div.pc-search-question-input_rightIcon.pc-search-question-input_arrowIcon 30.0x30.0 bg #f5f5f7 r 15px; div.pc-search-question-input_searchImageWrap 640.0x4.0 bg #ffffff border T:2px dashed #171e56 @ 0.1 / R:2px dashed #171e56 @ 0.1 / B:2px dashed #171e56 @ 0.1 / L:2px dashed #171e56 @ 0.1 r 24px shadow #a6a8bb @ 0.2 0px 8px 8px 0px; div.pc-upload-panel_container 636.0x203.0 bg #ffffff @ 0.4 r 24px |
| How | at rest |

Crops: `header-default.png`.

#### upgrade-button

Upgrade button. The gold Upgrade pill: a warm gradient fill with brown text and a bolt icon. A div, so it takes no keyboard focus. Measured, never pressed.

Page: home. Selector: `[class*="pc-header_accountActionWarm__"]`. States: default, hover, pressed.

| Property | default | hover | pressed |
|---|---|---|---|
| Size (w x h) | 90.28 x 31 | = | = |
| Padding | 5px 8px | = | = |
| Gap | 2px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffc46a @ 0.55 | #ffc46a @ 0.7 |
| Background image | linear-gradient(90deg, #ffe9dc, #ffeecd) | - | - |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/21px 600 | = | = |
| Letter spacing | normal | = | = |
| Colour | #76542a | = | = |
| Text node | span: -apple-system 14px/21px 600, #76542a | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 14 x 15, colour #76542a | = | = |
| Painted layers | div.pc-header_accountAction.pc-header_accountActionWarm 90.3x31.0 image linear-gradient(90deg, #ffe9dc, #ffeecd) r 8px | div.pc-header_accountAction.pc-header_accountActionWarm 90.3x31.0 bg #ffc46a @ 0.55 r 8px | div.pc-header_accountAction.pc-header_accountActionWarm 90.3x31.0 bg #ffc46a @ 0.7 r 8px |
| How | at rest | mouse hover | CDP forcePseudoState :active:hover |

Crops: `upgrade-button-default.png`, `upgrade-button-hover.png`, `upgrade-button-pressed.png`.

#### sign-in-button

Sign in button. The near-black primary button in the top bar. A span in a div, so it takes no keyboard focus. Measured, never pressed.

Page: home. Selector: `[class*="pc-header_loginEntry__"] span`. States: default, hover, pressed.

| Property | default | hover | pressed |
|---|---|---|---|
| Size (w x h) | 70 x 30 | = | = |
| Padding | 0px 6px | = | = |
| Border | none | = | = |
| Radius | 10px | = | = |
| Background | #21252e | #3e424b | #3e424b |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/normal 600 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Painted layers | span 70.0x30.0 bg #21252e r 10px | span 70.0x30.0 bg #3e424b r 10px | span 70.0x30.0 bg #3e424b r 10px |
| How | at rest | mouse hover | CDP forcePseudoState :active:hover |

Crops: `sign-in-button-default.png`, `sign-in-button-hover.png`, `sign-in-button-pressed.png`.

#### side-menu

Sidebar. The 220px left rail: logo and collapse button, the four destinations, a rule, App, and the Gauth PLUS card pinned to the bottom.

Page: home. Selector: `[class*="side-menu_side-menu__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 220 x 900 |
| Padding | 24px 16px 0px 16px |
| Border | T: none; R: 1px solid #edeef1; B: none; L: none |
| Radius | 0px |
| Background | #ffffff |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Text node | a.side-menu_link.side-menu_link-active: -apple-system 14px/21px 600, #21252e |
| Transition | width 0.5s ease-in-out |
| Icon | 24 x 24, colour #000000 |
| Painted layers | div.side-menu_side-menu.shell-layout_side-menu-wrap 220.0x900.0 bg #ffffff border R:1px solid #edeef1; div.side-menu_side-menu-item.side-menu_side-menu-item-active 187.0x40.0 bg #f5f5f7 r 10px; div.side-menu_divider 187.0x1.0 bg #edeef1; div.side-menu-small-cards_upgrade-small-card 174.0x153.0 bg #fff6e9 r 12px; div.side-menu-small-cards_title 150.0x35.0 border B:1px solid #ffc46a; div.side-menu-small-cards_btn 150.0x32.0 bg #ffc46a @ 0.4 r 10px |
| How | at rest |

Crops: `side-menu-default.png`.

#### side-menu-item-active

Sidebar item, current (cool). The current destination on Homework and Insights: a #f5f5f7 pill with the label in 600.

Page: home. Selector: `[class*="side-menu_side-menu-item-active__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 187 x 40 |
| Padding | 8px 12px |
| Border | none |
| Radius | 10px |
| Background | #f5f5f7 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Text node | a.side-menu_link.side-menu_link-active: -apple-system 14px/21px 600, #21252e |
| Transition | none |
| Cursor | pointer |
| Icon | 24 x 25, colour #000000 |
| Painted layers | div.side-menu_side-menu-item.side-menu_side-menu-item-active 187.0x40.0 bg #f5f5f7 r 10px |
| How | at rest |

Crops: `side-menu-item-active-default.png`.

#### side-menu-item

Sidebar item. A destination row: 40px tall, radius 10, 20px icon, 14/21 label.

Page: home. Selector: `[class*="side-menu_side-menu-item__"]`. States: default, hover, pressed.

| Property | default | hover | pressed |
|---|---|---|---|
| Size (w x h) | 187 x 40 | = | = |
| Padding | 8px 12px | = | = |
| Border | none | = | = |
| Radius | 10px | = | = |
| Background | transparent | #f5f5f7 | #f5f5f7 |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/normal 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #000000 | = | = |
| Text node | a.side-menu_link.side-menu_row-link: -apple-system 14px/21px 400, #21252e | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 24 x 24, colour #000000 | = | = |
| How | at rest | mouse hover | CDP forcePseudoState :active:hover |
| Painted layers | - | div.side-menu_side-menu-item 187.0x40.0 bg #f5f5f7 r 10px | div.side-menu_side-menu-item 187.0x40.0 bg #f5f5f7 r 10px |

Crops: `side-menu-item-default.png`, `side-menu-item-hover.png`, `side-menu-item-pressed.png`.

#### side-menu-link

Sidebar link, keyboard focus. The link inside a sidebar row, which is what takes keyboard focus.

Page: home. Selector: `[class*="side-menu_link__"]`. States: focus-visible.

| Property | focus-visible |
|---|---|
| Size (w x h) | 31.95 x 21 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/21px 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Transition | opacity, max-width, margin-left, visibility 0.26s, 0.5s, 0.5s, 0s ease, ease-in-out, ease-in-out, linear delay 0.14s, 0s, 0s, 0s |
| Cursor | pointer |
| How | Shift+Tab, Tab |

Crops: `side-menu-link-focus-visible.png`.

#### side-menu-collapse

Sidebar collapse button.

Page: home. Selector: `[class*="side-menu_sidebar-collapse__"]`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 24 x 24 | = | = | = |
| Padding | 0px | = | = | = |
| Border | none | = | = | = |
| Radius | 0px | = | = | = |
| Background | transparent | = | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | Arial 13.3333px/normal 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #21252e | = | = | = |
| Transition | none | = | = | = |
| Opacity | 0.4 | - | = | 0.7 |
| Cursor | pointer | = | = | = |
| Icon | 24 x 24, colour #21252e | = | = | = |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |

Crops: `side-menu-collapse-default.png`, `side-menu-collapse-hover.png`, `side-menu-collapse-focus-visible.png`, `side-menu-collapse-pressed.png`.

#### plus-card

Gauth PLUS card. The upsell card at the foot of the sidebar: cream fill, radius 12, a gold rule under the title and a gold "Start Free Trial" button.

Page: home. Selector: `[class*="side-menu-small-cards_upgrade-small-card__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 174 x 153 |
| Padding | 10px 12px 12px 12px |
| Border | none |
| Radius | 12px |
| Background | #fff6e9 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Text node | div.side-menu-small-cards_title: -apple-system 18px/26px 700, #21252e |
| Transition | none |
| Icon | 44 x 19, colour #21252e |
| Painted layers | div.side-menu-small-cards_upgrade-small-card 174.0x153.0 bg #fff6e9 r 12px; div.side-menu-small-cards_title 150.0x35.0 border B:1px solid #ffc46a; div.side-menu-small-cards_btn 150.0x32.0 bg #ffc46a @ 0.4 r 10px |
| How | at rest |

Crops: `plus-card-default.png`.

#### plus-card-button

Gauth PLUS card button. Measured, never pressed.

Page: home. Selector: `[class*="side-menu-small-cards_btn__"]`. States: default, hover, pressed.

| Property | default | hover | pressed |
|---|---|---|---|
| Size (w x h) | 150 x 32 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 10px | = | = |
| Background | #ffc46a @ 0.4 | #ffc46a @ 0.7 | #ffc46a @ 0.8 |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 12px/18px 600 | = | = |
| Letter spacing | normal | = | = |
| Colour | #322211 | = | = |
| Text node | span: -apple-system 12px/18px 600, #322211 | = | = |
| Transition | none | = | = |
| Icon | 15 x 15, colour #322211 | = | = |
| Painted layers | div.side-menu-small-cards_btn 150.0x32.0 bg #ffc46a @ 0.4 r 10px | div.side-menu-small-cards_btn 150.0x32.0 bg #ffc46a @ 0.7 r 10px | div.side-menu-small-cards_btn 150.0x32.0 bg #ffc46a @ 0.8 r 10px |
| Ancestor paint | 1 up div.side-menu-small-cards_upgrade-small-card bg #fff6e9 | = | = |
| How | at rest | mouse hover | CDP forcePseudoState :active:hover |
| Cursor | - | pointer | pointer |

Crops: `plus-card-button-default.png`, `plus-card-button-hover.png`, `plus-card-button-pressed.png`.

#### logo

Logo.

Page: home. Selector: `[class*="side-menu_h-logo__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 90 x 24 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Transition | none |
| Cursor | pointer |
| Icon | 24 x 24, colour #000000 |
| How | at rest |

Crops: `logo-default.png`.

#### side-menu-warm

Sidebar, warm. On Academy the sidebar takes the page ground and the current item turns beige.

Page: science. Selector: `[class*="side-menu_side-menu-warm__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 220 x 900 |
| Padding | 24px 16px 0px 16px |
| Border | T: none; R: 1px solid #edeef1; B: none; L: none |
| Radius | 0px |
| Background | #faf9f5 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Text node | a.side-menu_link.side-menu_row-link: -apple-system 14px/21px 400, #21252e |
| Transition | width 0.5s ease-in-out |
| Icon | 24 x 24, colour #0000ee |
| Painted layers | div.side-menu_side-menu.side-menu_side-menu-warm 220.0x900.0 bg #faf9f5 border R:1px solid #edeef1; div.side-menu_side-menu-item.side-menu_side-menu-item-active 187.0x40.0 bg #f4ebe5 r 10px; div.side-menu_divider 187.0x1.0 bg #edeef1 |
| Ancestor paint | 1 up div.shell-layout_main-wrap.shell-layout_main-wrap-side-menu-expanded bg #faf9f5 |
| How | at rest |

Crops: `side-menu-warm-default.png`.

#### side-menu-item-warm-active

Sidebar item, current (warm). The current destination on Academy: a #f4ebe5 pill (--lesson-primary-fill-2).

Page: science. Selector: `[class*="side-menu_side-menu-item-warm-active__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 187 x 40 |
| Padding | 8px 12px |
| Border | none |
| Radius | 10px |
| Background | #f4ebe5 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Text node | a.side-menu_link.side-menu_link-active: -apple-system 14px/21px 600, #21252e |
| Transition | none |
| Cursor | pointer |
| Icon | 24 x 24, colour #000000 |
| Painted layers | div.side-menu_side-menu-item.side-menu_side-menu-item-active 187.0x40.0 bg #f4ebe5 r 10px |
| How | at rest |

Crops: `side-menu-item-warm-active-default.png`.

#### header-question

Top bar question field. On inner pages the question field moves into the top bar: 640 x 40, white at 84%, a 1px #e4e6eb border, radius 30, image and send buttons. Sample text was typed and deleted.

Page: news. Selector: `[class*="pc-header_input__"]`. States: default, hover, focused, filled.

| Property | default | hover | focused | filled |
|---|---|---|---|---|
| Size (w x h) | 640 x 40 | = | = | = |
| Padding | 0px | = | = | = |
| Border | none | = | = | = |
| Radius | 0px | = | = | = |
| Background | transparent | = | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 13px/normal 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #333333 | = | = | = |
| Text node | div.pc-upload-panel_message: -apple-system 18px/27px 400, #3e4784 @ 0.4, ls 0.126px | = | = | = |
| Transition | none | = | = | = |
| Icon | 24 x 24, colour #333333 | = | = | = |
| Painted layers | div.pc-search-question-input_searchInputWrap 640.0x40.0 bg #ffffff @ 0.84 border T:1px solid #e4e6eb / R:1px solid #e4e6eb / B:1px solid #e4e6eb / L:1px solid #e4e6eb r 30px; div.pc-search-question-input_line 1.0x14.0 bg #c7c7cc; div.pc-search-question-input_rightIcon.pc-search-question-input_arrowIcon 30.0x30.0 bg #f5f5f7 r 15px; div.pc-search-question-input_searchImageWrap 640.0x4.0 bg #ffffff border T:2px dashed #171e56 @ 0.1 / R:2px dashed #171e56 @ 0.1 / B:2px dashed #171e56 @ 0.1 / L:2px dashed #171e56 @ 0.1 r 24px shadow #a6a8bb @ 0.2 0px 8px 8px 0px; div.pc-upload-panel_container 636.0x203.0 bg #ffffff @ 0.4 r 24px | div.pc-search-question-input_searchInputWrap 640.0x40.0 bg #ffffff @ 0.84 border T:1px solid #9ca2ac / R:1px solid #9ca2ac / B:1px solid #9ca2ac / L:1px solid #9ca2ac r 30px; div.pc-search-question-input_line 1.0x14.0 bg #c7c7cc; div.pc-search-question-input_rightIcon.pc-search-question-input_arrowIcon 30.0x30.0 bg #f5f5f7 r 15px; div.pc-search-question-input_searchImageWrap 640.0x4.0 bg #ffffff border T:2px dashed #171e56 @ 0.1 / R:2px dashed #171e56 @ 0.1 / B:2px dashed #171e56 @ 0.1 / L:2px dashed #171e56 @ 0.1 r 24px shadow #a6a8bb @ 0.2 0px 8px 8px 0px; div.pc-upload-panel_container 636.0x203.0 bg #ffffff @ 0.4 r 24px | div.pc-search-question-input_searchInputWrap.pc-search-question-input_searchActive 640.0x40.0 bg #ffffff border T:1px solid #21252e / R:1px solid #21252e / B:1px solid #21252e / L:1px solid #21252e r 30px; div.pc-search-question-input_line 1.0x14.0 bg #c7c7cc; div.pc-search-question-input_rightIcon.pc-search-question-input_arrowIcon 30.0x30.0 bg #f5f5f7 r 15px; div.pc-search-question-input_searchImageWrap.pc-search-question-input_searchImageActive 640.0x207.0 bg #ffffff border T:2px dashed #171e56 @ 0.1 / R:2px dashed #171e56 @ 0.1 / B:2px dashed #171e56 @ 0.1 / L:2px dashed #171e56 @ 0.1 r 24px shadow #a6a8bb @ 0.2 0px 8px 8px 0px; div.pc-upload-panel_container 636.0x203.0 bg #ffffff @ 0.4 r 24px | div.pc-search-question-input_searchInputWrap.pc-search-question-input_searchActive 640.0x40.0 bg #ffffff border T:1px solid #21252e / R:1px solid #21252e / B:1px solid #21252e / L:1px solid #21252e r 30px; div.pc-search-question-input_line 1.0x14.0 bg #c7c7cc; div.pc-search-question-input_rightIcon.pc-search-question-input_arrowIcon 30.0x30.0 bg #21252e r 15px; div.pc-search-question-input_searchImageWrap.pc-search-question-input_searchImageActive 640.0x207.0 bg #ffffff border T:2px dashed #171e56 @ 0.1 / R:2px dashed #171e56 @ 0.1 / B:2px dashed #171e56 @ 0.1 / L:2px dashed #171e56 @ 0.1 r 24px shadow #a6a8bb @ 0.2 0px 8px 8px 0px; div.pc-upload-panel_container 636.0x203.0 bg #ffffff @ 0.4 r 24px |
| How | at rest | mouse hover | clicked into the field | typed "Solve 2x + 3 = 7", then deleted; nothing sent |

Crops: `header-question-default.png`, `header-question-hover.png`, `header-question-focused.png`, `header-question-filled.png`.

### Homework home

#### home-hero

Homework hero. The first band of the home page: a pale lilac gradient ground, the two-line serif title, the question field, the upload panel and the subject chips.

Page: home. Selector: `[class*="slogan_slogan__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 1220 x 673 |
| Padding | 0px 0px 70px 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Background image | linear-gradient(0deg, #f5f6ff @ 0 -13.47%, #f5f6ff 0px) |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Text node | h1.slogan_title: Gauth Home Libre Baskerville 40px/52px 600, #21252e |
| Transition | none |
| Icon | 29 x 28, colour #000000 |
| ::before | 937.266px x 533.375px, absolute, bg #faf6ff, radius 937.28px |
| ::after | 937.266px x 533.375px, absolute, bg #f6fffe, radius 937.28px |
| Painted layers | div.slogan_slogan 1220.0x673.0 image linear-gradient(0deg, #f5f6ff @ 0 -13.47%, #f5f6ff 0px); div::before.slogan_slogan 937.266pxx533.375px bg #faf6ff r 937.28px; div::after.slogan_slogan 937.266pxx533.375px bg #f6fffe r 937.28px; h1.slogan_title 680.0x104.0 bg #21252e image url(data:…); div.pc_search-input-container.slogan_search-input 680.0x64.0 bg #302eb7 @ 0.06 border T:2px solid #171e56 @ 0.1 / R:2px solid #171e56 @ 0.1 / B:2px solid #171e56 @ 0.1 / L:2px solid #171e56 @ 0.1 r 38px; div.pc_search-input 564.0x52.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 12px |
| How | at rest |

Crops: `home-hero-default.png`.

#### home-title

Hero title. "Your AI Study Helper / Gauth it, Ace it!" in Gauth Home Libre Baskerville; the second line is filled with a gradient through background-clip.

Page: home. Selector: `[class*="slogan_title__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 680 x 104 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #21252e |
| Background image | url(data:…) |
| Box shadow | none |
| Outline | none |
| Font | Gauth Home Libre Baskerville 40px/52px 600 |
| Letter spacing | normal |
| Colour | #21252e |
| Transition | none |
| Painted layers | h1.slogan_title 680.0x104.0 bg #21252e image url(data:…) |
| How | at rest |

Crops: `home-title-default.png`.

#### question-box

Question field. The 680 x 64 pill the home page is built around: a faint indigo tint, a 2px indigo-alpha border, radius 38, a round white submit button at the right end. Text was typed and deleted; nothing was sent.

Page: home. Selector: `[class*="pc_search-input-container__"]`. States: default, hover, focused, filled.

| Property | default | hover | focused | filled |
|---|---|---|---|---|
| Size (w x h) | 680 x 64 | = | = | = |
| Padding | 10px 12px 10px 30px | = | = | = |
| Border | 2px solid #171e56 @ 0.1 | 2px solid #171e56 @ 0.2 | 2px solid #171e56 @ 0.2 | 2px solid #171e56 @ 0.2 |
| Radius | 38px | = | = | = |
| Background | #302eb7 @ 0.06 | = | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 16px/normal 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #000000 | = | = | = |
| Transition | none | = | = | = |
| Icon | 29 x 28, colour #000000 | = | = | = |
| Painted layers | div.pc_search-input-container.slogan_search-input 680.0x64.0 bg #302eb7 @ 0.06 border T:2px solid #171e56 @ 0.1 / R:2px solid #171e56 @ 0.1 / B:2px solid #171e56 @ 0.1 / L:2px solid #171e56 @ 0.1 r 38px; div.pc_search-input 564.0x52.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 12px; div.pc_seperator 2.0x20.0 bg #9ca7e0 @ 0.4; button.pc_search-submit-wrap 44.0x44.0 bg #ffffff r 24px | div.pc_search-input-container.slogan_search-input 680.0x64.0 bg #302eb7 @ 0.06 border T:2px solid #171e56 @ 0.2 / R:2px solid #171e56 @ 0.2 / B:2px solid #171e56 @ 0.2 / L:2px solid #171e56 @ 0.2 r 38px; div.pc_search-input 564.0x52.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 12px; div.pc_seperator 2.0x20.0 bg #9ca7e0 @ 0.4; button.pc_search-submit-wrap 44.0x44.0 bg #ffffff r 24px | div.pc_search-input-container.slogan_search-input 680.0x64.0 bg #302eb7 @ 0.06 border T:2px solid #171e56 @ 0.2 / R:2px solid #171e56 @ 0.2 / B:2px solid #171e56 @ 0.2 / L:2px solid #171e56 @ 0.2 r 38px; div.pc_search-input 564.0x52.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 12px; div.pc_seperator 2.0x20.0 bg #9ca7e0 @ 0.4; button.pc_search-submit-wrap 44.0x44.0 bg #ffffff r 24px | div.pc_search-input-container.pc_search-input-container-active 680.0x64.0 bg #302eb7 @ 0.06 border T:2px solid #171e56 @ 0.2 / R:2px solid #171e56 @ 0.2 / B:2px solid #171e56 @ 0.2 / L:2px solid #171e56 @ 0.2 r 38px; div.pc_search-input 564.0x52.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 12px; div.pc_seperator 2.0x20.0 bg #9ca7e0 @ 0.4; button.pc_search-submit-wrap.pc_search-submit-wrap-active 44.0x44.0 bg #000000 r 24px |
| How | at rest | mouse hover | clicked into the field | typed "What is the derivative of x squared?", then deleted; nothing sent |

Crops: `question-box-default.png`, `question-box-hover.png`, `question-box-focused.png`, `question-box-filled.png`.

#### question-input

Question field input.

Page: home. Selector: `[class*="pc_input__"]`. States: default, focus-visible.

| Property | default | focus-visible |
|---|---|---|
| Size (w x h) | 562 x 48 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 12px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 20px/26px 400 | = |
| Letter spacing | normal | = |
| Colour | #21252e | = |
| Transition | none | = |
| Cursor | text | = |
| Placeholder | #293056 @ 0.7, opacity 1 | = |
| How | at rest | Shift+Tab, Tab |

Crops: none.

#### question-submit

Question submit button. The round white arrow button; measured, never pressed.

Page: home. Selector: `[class*="pc_search-submit-wrap__"]`. States: default, hover.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 44 x 44 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 24px | = |
| Background | #ffffff | #302eb7 @ 0.08 |
| Box shadow | none | = |
| Outline | none | = |
| Font | Arial 13.3333px/normal 400 | = |
| Letter spacing | normal | = |
| Colour | #000000 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 29 x 28, colour #000000 | = |
| Painted layers | button.pc_search-submit-wrap 44.0x44.0 bg #ffffff r 24px | button.pc_search-submit-wrap 44.0x44.0 bg #302eb7 @ 0.08 r 24px |
| Ancestor paint | 1 up div.pc_search-input-container.slogan_search-input bg #302eb7 @ 0.06 | = |
| How | at rest | mouse hover |

Crops: `question-submit-default.png`, `question-submit-hover.png`.

#### upload-panel

Upload panel. The dashed drop zone under the field. Hovered only; no file was chosen.

Page: home. Selector: `[class*="pc_uploadWrap__"]`. States: default, hover.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 680 x 207 | = |
| Padding | 0px | = |
| Border | 2px dashed #171e56 @ 0.1 | 2px dashed #171e56 @ 0.4 |
| Radius | 24px | = |
| Background | #ffffff @ 0.4 | = |
| Box shadow | none | = |
| Backdrop filter | blur(2px) | = |
| Outline | none | = |
| Font | -apple-system 16px/normal 400 | = |
| Letter spacing | normal | = |
| Colour | #000000 | = |
| Text node | div.pc-upload-panel_message: -apple-system 18px/27px 400, #3e4784 @ 0.4, ls 0.126px | = |
| Transition | none | = |
| Icon | 30 x 30, colour #000000 | = |
| Painted layers | div.pc_uploadWrap 680.0x207.0 bg #ffffff @ 0.4 border T:2px dashed #171e56 @ 0.1 / R:2px dashed #171e56 @ 0.1 / B:2px dashed #171e56 @ 0.1 / L:2px dashed #171e56 @ 0.1 r 24px; div.pc-upload-panel_container 676.0x203.0 bg #ffffff @ 0.4 r 24px | div.pc_uploadWrap 680.0x207.0 bg #ffffff @ 0.4 border T:2px dashed #171e56 @ 0.4 / R:2px dashed #171e56 @ 0.4 / B:2px dashed #171e56 @ 0.4 / L:2px dashed #171e56 @ 0.4 r 24px; div.pc-upload-panel_container 676.0x203.0 bg #ffffff @ 0.4 r 24px |
| How | at rest | mouse hover |

Crops: `upload-panel-default.png`, `upload-panel-hover.png`.

#### subject-chip

Subject chip. Icon over label, 87 x 72, radius 10, in a muted grey-violet.

Page: home. Selector: `[class*="resources-list_resources-item__"]`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 87.25 x 72 | = | = | = |
| Padding | 0px | = | = | = |
| Border | none | = | = | = |
| Radius | 10px | = | = | = |
| Background | transparent | #eceeff | = | #e5e8ff |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 16px/normal 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #000000 | = | = | = |
| Text node | div.resources-list_resources-item-name: -apple-system 12px/18px 400, #acafc0 | div.resources-list_resources-item-name: -apple-system 12px/18px 400, #7f83a0 | = | div.resources-list_resources-item-name: -apple-system 12px/18px 400, #7f83a0 |
| Transition | none | = | = | = |
| Icon | 29 x 29, colour #000000 | = | = | = |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |
| Painted layers | - | li.resources-list_resources-item 87.3x72.0 bg #eceeff r 10px | = | li.resources-list_resources-item 87.3x72.0 bg #e5e8ff r 10px |

Crops: `subject-chip-default.png`, `subject-chip-hover.png`, `subject-chip-focus-visible.png`, `subject-chip-pressed.png`.

#### subject-more

More subjects chip. The "MORE" pill at the end of the chip row.

Page: home. Selector: `[class*="resources-list_resources-more__"]`. States: default, hover, pressed.

| Property | default | hover | pressed |
|---|---|---|---|
| Size (w x h) | 84.47 x 35 | = | = |
| Padding | 9px 12px 9px 16px | = | = |
| Border | none | = | = |
| Radius | 18px | = | = |
| Background | #eeeef9 | #ececf5 | #e6e7f2 |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/normal 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #000000 | #5c627f | #5c627f |
| Text node | div.resources-list_resources-more-name: -apple-system 14px/normal 500, #9397aa | = | = |
| Transition | none | = | = |
| Icon | 12 x 12, colour #000000 | 12 x 12, colour #5c627f | 12 x 12, colour #5c627f |
| Painted layers | li.resources-list_resources-more 84.5x35.0 bg #eeeef9 r 18px | li.resources-list_resources-more 84.5x35.0 bg #ececf5 r 18px | li.resources-list_resources-more 84.5x35.0 bg #e6e7f2 r 18px |
| How | at rest | mouse hover | CDP forcePseudoState :active:hover |

Crops: `subject-more-default.png`, `subject-more-hover.png`, `subject-more-pressed.png`.

#### atlas-band-title

Section headline. The marketing sections below the fold open with a 32/41.6 700 headline and a 16/24 500 grey line; a word can carry a gradient shine.

Page: home. Selector: `[class*="atlas-intro_headline__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 960 x 115.59 |
| Padding | 0px 0px 40px 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | h2: -apple-system 32px/41.6px 700, #21252e |
| Transition | none |
| Painted layers | span.atlas-intro_titleShine 254.0x41.6 image linear-gradient(90deg, #8a6024, #ff8d1f 18%, #ff6404 34%, #ff4004 52%, #e92472 70%, #4b1f4 |
| How | at rest |

Crops: `atlas-band-title-default.png`.

#### atlas-showcase

Atlas showcase. A radius-48 panel with soft radial colour washes holding the copy, a CTA and a demo video.

Page: home. Selector: `[class*="atlas-intro_showcase__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 960 x 341 |
| Padding | 28px 28px 28px 47px |
| Border | none |
| Radius | 48px |
| Background | #fbf9ff |
| Background image | radial-gradient(420px 260px at 6% 92%, #b5c5ff @ 0.76, #000000 @ 0 72%), radial-gradient(360px 280px at 94% 5%, #d0deff @ 0.88, #000000 @ 0 72%), radial-gradient(440px 260px at 2% 12%, #f8f6ff @ 0.95, #000000 @ 0 70%), n |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | h3: -apple-system 30px/39px 700, #21252e |
| Transition | none |
| Icon | 20 x 20, colour #21252e |
| ::after | 958px x 339px, absolute, bg #000000 @ 0, radius 48px |
| Painted layers | div.atlas-intro_showcase 960.0x341.0 bg #fbf9ff image radial-gradient(420px 260px at 6% 92%, #b5c5ff @ 0.76, #000000 @ 0 72%), radial-gradient(3 r 48px; div::after.atlas-intro_showcase 958pxx339px border T:1px solid #505865 @ 0.1 / R:1px solid #505865 @ 0.1 / B:1px solid #505865 @ 0.1 / L:1px solid #505865 @ 0.1 r 48px; a.atlas-intro_cta 160.0x44.0 bg #21252e r 14px; div.demo-video_preview.atlas-intro_preview 507.0x285.2 border T:1px solid #000000 @ 0.04 / R:1px solid #000000 @ 0.04 / B:1px solid #000000 @ 0.04 / L:1px solid #000000 @ 0.04 r 28px shadow #000000 @ 0.02 0px 0px 8px 0px; button.demo-video_soundButton 34.0x34.0 bg #1f232b @ 0.58 r 50% |
| How | at rest |

Crops: `atlas-showcase-default.png`.

#### atlas-cta

Start Exploring button. A dark radius-14 link button. Measured, never followed.

Page: home. Selector: `[class*="atlas-intro_cta__"]`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 160 x 44 | = | = | = |
| Padding | 0px | = | = | = |
| Gap | 10px | = | = | = |
| Border | none | = | = | = |
| Radius | 14px | = | = | = |
| Background | #21252e | #303541 | = | #303541 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 14px/21px 600 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #ffffff | = | = | = |
| Transition | none | = | outline-offset, outline 0s, 0s ease, ease delay 0s, 0s | = |
| Cursor | pointer | = | = | = |
| Icon | 16 x 16, colour #ffffff | = | = | = |
| Painted layers | a.atlas-intro_cta 160.0x44.0 bg #21252e r 14px | a.atlas-intro_cta 160.0x44.0 bg #303541 r 14px | = | a.atlas-intro_cta 160.0x44.0 bg #303541 r 14px |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |

Crops: `atlas-cta-default.png`, `atlas-cta-hover.png`, `atlas-cta-focus-visible.png`, `atlas-cta-pressed.png`.

#### feature-card

Feature card. White, 1px #5058651a border, radius 32: icon, 16/24 600 title, 14/21 grey line.

Page: home. Selector: `[class*="atlas-intro_feature__"]`. States: default, hover.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 228 x 150 | = |
| Padding | 20px 20px 18px 20px | = |
| Border | 1px solid #505865 @ 0.1 | = |
| Radius | 32px | = |
| Background | #ffffff | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/normal 400 | = |
| Letter spacing | normal | = |
| Colour | #21252e | = |
| Text node | h3: -apple-system 16px/24px 600, #21252e | = |
| Transition | none | = |
| Icon | 32 x 36, colour #21252e | = |
| Painted layers | div.atlas-intro_feature 228.0x150.0 bg #ffffff border T:1px solid #505865 @ 0.1 / R:1px solid #505865 @ 0.1 / B:1px solid #505865 @ 0.1 / L:1px solid #505865 @ 0.1 r 32px | = |
| How | at rest | mouse hover |

Crops: `feature-card-default.png`, `feature-card-hover.png`.

#### solution-option

Solution option row. A radius-20 row with an icon, a 16/22 600 title and a 14/22 description. The rows take turns being the active one, which turns Gauth red (#ff013e) with white text and a red-tinted shadow; the measured row was active.

Page: home. Selector: `[class*="ai-solution_option__"]`. States: default, hover.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 369.81 x 102 | = |
| Padding | 16px 24px 16px 20px | = |
| Border | none | = |
| Radius | 20px | = |
| Background | #ff013e | = |
| Box shadow | #a80000 @ 0.1 0px 7px 14px 0px | = |
| Outline | none | = |
| Font | -apple-system 16px/normal 400 | = |
| Letter spacing | normal | = |
| Colour | #000000 | = |
| Text node | h3.ai-solution_option-title: -apple-system 16px/22px 600, #ffffff | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 24 x 24, colour #000000 | = |
| Painted layers | div.ai-solution_option.ai-solution_option-active 369.8x102.0 bg #ff013e r 20px shadow #a80000 @ 0.1 0px 7px 14px 0px | = |
| How | at rest | mouse hover |

Crops: `solution-option-default.png`, `solution-option-hover.png`.

#### live-tutor-band

Live tutor band. A pink block with one oversized corner radius (54 54 200 54).

Page: home. Selector: `[class*="live-tutor_live-tutor-content__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 960 x 349.2 |
| Padding | 0px |
| Border | none |
| Radius | 54px 200px 54px 54px |
| Background | #ffebf0 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Text node | h2.live-tutor_title: -apple-system 36px/46.8px 600, #1f2556 |
| Transition | none |
| Icon | 13 x 10, colour #1f2556 |
| Painted layers | div.live-tutor_live-tutor-content 960.0x349.2 bg #ffebf0 r 54px 200px 54px 54px |
| How | at rest |

Crops: `live-tutor-band-default.png`.

#### footer

Footer. White with a 1px #f5f5f7 top rule: brand line, email, socials and a language select, then Company, Legal and Download App columns.

Page: home. Selector: `[class*="pc-footer-view_footer-wrap__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 1220 x 244 |
| Padding | 0px |
| Border | T: 1px solid #f5f5f7; R: none; B: none; L: none |
| Radius | 0px |
| Background | #ffffff |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | h3.pc-footer-view_brand-name: -apple-system 20px/26px 600, #21252e |
| Transition | none |
| Icon | 24 x 24, colour #21252e |
| Painted layers | footer.pc-footer-view_footer-wrap 1220.0x244.0 bg #ffffff border T:1px solid #f5f5f7; div.ant-select.ant-select-outlined 61.6x40.0 bg #ffffff border T:1px solid #d9d9d9 / R:1px solid #d9d9d9 / B:1px solid #d9d9d9 / L:1px solid #d9d9d9 r 6px |
| How | at rest |

Crops: `footer-default.png`.

### Academy catalogue

#### academy-ground

Academy page. The catalogue page: #faf9f5 ground under a transparent top bar, the warm sidebar, a 1025px column.

Page: science. Selector: `[class*="catalog_page__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 1220 x 2094.38 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #faf9f5 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | span.catalog_createButtonLabel: SF Pro 14px/21px 500, #21252e |
| Transition | none |
| Icon | 20 x 20, colour #21252e |
| ::before | 1440px x 60px, fixed, bg #faf9f5, radius 0px |
| Painted layers | div.catalog_page 1220.0x2094.4 bg #faf9f5; div::before.catalog_page 1440pxx60px bg #faf9f5; button.catalog_createButton 140.8x37.0 bg #fff8f8 image url(data:…) border T:1px solid #d5e3f4 / R:1px solid #d5e3f4 / B:1px solid #d5e3f4 / L:1px solid #d5e3f4 r 12px; div.catalog_stickyToolbar 1025.0x75.0 bg #faf9f5; div::before.catalog_stickyToolbar 1440pxx87px bg #faf9f5; a.catalog_categoryTab.catalog_categoryTabActive 123.0x36.0 bg #f4ebe5 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 12px |
| How | at rest |

Crops: none.

#### academy-title

Academy title. "Gauth Academy" in Playfair Display 700 at 36px.

Page: science. Selector: `[class*="catalog_hero__"] h1`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 259.25 x 48 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | Playfair Display 36px/normal 700 |
| Letter spacing | normal |
| Colour | #21252e |
| Transition | none |
| How | at rest |

Crops: `academy-title-default.png`.

#### create-course-button

Create Course button. A pale blue pill: an image fill of a soft blue-to-cream gradient, a 1px #d5e3f4 border, radius 12, a sparkle icon and SF Pro 14/21 500.

Page: science. Selector: `[class*="catalog_createButton__"]`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 140.83 x 37 | = | = | 138.01 x 36.26 |
| Padding | 0px 10px | = | = | = |
| Gap | 4px | = | = | = |
| Border | 1px solid #d5e3f4 | 1px solid #c5d8ee | = | 1px solid #c5d8ee |
| Radius | 12px | = | = | = |
| Background | #fff8f8 | = | = | = |
| Background image | url(data:…) | = | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | SF Pro 14px/21px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #21252e | = | = | = |
| Text node | span.catalog_createButtonLabel: SF Pro 14px/21px 500, #21252e | = | = | = |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 20 x 20, colour #21252e | = | = | 19.6 x 19.6, colour #21252e |
| Painted layers | button.catalog_createButton 140.8x37.0 bg #fff8f8 image url(data:…) border T:1px solid #d5e3f4 / R:1px solid #d5e3f4 / B:1px solid #d5e3f4 / L:1px solid #d5e3f4 r 12px | button.catalog_createButton 140.8x37.0 bg #fff8f8 image url(data:…) border T:1px solid #c5d8ee / R:1px solid #c5d8ee / B:1px solid #c5d8ee / L:1px solid #c5d8ee r 12px | = | button.catalog_createButton 138.0x36.3 bg #fff8f8 image url(data:…) border T:1px solid #c5d8ee / R:1px solid #c5d8ee / B:1px solid #c5d8ee / L:1px solid #c5d8ee r 12px |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |
| Transform | - | = | = | matrix(0.98, 0, 0, 0.98, 0, 0) |

Crops: `create-course-button-default.png`, `create-course-button-hover.png`, `create-course-button-focus-visible.png`, `create-course-button-pressed.png`.

#### category-tab-active

Category tab, current. The current catalogue tab: #f4ebe5 fill, transparent border, 700 label.

Page: science. Selector: `[class*="catalog_categoryTabActive__"]`. States: default, focus-visible.

| Property | default | focus-visible |
|---|---|---|
| Size (w x h) | 122.98 x 36 | = |
| Padding | 0px 15px | = |
| Border | 1px solid #000000 @ 0 | = |
| Radius | 12px | = |
| Background | #f4ebe5 | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 14px/19.6px 700 | = |
| Letter spacing | normal | = |
| Colour | #21252e | = |
| Transition | none | = |
| Cursor | pointer | = |
| Painted layers | a.catalog_categoryTab.catalog_categoryTabActive 123.0x36.0 bg #f4ebe5 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 12px | = |
| How | at rest | Shift+Tab, Tab |

Crops: `category-tab-active-default.png`, `category-tab-active-focus-visible.png`.

#### category-tab

Category tab. A 36px tab with a 1px #5058651a border, radius 12, 14/19.6 grey label.

Page: science. Selector: `[class*="catalog_categoryTab__"]`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 139.19 x 36 | = | = | = |
| Padding | 0px 15px | = | = | = |
| Border | 1px solid #505865 @ 0.1 | = | = | = |
| Radius | 12px | = | = | = |
| Background | transparent | #f4f0ec | = | #f4f0ec |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 14px/19.6px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #515761 | #21252e | = | #21252e |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Painted layers | a.catalog_categoryTab 139.2x36.0 border T:1px solid #505865 @ 0.1 / R:1px solid #505865 @ 0.1 / B:1px solid #505865 @ 0.1 / L:1px solid #505865 @ 0.1 r 12px | a.catalog_categoryTab 139.2x36.0 bg #f4f0ec border T:1px solid #505865 @ 0.1 / R:1px solid #505865 @ 0.1 / B:1px solid #505865 @ 0.1 / L:1px solid #505865 @ 0.1 r 12px | = | a.catalog_categoryTab 139.2x36.0 bg #f4f0ec border T:1px solid #505865 @ 0.1 / R:1px solid #505865 @ 0.1 / B:1px solid #505865 @ 0.1 / L:1px solid #505865 @ 0.1 r 12px |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |

Crops: `category-tab-default.png`, `category-tab-hover.png`, `category-tab-focus-visible.png`, `category-tab-pressed.png`.

#### section-heading

Course section heading. An 80px rounded cover beside a 22/28.6 600 title and a 16/22.4 grey line.

Page: science. Selector: `[class*="catalog_sectionHeading__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 1025 x 80 |
| Padding | 0px |
| Gap | 24px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | h2: -apple-system 22px/28.6px 600, #21252e |
| Transition | none |
| How | at rest |

Crops: `section-heading-default.png`.

#### course-section

Course section. One course: its heading and a three-column card grid, closed by a 1px #e7e6e3 rule.

Page: science. Selector: `[class*="catalog_courseSection__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 1025 x 464.09 |
| Padding | 29px 0px 36px 0px |
| Border | T: none; R: none; B: 1px solid #e7e6e3; L: none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | h2: -apple-system 22px/28.6px 600, #21252e |
| Transition | none |
| Painted layers | section.catalog_courseSection 1025.0x464.1 border B:1px solid #e7e6e3; a.catalog_premiumCard.catalog_mobilePremiumCard 325.7x294.1 bg #ffffff border T:1px solid #000000 @ 0.08 / R:1px solid #000000 @ 0.08 / B:1px solid #000000 @ 0.08 / L:1px solid #000000 @ 0.08 r 16px shadow #000000 @ 0.04 0px 4px 7px 0px; div.catalog_premiumProgressTrack 283.7x6.0 bg #f5f5f7 r 4px; a.catalog_premiumCard.catalog_mobilePremiumCard 325.7x294.1 bg #ffffff border T:1px solid #000000 @ 0.08 / R:1px solid #000000 @ 0.08 / B:1px solid #000000 @ 0.08 / L:1px solid #000000 @ 0.08 r 16px shadow #000000 @ 0.04 0px 4px 7px 0px; div.catalog_premiumProgressTrack 283.7x6.0 bg #f5f5f7 r 4px; a.catalog_premiumCard.catalog_mobilePremiumCard 325.7x294.1 bg #ffffff border T:1px solid #000000 @ 0.08 / R:1px solid #000000 @ 0.08 / B:1px solid #000000 @ 0.08 / L:1px solid #000000 @ 0.08 r 16px shadow #000000 @ 0.04 0px 4px 7px 0px |
| How | at rest |

Crops: none.

#### lesson-card

Lesson card (Science Labs, History Signature). A white card, 1px rgba(0,0,0,.08) border, radius 16, a 0 4 7 shadow at 4%: a 147px cover inset 9px at radius 12, a 700 category label, a 16/24 600 title, a 12/16.8 subtitle and a 6px progress track.

Page: science. Selector: `[class*="catalog_premiumCard__"]`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 325.66 x 294.09 | = | = | = |
| Padding | 8px 8px 16px 8px | = | = | = |
| Gap | 12px | = | = | = |
| Border | 1px solid #000000 @ 0.08 | = | = | 1px solid #aeb7c4 |
| Radius | 16px | = | = | = |
| Background | #ffffff | = | = | = |
| Box shadow | #000000 @ 0.04 0px 4px 7px 0px | #000000 @ 0.08 0px 8px 10px 0px | = | #000000 @ 0.08 0px 8px 10px 0px |
| Outline | none | = | = | = |
| Font | -apple-system 16px/normal 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #21252e | = | = | = |
| Text node | p.catalog_premiumCategory: -apple-system 12px/16.8px 700, #757c88 | = | = | = |
| Transition | box-shadow 0.16s ease | = | = | = |
| Cursor | pointer | = | = | = |
| Painted layers | a.catalog_premiumCard.catalog_mobilePremiumCard 325.7x294.1 bg #ffffff border T:1px solid #000000 @ 0.08 / R:1px solid #000000 @ 0.08 / B:1px solid #000000 @ 0.08 / L:1px solid #000000 @ 0.08 r 16px shadow #000000 @ 0.04 0px 4px 7px 0px; div.catalog_premiumProgressTrack 283.7x6.0 bg #f5f5f7 r 4px | a.catalog_premiumCard.catalog_mobilePremiumCard 325.7x294.1 bg #ffffff border T:1px solid #000000 @ 0.08 / R:1px solid #000000 @ 0.08 / B:1px solid #000000 @ 0.08 / L:1px solid #000000 @ 0.08 r 16px shadow #000000 @ 0.08 0px 8px 10px 0px; div.catalog_premiumProgressTrack 283.7x6.0 bg #f5f5f7 r 4px | = | a.catalog_premiumCard.catalog_mobilePremiumCard 325.7x294.1 bg #ffffff border T:1px solid #aeb7c4 / R:1px solid #aeb7c4 / B:1px solid #aeb7c4 / L:1px solid #aeb7c4 r 16px shadow #000000 @ 0.08 0px 8px 10px 0px; div.catalog_premiumProgressTrack 283.7x6.0 bg #f5f5f7 r 4px |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |

Crops: `lesson-card-default.png`, `lesson-card-hover.png`, `lesson-card-focus-visible.png`, `lesson-card-pressed.png`.

#### lesson-card-category

Lesson card category.

Page: science. Selector: `[class*="catalog_premiumCategory__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 283.66 x 16.8 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16.8px 700 |
| Letter spacing | normal |
| Colour | #757c88 |
| Transition | none |
| Cursor | pointer |
| Ancestor paint | 3 up a.catalog_premiumCard.catalog_mobilePremiumCard bg #ffffff shadow #000000 @ 0.04 0px 4px 7px 0px |
| How | at rest |

Crops: none.

#### lesson-card-title

Lesson card title.

Page: science. Selector: `[class*="catalog_premiumInfo__"] h2`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 283.66 x 24 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 600 |
| Letter spacing | normal |
| Colour | #21252e |
| Transition | none |
| Cursor | pointer |
| Ancestor paint | 3 up a.catalog_premiumCard.catalog_mobilePremiumCard bg #ffffff shadow #000000 @ 0.04 0px 4px 7px 0px |
| How | at rest |

Crops: none.

#### lesson-card-subtitle

Lesson card subtitle.

Page: science. Selector: `[class*="catalog_premiumSubtitle__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 283.66 x 16.8 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16.8px 400 |
| Letter spacing | normal |
| Colour | #757c88 |
| Transition | none |
| Cursor | pointer |
| Ancestor paint | 3 up a.catalog_premiumCard.catalog_mobilePremiumCard bg #ffffff shadow #000000 @ 0.04 0px 4px 7px 0px |
| How | at rest |

Crops: none.

#### lesson-card-progress

Lesson card progress track.

Page: science. Selector: `[class*="catalog_premiumProgressTrack__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 283.66 x 6 |
| Padding | 0px |
| Border | none |
| Radius | 4px |
| Background | #f5f5f7 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Transition | none |
| Cursor | pointer |
| Painted layers | div.catalog_premiumProgressTrack 283.7x6.0 bg #f5f5f7 r 4px |
| Ancestor paint | 2 up a.catalog_premiumCard.catalog_mobilePremiumCard bg #ffffff shadow #000000 @ 0.04 0px 4px 7px 0px |
| How | at rest |

Crops: `lesson-card-progress-default.png`.

#### unit-card

Unit card (Math Curriculum). A white card 326 x 178: an 80px cover tile at radius 12 beside an Inter 17/23.8 600 title, a "Unit 1 | 42 Topics" meta line and a 6px pill track.

Page: math. Selector: `[class*="catalog_card__"]`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 325.66 x 178 | = | = | = |
| Padding | 20px | = | = | = |
| Gap | 16px | = | = | = |
| Border | 1px solid #000000 @ 0.08 | = | = | = |
| Radius | 16px | = | = | = |
| Background | #ffffff | = | = | = |
| Box shadow | #000000 @ 0.04 0px 4px 7px 0px | #000000 @ 0.08 0px 8px 10px 0px | = | #000000 @ 0.08 0px 8px 10px 0px |
| Outline | none | = | = | = |
| Font | -apple-system 16px/normal 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #21252e | = | = | = |
| Text node | h3: Inter 17px/23.8px 600, #21252e | = | = | = |
| Transition | box-shadow 0.16s ease | = | = | = |
| Cursor | pointer | = | = | = |
| Painted layers | a.catalog_card 325.7x178.0 bg #ffffff border T:1px solid #000000 @ 0.08 / R:1px solid #000000 @ 0.08 / B:1px solid #000000 @ 0.08 / L:1px solid #000000 @ 0.08 r 16px shadow #000000 @ 0.04 0px 4px 7px 0px; span::before 1pxx12px bg #d9dde3; div.catalog_progressTrack 283.7x6.0 bg #f2f2f4 r 999px | a.catalog_card 325.7x178.0 bg #ffffff border T:1px solid #000000 @ 0.08 / R:1px solid #000000 @ 0.08 / B:1px solid #000000 @ 0.08 / L:1px solid #000000 @ 0.08 r 16px shadow #000000 @ 0.08 0px 8px 10px 0px; span::before 1pxx12px bg #d9dde3; div.catalog_progressTrack 283.7x6.0 bg #f2f2f4 r 999px | = | a.catalog_card 325.7x178.0 bg #ffffff border T:1px solid #000000 @ 0.08 / R:1px solid #000000 @ 0.08 / B:1px solid #000000 @ 0.08 / L:1px solid #000000 @ 0.08 r 16px shadow #000000 @ 0.08 0px 8px 10px 0px; span::before 1pxx12px bg #d9dde3; div.catalog_progressTrack 283.7x6.0 bg #f2f2f4 r 999px |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |

Crops: `unit-card-default.png`, `unit-card-hover.png`, `unit-card-focus-visible.png`, `unit-card-pressed.png`.

#### unit-card-title

Unit card title.

Page: math. Selector: `[class*="catalog_card__"] h3`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 187.66 x 47.59 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | Inter 17px/23.8px 600 |
| Letter spacing | normal |
| Colour | #21252e |
| Transition | none |
| Cursor | pointer |
| Ancestor paint | 2 up a.catalog_card bg #ffffff shadow #000000 @ 0.04 0px 4px 7px 0px |
| How | at rest |

Crops: none.

#### unit-card-meta

Unit card meta line.

Page: math. Selector: `[class*="catalog_meta__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 283.66 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | Inter 14px/19.6px 400 |
| Letter spacing | normal |
| Colour | #757c88 |
| Text node | span: Inter 14px/19.6px 400, #757c88 |
| Transition | none |
| Cursor | pointer |
| Painted layers | span::before 1pxx12px bg #d9dde3 |
| Ancestor paint | 2 up a.catalog_card bg #ffffff shadow #000000 @ 0.04 0px 4px 7px 0px |
| How | at rest |

Crops: `unit-card-meta-default.png`.

#### unit-card-progress

Unit card progress track.

Page: math. Selector: `[class*="catalog_progressTrack__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 283.66 x 6 |
| Padding | 0px |
| Border | none |
| Radius | 999px |
| Background | #f2f2f4 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Transition | none |
| Cursor | pointer |
| Painted layers | div.catalog_progressTrack 283.7x6.0 bg #f2f2f4 r 999px |
| Ancestor paint | 1 up a.catalog_card bg #ffffff shadow #000000 @ 0.04 0px 4px 7px 0px |
| How | at rest |

Crops: none.

#### show-more

Show more button. "Show 14 more" with a chevron: 1px #e0e3e8 border, radius 12, 14/19.6 grey. Pressing it lists the remaining units as compact rows.

Page: math. Selector: `[class*="catalog_expandButton__"]`. States: default, hover, focus-visible, pressed, expanded.

| Property | default | hover | focus-visible | pressed | expanded |
|---|---|---|---|---|---|
| Size (w x h) | 145.28 x 40 | = | = | = | 118.81 x 40 |
| Padding | 0px 16px | = | = | = | = |
| Gap | 7px | = | = | = | = |
| Border | 1px solid #e0e3e8 | 1px solid #c5ccd7 | = | 1px solid #c5ccd7 | = |
| Radius | 12px | = | = | = | = |
| Background | transparent | #f4f0ec | = | #e9ecf1 | = |
| Box shadow | none | = | = | = | = |
| Outline | none | = | = | = | = |
| Font | Arial 14px/19.6px 400 | = | = | = | = |
| Letter spacing | normal | = | = | = | = |
| Colour | #757c88 | #21252e | = | #21252e | = |
| Transition | none | = | = | = | = |
| Cursor | pointer | = | = | = | = |
| Icon | 14 x 14, colour #757c88 | 14 x 14, colour #21252e | = | 14 x 14, colour #21252e | = |
| Painted layers | button.catalog_expandButton 145.3x40.0 border T:1px solid #e0e3e8 / R:1px solid #e0e3e8 / B:1px solid #e0e3e8 / L:1px solid #e0e3e8 r 12px | button.catalog_expandButton 145.3x40.0 bg #f4f0ec border T:1px solid #c5ccd7 / R:1px solid #c5ccd7 / B:1px solid #c5ccd7 / L:1px solid #c5ccd7 r 12px | = | button.catalog_expandButton 145.3x40.0 bg #e9ecf1 border T:1px solid #c5ccd7 / R:1px solid #c5ccd7 / B:1px solid #c5ccd7 / L:1px solid #c5ccd7 r 12px | button.catalog_expandButton 118.8x40.0 border T:1px solid #e0e3e8 / R:1px solid #e0e3e8 / B:1px solid #e0e3e8 / L:1px solid #e0e3e8 r 12px |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover | clicked (a UI toggle) |

Crops: `show-more-default.png`, `show-more-hover.png`, `show-more-focus-visible.png`, `show-more-pressed.png`, `show-more-expanded.png`.

#### unit-row

Unit card revealed by Show more. Show more reveals the units past the sixth as the same cards.

Page: math. Selector: `a[href*="?unit="] (7th and later)`. States: default, hover, focus-visible.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 325.66 x 178 | = | = |
| Padding | 20px | = | = |
| Gap | 16px | = | = |
| Border | 1px solid #000000 @ 0.08 | = | = |
| Radius | 16px | = | = |
| Background | #ffffff | = | = |
| Box shadow | #000000 @ 0.04 0px 4px 7px 0px | #000000 @ 0.08 0px 8px 10px 0px | = |
| Outline | none | = | = |
| Font | -apple-system 16px/normal 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #21252e | = | = |
| Text node | h3: Inter 17px/23.8px 600, #21252e | = | = |
| Transition | box-shadow 0.16s ease | = | = |
| Cursor | pointer | = | = |
| Painted layers | a.catalog_card 325.7x178.0 bg #ffffff border T:1px solid #000000 @ 0.08 / R:1px solid #000000 @ 0.08 / B:1px solid #000000 @ 0.08 / L:1px solid #000000 @ 0.08 r 16px shadow #000000 @ 0.04 0px 4px 7px 0px; span::before 1pxx12px bg #d9dde3; div.catalog_progressTrack 283.7x6.0 bg #f2f2f4 r 999px | a.catalog_card 325.7x178.0 bg #ffffff border T:1px solid #000000 @ 0.08 / R:1px solid #000000 @ 0.08 / B:1px solid #000000 @ 0.08 / L:1px solid #000000 @ 0.08 r 16px shadow #000000 @ 0.08 0px 8px 10px 0px; span::before 1pxx12px bg #d9dde3; div.catalog_progressTrack 283.7x6.0 bg #f2f2f4 r 999px | = |
| How | at rest | mouse hover | Shift+Tab, Tab |

Crops: `unit-row-default.png`, `unit-row-hover.png`, `unit-row-focus-visible.png`.

#### history-card

History lesson card. The same card as Science Labs with a full-bleed illustrated cover.

Page: history. Selector: `[class*="catalog_premiumCard__"]`. States: default, hover.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 325.66 x 264.25 | = |
| Padding | 8px 8px 16px 8px | = |
| Gap | 12px | = |
| Border | 1px solid #000000 @ 0.08 | = |
| Radius | 16px | = |
| Background | #ffffff | = |
| Box shadow | #000000 @ 0.04 0px 4px 7px 0px | #000000 @ 0.08 0px 8px 10px 0px |
| Outline | none | = |
| Font | -apple-system 16px/normal 400 | = |
| Letter spacing | normal | = |
| Colour | #21252e | = |
| Text node | p.catalog_premiumCategory: -apple-system 12px/16.8px 700, #757c88 | = |
| Transition | box-shadow 0.16s ease | = |
| Cursor | pointer | = |
| Painted layers | a.catalog_premiumCard.catalog_mobilePremiumCard 325.7x264.3 bg #ffffff border T:1px solid #000000 @ 0.08 / R:1px solid #000000 @ 0.08 / B:1px solid #000000 @ 0.08 / L:1px solid #000000 @ 0.08 r 16px shadow #000000 @ 0.04 0px 4px 7px 0px; div.catalog_premiumProgressTrack 283.7x6.0 bg #f5f5f7 r 4px | a.catalog_premiumCard.catalog_mobilePremiumCard 325.7x264.3 bg #ffffff border T:1px solid #000000 @ 0.08 / R:1px solid #000000 @ 0.08 / B:1px solid #000000 @ 0.08 / L:1px solid #000000 @ 0.08 r 16px shadow #000000 @ 0.08 0px 8px 10px 0px; div.catalog_premiumProgressTrack 283.7x6.0 bg #f5f5f7 r 4px |
| How | at rest | mouse hover |

Crops: `history-card-default.png`, `history-card-hover.png`.

#### my-empty

My Course empty state. A fan of three course cards, a 20px 600 title, a grey line and a dark Create button.

Page: my. Selector: `[class*="catalog_emptyState__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 1025 x 557 |
| Padding | 36px 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | h2: -apple-system 20px/26px 700, #000000 |
| Transition | none |
| Painted layers | button 120.0x44.0 bg #21252e r 12px |
| How | at rest |

Crops: `my-empty-default.png`.

#### create-button

Create button (empty state). The dark primary button: #21252e, radius 12, 44px, white 16/22.4 500. Hover lightens it to #333943; pressed also scales it to 0.98. Measured, never pressed.

Page: my. Selector: `button "Create"`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 120 x 44 | = | = | 117.6 x 43.12 |
| Padding | 0px 18px | = | = | = |
| Border | none | = | = | = |
| Radius | 12px | = | = | = |
| Background | #21252e | #333943 | = | #333943 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | Arial 16px/22.4px 500 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #ffffff | = | = | = |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Painted layers | button 120.0x44.0 bg #21252e r 12px | button 120.0x44.0 bg #333943 r 12px | = | button 117.6x43.1 bg #333943 r 12px |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |
| Transform | - | = | = | matrix(0.98, 0, 0, 0.98, 0, 0) |

Crops: `create-button-default.png`, `create-button-hover.png`, `create-button-focus-visible.png`, `create-button-pressed.png`.

### Unit page

#### back-link

Back link. An arrow and the catalogue tab name, SF Pro 16/22.4 in #646a77.

Page: unit. Selector: `[class*="math-course-detail_backLink__"]`. States: default, hover, focus-visible.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 148.05 x 22.39 | = | = |
| Padding | 0px | = | = |
| Gap | 10px | = | = |
| Border | none | = | = |
| Radius | 0px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | SF Pro 16px/22.4px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #646a77 | #21252e | = |
| Text node | span: SF Pro 20px/20px 400, #757c88 | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Ancestor paint | 1 up div.math-course-detail_backBar bg #faf9f5 | = | = |
| How | at rest | mouse hover | Shift+Tab, Tab |

Crops: `back-link-default.png`, `back-link-hover.png`, `back-link-focus-visible.png`.

#### course-banner

Course banner. A radius-20 band tinted with the course colour (Algebra 1 is green #ecf4e5): an SF Pro 22/28.6 700 course title, a lessons and topics count, a 7px progress bar and the percent.

Page: unit. Selector: `[class*="math-course-detail_courseBanner__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 1025 x 89 |
| Padding | 16px 20px 16px 28px |
| Border | none |
| Radius | 20px |
| Background | #ecf4e5 |
| Box shadow | none |
| Outline | none |
| Font | SF Pro 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | h1: SF Pro 22px/28.6px 700, #21252e |
| Transition | none |
| Painted layers | section.math-course-detail_courseBanner 1025.0x89.0 bg #ecf4e5 r 20px; div.math-course-detail_courseProgressTrack 81.0x7.0 bg #8fa884 @ 0.3 r 4px; span 0.0x7.0 bg #3c6b26 r 4px |
| How | at rest |

Crops: `course-banner-default.png`.

#### unit-rail

Unit rail. The 310px list of units: a 1px rgba(0,0,0,.04) border, radius 16; the current unit is marked by a 5px green bar on its ::before and green #3c6b26 text.

Page: unit. Selector: `[class*="math-course-detail_unitRail__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 310 x 632 |
| Padding | 4px 4px 4px 0px |
| Border | 1px solid #000000 @ 0.04 |
| Radius | 16px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | SF Pro 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | span: SF Pro 12px/16.8px 400, #3c6b26 |
| Transition | none |
| Painted layers | aside.math-course-detail_unitRail 310.0x632.0 border T:1px solid #000000 @ 0.04 / R:1px solid #000000 @ 0.04 / B:1px solid #000000 @ 0.04 / L:1px solid #000000 @ 0.04 r 16px; button::before.math-course-detail_unitButton.math-course-detail_unitButtonActive 5pxx42px bg #3c6b26 |
| How | at rest |

Crops: `unit-rail-default.png`.

#### unit-button-active

Unit rail item, current.

Page: unit. Selector: `[class*="math-course-detail_unitButtonActive__"]`. States: default, focus-visible.

| Property | default | focus-visible |
|---|---|---|
| Size (w x h) | 304 x 62 | = |
| Padding | 10px 16px | = |
| Gap | 4px | = |
| Border | none | = |
| Radius | 12px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | SF Pro 13.3333px/normal 400 | = |
| Letter spacing | normal | = |
| Colour | #21252e | = |
| Text node | span: SF Pro 12px/16.8px 400, #3c6b26 | = |
| Transition | none | = |
| Cursor | pointer | = |
| ::before | 5px x 42px, absolute, bg #3c6b26, radius 0px | = |
| Painted layers | button::before.math-course-detail_unitButton.math-course-detail_unitButtonActive 5pxx42px bg #3c6b26 | = |
| How | at rest | Shift+Tab, Tab |

Crops: `unit-button-active-default.png`, `unit-button-active-focus-visible.png`.

#### unit-button

Unit rail item. A 62px row: 12/16.8 "Unit n" over a 14/21 700 title.

Page: unit. Selector: `[class*="math-course-detail_unitButton__"]`. States: default, hover, pressed.

| Property | default | hover | pressed |
|---|---|---|---|
| Size (w x h) | 304 x 62 | = | = |
| Padding | 10px 16px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 12px | = | = |
| Background | transparent | #505865 @ 0.04 | #505865 @ 0.06 |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | SF Pro 13.3333px/normal 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #21252e | = | = |
| Text node | span: SF Pro 12px/16.8px 400, #757c88 | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| How | at rest | mouse hover | CDP forcePseudoState :active:hover |
| Painted layers | - | button.math-course-detail_unitButton 304.0x62.0 bg #505865 @ 0.04 r 12px | button.math-course-detail_unitButton 304.0x62.0 bg #505865 @ 0.06 r 12px |

Crops: `unit-button-default.png`, `unit-button-hover.png`, `unit-button-pressed.png`.

#### unit-header

Unit header. A white-on-ground header card with radius 20 over the topic path.

Page: unit. Selector: `[class*="math-course-detail_unitHeader__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 683 x 84 |
| Padding | 18px 38px 12px 38px |
| Border | 1px solid #000000 @ 0.04 |
| Radius | 20px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | SF Pro 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | span: SF Pro 12px/18px 500, #757c88 |
| Transition | none |
| Painted layers | header.math-course-detail_unitHeader 683.0x84.0 border T:1px solid #000000 @ 0.04 / R:1px solid #000000 @ 0.04 / B:1px solid #000000 @ 0.04 / L:1px solid #000000 @ 0.04 r 20px |
| How | at rest |

Crops: `unit-header-default.png`.

#### topic-path

Topic path. Topics as round coin buttons on a winding dotted connector, the label to the right; the current topic has a halo ring.

Page: unit. Selector: `[class*="math-course-detail_topicPath__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 457 x 553 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | SF Pro 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | strong: SF Pro 15px/21px 700, #21252e |
| Transition | none |
| Icon | 127.5 x 458.5, colour #21252e |
| How | at rest |

Crops: `topic-path-default.png`.

#### topic-node-current

Topic node, current.

Page: unit. Selector: `[class*="math-course-detail_topicButtonInProgress__"]`. States: default, hover, focus-visible.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 316 x 105 | = | = |
| Padding | 0px | = | = |
| Gap | 10px | = | = |
| Border | none | = | = |
| Radius | 0px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | SF Pro 13.3333px/normal 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #21252e | = | = |
| Text node | strong: SF Pro 15px/21px 700, #21252e | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 108 x 105, colour #21252e | = | = |
| How | at rest | mouse hover | Shift+Tab, Tab |

Crops: `topic-node-current-default.png`, `topic-node-current-hover.png`, `topic-node-current-focus-visible.png`.

#### topic-node

Topic node, not started. A pale coin with a star and a grey label.

Page: unit. Selector: `[class*="math-course-detail_topicButton__"]`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 332 x 108 | = | = | = |
| Padding | 10px | = | = | = |
| Gap | 10px | = | = | = |
| Border | none | = | = | = |
| Radius | 0px | = | = | = |
| Background | transparent | = | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | SF Pro 13.3333px/normal 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #9ca2ac | #757c88 | = | #757c88 |
| Text node | strong: SF Pro 15px/21px 500, #9ca2ac | strong: SF Pro 15px/21px 500, #757c88 | = | strong: SF Pro 15px/21px 500, #757c88 |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 96 x 88, colour #9ca2ac | 96 x 88, colour #757c88 | = | 94.08 x 86.24, colour #757c88 |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |

Crops: `topic-node-default.png`, `topic-node-hover.png`, `topic-node-focus-visible.png`, `topic-node-pressed.png`.

#### learning-panel

Start panel. The floating card under the current topic: white, a 1px #5058651a border, radius 28, a 0 12 14 shadow tinted navy at 14%, a 17/23.8 700 topic title and a full-width dark Start button.

Page: unit. Selector: `[class*="math-course-detail_learningPanel__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 460 x 145.8 |
| Padding | 26px 24px 22px 24px |
| Gap | 24px |
| Border | 1px solid #505865 @ 0.1 |
| Radius | 28px |
| Background | #ffffff |
| Box shadow | #2e3d6b @ 0.14 0px 12px 14px 0px |
| Outline | none |
| Font | SF Pro 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | div.math-course-detail_learningPanelTitle: SF Pro 17px/23.8px 700, #21252e |
| Transition | none |
| Transform | matrix(1, 0, 0, 1, 0, 0) |
| Painted layers | section.math-course-detail_learningPanel 460.0x145.8 bg #ffffff border T:1px solid #505865 @ 0.1 / R:1px solid #505865 @ 0.1 / B:1px solid #505865 @ 0.1 / L:1px solid #505865 @ 0.1 r 28px shadow #2e3d6b @ 0.14 0px 12px 14px 0px; a.math-course-detail_lessonAction 410.0x48.0 bg #21252e r 12px; a::after.math-course-detail_lessonAction 139.391pxx86.3906px image linear-gradient(90deg, #000000 @ 0, #ffffff @ 0.42, #000000 @ 0) |
| How | at rest |

Crops: `learning-panel-default.png`.

#### start-button

Start button. The primary button: #21252e, radius 12, 48px, white 16/24 700, with a moving light sheen drawn on ::after. Pressed scales it to 0.98.

Page: unit. Selector: `[class*="math-course-detail_lessonAction__"]`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 410 x 48 | = | = | 401.8 x 47.04 |
| Padding | 0px | = | = | = |
| Border | none | = | = | = |
| Radius | 12px | = | = | = |
| Background | #21252e | = | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | SF Pro 16px/24px 700 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #ffffff | = | = | = |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| ::after | 139.391px x 86.3906px, absolute, bg #000000 @ 0 linear-gradient(90deg, #000000 @ 0, #ffffff @ 0.42, #000000 @ 0), radius 0px | = | = | = |
| Painted layers | a.math-course-detail_lessonAction 410.0x48.0 bg #21252e r 12px; a::after.math-course-detail_lessonAction 139.391pxx86.3906px image linear-gradient(90deg, #000000 @ 0, #ffffff @ 0.42, #000000 @ 0) | = | = | a.math-course-detail_lessonAction 401.8x47.0 bg #21252e r 12px; a::after.math-course-detail_lessonAction 139.391pxx86.3906px image linear-gradient(90deg, #000000 @ 0, #ffffff @ 0.42, #000000 @ 0) |
| Ancestor paint | 1 up section.math-course-detail_learningPanel bg #ffffff shadow #2e3d6b @ 0.14 0px 12px 14px 0px | = | = | = |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |
| Transform | - | = | = | matrix(0.98, 0, 0, 0.98, 0, 0) |

Crops: `start-button-default.png`, `start-button-hover.png`, `start-button-focus-visible.png`, `start-button-pressed.png`.

### Lesson player: science canvas

#### canvas-header

Lesson header. Exit button and the lesson title in Playfair Display 16/21 600 at the left; the transport (previous, play or pause, next), Reset view and Settings at the right, all 32px round ghost buttons.

Page: lesson-science. Selector: `header[class*="canvas_header__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 1396 x 40 |
| Padding | 0px |
| Gap | 24px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | Canvas Print 16px/normal 400 |
| Letter spacing | normal |
| Colour | #252524 |
| Text node | h1.astryx-text.label: Playfair Display 16px/21px 600, #21252e |
| Transition | none |
| Icon | 40 x 40, colour #25252a |
| Painted layers | div.astryx-tooltip 0.0x0.0 bg #25252a r 12px; div.astryx-tooltip 0.0x0.0 bg #25252a r 12px; div.astryx-tooltip 0.0x0.0 bg #25252a r 12px; div.astryx-tooltip 0.0x0.0 bg #25252a r 12px; div.astryx-tooltip 0.0x0.0 bg #25252a r 12px; div.astryx-tooltip 0.0x0.0 bg #25252a r 12px |
| Ancestor paint | 1 up main.canvas_runtime bg #fcfcfc |
| How | at rest |

Crops: `canvas-header-default.png`.

#### canvas-exit

Exit button.

Page: lesson-science. Selector: `button "Exit lesson"`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 40 x 40 | = | = | 39.2 x 39.2 |
| Padding | 0px | = | = | = |
| Gap | 8px | = | = | = |
| Border | none | = | = | = |
| Radius | 9999px | = | = | = |
| Background | transparent | = | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | 2px solid #0064e0 offset 3px | = |
| Font | Canvas Print 14px/20.0004px 500 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #25252a | = | = | = |
| Transition | background-image, background-color, color, opacity, transform 0.125s cubic-bezier(0.24, 1, 0.4, 1) | = | = | = |
| Transform | matrix(1, 0, 0, 1, 0, 0) | = | = | matrix(0.98, 0, 0, 0.98, 0, 0) |
| Cursor | pointer | = | = | = |
| Icon | 40 x 40, colour #25252a | = | = | 39.2 x 39.2, colour #25252a |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |
| Background image | - | linear-gradient(#25252a @ 0.05, #25252a @ 0.05) | = | linear-gradient(#25252a @ 0.1, #25252a @ 0.1) |
| Painted layers | - | button.astryx-button.ghost 40.0x40.0 image linear-gradient(#25252a @ 0.05, #25252a @ 0.05) r 9999px | button.astryx-button.ghost 40.0x40.0 r 9999px outline 2px solid #0064e0 offset 3px | button.astryx-button.ghost 39.2x39.2 image linear-gradient(#25252a @ 0.1, #25252a @ 0.1) r 9999px |

Crops: `canvas-exit-default.png`, `canvas-exit-hover.png`, `canvas-exit-focus-visible.png`, `canvas-exit-pressed.png`.

#### canvas-control

Transport and view buttons. A 32px round ghost button holding a 32px icon. Hover lays a 5% ink film over it, pressed 10% and a 0.98 scale; keyboard focus draws Astryx's 2px #0064e0 ring 3px out.

Page: lesson-science. Selector: `button "Reset view"`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = | 31.36 x 31.36 |
| Padding | 0px | = | = | = |
| Gap | 8px | = | = | = |
| Border | none | = | = | = |
| Radius | 9999px | = | = | = |
| Background | transparent | = | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | 2px solid #0064e0 offset 3px | = |
| Font | Canvas Print 14px/20.0004px 500 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #25252a | = | = | = |
| Transition | background-image, background-color, color, opacity, transform 0.125s cubic-bezier(0.24, 1, 0.4, 1) | = | = | = |
| Transform | matrix(1, 0, 0, 1, 0, 0) | = | = | matrix(0.98, 0, 0, 0.98, 0, 0) |
| Cursor | pointer | = | = | = |
| Icon | 32 x 32, colour #25252a | = | = | 31.36 x 31.36, colour #25252a |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |
| Background image | - | linear-gradient(#25252a @ 0.05, #25252a @ 0.05) | = | linear-gradient(#25252a @ 0.1, #25252a @ 0.1) |
| Painted layers | - | button.astryx-button.ghost 32.0x32.0 image linear-gradient(#25252a @ 0.05, #25252a @ 0.05) r 9999px | button.astryx-button.ghost 32.0x32.0 r 9999px outline 2px solid #0064e0 offset 3px | button.astryx-button.ghost 31.4x31.4 image linear-gradient(#25252a @ 0.1, #25252a @ 0.1) r 9999px |

Crops: `canvas-control-default.png`, `canvas-control-hover.png`, `canvas-control-focus-visible.png`, `canvas-control-pressed.png`.

#### canvas-outline

Section rail. The right-hand outline: right-aligned 14/20 section names beside a 2px track whose dark segment marks the current section.

Page: lesson-science. Selector: `nav[class*="canvas_outline__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 240 x 118 |
| Padding | 0px |
| Gap | 2px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | Canvas Print 16px/normal 400 |
| Letter spacing | normal |
| Colour | #252524 |
| Text node | span: Canvas Print 14px/20.0004px 600, #25252a |
| Transition | none |
| Transform | matrix(1, 0, 0, 1, 0, -59) |
| Painted layers | span 2.0x118.0 bg #e2e2e8 r 9999px; span.astryx-outline-indicator 2.0x28.0 bg #25252a r 9999px |
| Ancestor paint | 1 up main.canvas_runtime bg #fcfcfc |
| How | at rest |

Crops: `canvas-outline-default.png`.

#### outline-item-active

Section rail item, current.

Page: lesson-science. Selector: `a.astryx-outline-item.active`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 236 x 28 |
| Padding | 4px 12px 4px 8px |
| Border | none |
| Radius | 8px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | Canvas Print 14px/20.0004px 600 |
| Letter spacing | normal |
| Colour | #25252a |
| Text node | span: Canvas Print 14px/20.0004px 600, #25252a |
| Transition | background-color, color 0.125s cubic-bezier(0.24, 1, 0.4, 1) |
| Cursor | pointer |
| How | at rest |

Crops: `outline-item-active-default.png`.

#### outline-item

Section rail item.

Page: lesson-science. Selector: `a.astryx-outline-item`. States: default, hover, focus-visible.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 236 x 28 | = | = |
| Padding | 4px 12px 4px 8px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #25252a @ 0.05 | = |
| Box shadow | none | = | = |
| Outline | none | = | 2px solid #0064e0 offset 3px |
| Font | Canvas Print 14px/20.0004px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #5e5e63 | #25252a | = |
| Text node | span: Canvas Print 14px/20.0004px 400, #5e5e63 | span: Canvas Print 14px/20.0004px 400, #25252a | = |
| Transition | background-color, color 0.125s cubic-bezier(0.24, 1, 0.4, 1) | = | = |
| Cursor | pointer | = | = |
| How | at rest | mouse hover | keydown then focus() |
| Painted layers | - | a.astryx-outline-item.level-1 236.0x28.0 bg #25252a @ 0.05 r 8px | a.astryx-outline-item.level-1 236.0x28.0 r 8px outline 2px solid #0064e0 offset 3px |

Crops: `outline-item-default.png`, `outline-item-hover.png`, `outline-item-focus-visible.png`.

#### ask-tutor

Ask Tutor bar. The compact pill docked at the bottom centre: white, 1px #e2e2e8 border, radius 9999, a two-layer soft shadow, the Gauth mascot, an "Ask Tutor" placeholder and a microphone button. It widens to 820px when opened (0.26s).

Page: lesson-science. Selector: `[class*="canvas_shell__"]`. States: default, hover.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 820 x 52 | = |
| Padding | 0px | = |
| Border | 1px solid #e2e2e8 | = |
| Radius | 9999px | = |
| Background | #ffffff | = |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #28282a @ 0.05 0px 2px 4px 0px, #28282a @ 0.1 0px 4px 12px 0px | = |
| Outline | none | = |
| Font | Canvas Print 16px/normal 400 | = |
| Letter spacing | normal | = |
| Colour | #252524 | = |
| Text node | div: SF Pro 16px/24px 400, #9ca2ac | = |
| Transition | width 0.26s cubic-bezier(0.22, 1, 0.36, 1) | = |
| Icon | 40 x 40, colour #000000 | = |
| Painted layers | div.astryx-card.default 820.0x52.0 bg #ffffff border T:1px solid #e2e2e8 / R:1px solid #e2e2e8 / B:1px solid #e2e2e8 / L:1px solid #e2e2e8 r 9999px shadow #000000 @ 0 0px 0px 0px 0px, #28282a @ 0.05 0px 2px 4px 0px, #28282a @ 0.1 0px 4px 12px 0px; div.astryx-popover.astryx-popover-surface 0.0x0.0 bg #ffffff r 12px shadow #28282a @ 0.05 0px 2px 4px 0px, #28282a @ 0.1 0px 4px 8px 0px | = |
| How | at rest | mouse hover |

Crops: `ask-tutor-default.png`, `ask-tutor-hover.png`.

#### ask-tutor-mic

Ask Tutor microphone button. Measured, never pressed.

Page: lesson-science. Selector: `[class*="canvas_microphone__"]`. States: default, hover, focus-visible.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 40 x 40 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 50% | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | 2px solid #000000 offset 2px |
| Font | Arial 13.3333px/normal 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #000000 | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 40 x 40, colour #000000 | = | = |
| Ancestor paint | 3 up div.astryx-card.default bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #28282a @ 0.05 0px 2px 4px 0px, #28282a @ 0.1 0px 4px 12px 0px | = | = |
| How | at rest | mouse hover | Shift+Tab, Tab |
| Painted layers | - | = | button.canvas_microphone 40.0x40.0 r 50% outline 2px solid #000000 offset 2px |

Crops: `ask-tutor-mic-default.png`, `ask-tutor-mic-hover.png`, `ask-tutor-mic-focus-visible.png`.

#### ask-tutor-open

Ask Tutor bar, opened. Clicking the bar widens it into a text field. Sample text was typed and deleted; no message was sent.

Page: lesson-science. Selector: `[class*="canvas_shell__"]`. States: opened, filled.

| Property | opened | filled |
|---|---|---|
| Size (w x h) | 820 x 52 | = |
| Padding | 0px | = |
| Border | 1px solid #e2e2e8 | = |
| Radius | 9999px | = |
| Background | #ffffff | = |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #28282a @ 0.05 0px 2px 4px 0px, #28282a @ 0.1 0px 4px 12px 0px | = |
| Outline | none | = |
| Font | Canvas Print 16px/normal 400 | = |
| Letter spacing | normal | = |
| Colour | #252524 | = |
| Text node | div: SF Pro 16px/24px 400, #9ca2ac | div: SF Pro 16px/24px 400, #1f2021 |
| Transition | width 0.26s cubic-bezier(0.22, 1, 0.36, 1) | = |
| Icon | 40 x 40, colour #000000 | = |
| Painted layers | div.astryx-card.default 820.0x52.0 bg #ffffff border T:1px solid #e2e2e8 / R:1px solid #e2e2e8 / B:1px solid #e2e2e8 / L:1px solid #e2e2e8 r 9999px shadow #000000 @ 0 0px 0px 0px 0px, #28282a @ 0.05 0px 2px 4px 0px, #28282a @ 0.1 0px 4px 12px 0px; div.astryx-popover.astryx-popover-surface 0.0x0.0 bg #ffffff r 12px shadow #28282a @ 0.05 0px 2px 4px 0px, #28282a @ 0.1 0px 4px 8px 0px | = |
| How | clicked into the bar | typed "Why does thin air reduce drag?", then deleted; nothing sent |

Crops: `ask-tutor-open-opened.png`, `ask-tutor-open-filled.png`.

#### settings-popover

Settings popover. Speed, Narration and Captions switches, a Zoom stepper and Export PDF (not pressed): a white card with a 1px #f2f2f2 border, radius 24 and a 0 8 14 shadow at 9%.

Page: lesson-science. Selector: `role=dialog (Settings)`. States: opened.

| Property | opened |
|---|---|
| Size (w x h) | 298 x 246 |
| Padding | 0px |
| Border | none |
| Radius | 24px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | Figtree 14px/20.0004px 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Text node | span.canvas_label: SF Pro 14px/21px 400, #0d0d0d |
| Transition | none |
| Icon | 20 x 20, colour #0d0d0d |
| Painted layers | section.canvas_settings 298.0x246.0 bg #ffffff border T:1px solid #f2f2f2 / R:1px solid #f2f2f2 / B:1px solid #f2f2f2 / L:1px solid #f2f2f2 r 24px shadow #000000 @ 0.09 0px 8px 14px 0px; button.astryx-button.secondary 119.0x32.0 bg #25252a @ 0.06 r 9999px |
| How | Settings pressed (opens a menu) |

Crops: `settings-popover-opened.png`.

#### switch

Switch. A Settings row holding the Narration toggle, off: 44px, radius 12; hover fills it #f3f3f3 and keyboard focus draws a 2px #307aff ring inside. Not toggled.

Page: lesson-science. Selector: `role=switch`. States: default, hover, focus-visible.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 264 x 44 | = | = |
| Padding | 0px 8px | = | = |
| Border | none | = | = |
| Radius | 12px | = | = |
| Background | transparent | #f3f3f3 | #f3f3f3 |
| Box shadow | none | = | = |
| Outline | none | = | 2px solid #307aff offset -2px |
| Font | SF Pro 14px/21px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0d0d0d | = | = |
| Text node | span.canvas_label: SF Pro 14px/21px 400, #0d0d0d | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 36 x 36, colour #0d0d0d | = | = |
| Ancestor paint | 1 up section.canvas_settings bg #ffffff shadow #000000 @ 0.09 0px 8px 14px 0px | = | = |
| How | at rest | mouse hover | Shift+Tab, Tab |
| Painted layers | - | button.canvas_row 264.0x44.0 bg #f3f3f3 r 12px | button.canvas_row 264.0x44.0 bg #f3f3f3 r 12px outline 2px solid #307aff offset -2px |

Crops: `switch-default.png`, `switch-hover.png`, `switch-focus-visible.png`.

#### chapter-title

Chapter title. "Canvas Chapter", which is Libre Baskerville Bold, 24/30.

Page: lesson-science. Selector: `h2[class*="canvas_title__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 470 x 57 |
| Padding | 27px 26px 0px 32px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | Canvas Chapter 24px/30px 700 |
| Letter spacing | normal |
| Colour | #292827 |
| Transition | none |
| Cursor | grab |
| How | at rest |

Crops: `chapter-title-default.png`.

#### note-heading

Note heading. "Canvas Heading" (Satoshi Medium) 18/26 600; the note being read is blue #2e70ed.

Page: lesson-science. Selector: `h3[class*="canvas_title__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 416 x 26 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | Canvas Heading 18px/26px 600 |
| Letter spacing | normal |
| Colour | #2e70ed |
| Text node | span: Canvas Heading 18px/26px 600, #2e70ed |
| Transition | none |
| Transform | matrix(1, 0, 0, 1, 0, 0) |
| Cursor | grab |
| How | at rest |

Crops: `note-heading-default.png`.

#### note-text

Note body text. "Canvas Print" (Satoshi) 16/28 in a warm grey #45433f.

Page: lesson-science. Selector: `[class*="canvas_text__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 416 x 84 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | Canvas Print 16px/28px 400 |
| Letter spacing | normal |
| Colour | #45433f |
| Text node | span: Canvas Print 16px/28px 400, #45433f |
| Transition | none |
| Transform | matrix(1, 0, 0, 1, 0, 0) |
| Cursor | grab |
| How | at rest |

Crops: `note-text-default.png`.

#### canvas-ground

Canvas ground. A #fcfcfc board with a dot grid, panned and zoomed by drag and Ctrl/Cmd + scroll.

Page: lesson-science. Selector: `[class*="canvas_viewport__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 1440 x 900 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #fcfcfc |
| Box shadow | none |
| Outline | none |
| Font | Canvas Print 16px/normal 400 |
| Letter spacing | normal |
| Colour | #252524 |
| Text node | h2.canvas_title: Canvas Chapter 24px/30px 700, #292827 |
| Transition | none |
| Cursor | grab |
| Painted layers | div.canvas_viewport 1440.0x900.0 bg #fcfcfc; div.canvas_grid 1440.0x900.0 image url(data:…); figure.canvas_image 416.0x257.8 bg #ffffff r 20px |
| Ancestor paint | 1 up main.canvas_runtime bg #fcfcfc |
| How | at rest |

Crops: none.

#### figure-card

Figure card. An animated diagram in a white radius-20 frame.

Page: lesson-science. Selector: `figure[class*="canvas_image__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 416 x 257.83 |
| Padding | 0px |
| Border | none |
| Radius | 20px |
| Background | #ffffff |
| Box shadow | none |
| Outline | none |
| Font | Canvas Print 16px/normal 400 |
| Letter spacing | normal |
| Colour | #292827 |
| Transition | none |
| Cursor | grab |
| Painted layers | figure.canvas_image 416.0x257.8 bg #ffffff r 20px |
| How | at rest |

Crops: `figure-card-default.png`.

#### callout

Takeaway callout. A #e8fbef radius-14 box with a bulb icon for the one-line takeaway.

Page: lesson-science. Selector: `blockquote[class*="canvas_callout__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 416 x 88 |
| Padding | 14px 10px |
| Gap | 10px |
| Border | none |
| Radius | 14px |
| Background | #e8fbef |
| Box shadow | none |
| Outline | none |
| Font | Canvas Print 14px/20px 500 |
| Letter spacing | normal |
| Colour | #202522 |
| Text node | span: Canvas Print 14px/20px 500, #202522 |
| Transition | none |
| Transform | matrix(1, 0, 0, 1, 0, 0) |
| Cursor | grab |
| Icon | 24 x 24, colour #202522 |
| Painted layers | blockquote.canvas_callout 416.0x88.0 bg #e8fbef r 14px |
| How | at rest |

Crops: `callout-default.png`.

#### numbered-list

Numbered list. Points with a small number in a pale blue disc and 16/24 text.

Page: lesson-science. Selector: `ol[class*="canvas_list__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 416 x 240 |
| Padding | 0px |
| Gap | 24px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | Canvas Print 16px/normal 400 |
| Letter spacing | normal |
| Colour | #292827 |
| Text node | span.canvas_marker: Canvas Print 12px/20px 700, #093c83 |
| Transition | none |
| Cursor | grab |
| Painted layers | span.canvas_marker 20.0x20.0 bg #eef5ff r 50%; span.canvas_marker 20.0x20.0 bg #eef5ff r 50%; span.canvas_marker 20.0x20.0 bg #eef5ff r 50%; span.canvas_marker 20.0x20.0 bg #eef5ff r 50% |
| How | at rest |

Crops: `numbered-list-default.png`.

#### quiz-card

Quiz card. A check-in question docked over the canvas: white, 1px #e3e3e3 border, radius 20, a 0 6 24 shadow at 7%, an Inter 16/24 600 question, four outlined options and a small close button. No option was chosen.

Page: lesson-science. Selector: `canvas quiz`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 560 x 296 |
| Padding | 20px |
| Gap | 12px |
| Border | 1px solid #e3e3e3 |
| Radius | 20px |
| Background | #ffffff |
| Box shadow | #000000 @ 0.07 0px 6px 24px 0px |
| Outline | none |
| Font | SF Pro 16px/normal 400 |
| Letter spacing | normal |
| Colour | #20242d |
| Text node | span: Inter 16px/24px 600, #20242d |
| Transition | none |
| Icon | 16 x 16, colour #737373 |
| Painted layers | section.canvas_dock 560.0x296.0 bg #ffffff border T:1px solid #e3e3e3 / R:1px solid #e3e3e3 / B:1px solid #e3e3e3 / L:1px solid #e3e3e3 r 20px shadow #000000 @ 0.07 0px 6px 24px 0px; div.astryx-card.default 518.0x44.0 bg #ffffff border T:1px solid #e6e6e7 / R:1px solid #e6e6e7 / B:1px solid #e6e6e7 / L:1px solid #e6e6e7 r 10px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px; div.astryx-card.default 518.0x44.0 bg #ffffff border T:1px solid #e6e6e7 / R:1px solid #e6e6e7 / B:1px solid #e6e6e7 / L:1px solid #e6e6e7 r 10px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px; div.astryx-card.default 518.0x44.0 bg #ffffff border T:1px solid #e6e6e7 / R:1px solid #e6e6e7 / B:1px solid #e6e6e7 / L:1px solid #e6e6e7 r 10px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px; div.astryx-card.default 518.0x44.0 bg #ffffff border T:1px solid #e6e6e7 / R:1px solid #e6e6e7 / B:1px solid #e6e6e7 / L:1px solid #e6e6e7 r 10px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| How | at rest |

Crops: `quiz-card-default.png`.

#### quiz-option

Quiz option. A 44px option, 1px #e6e6e7 border, radius 10, SF Pro 14/20, over a visually hidden radio. Hover fills it #f3f3f3; keyboard focus draws Astryx's 2px #0064e0 ring 3px out. Hovered and focused only.

Page: lesson-science. Selector: `canvas quiz option`. States: default, hover, focus-visible.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 518 x 44 | = | = |
| Padding | 0px 12px | = | = |
| Border | 1px solid #e6e6e7 | = | = |
| Radius | 10px | = | = |
| Background | #ffffff | #f3f3f3 | = |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px | = | = |
| Outline | none | = | 2px solid #0064e0 offset 3px |
| Font | SF Pro 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #2c323d | = | = |
| Text node | span: SF Pro 14px/20px 400, #2c323d | = | = |
| Transition | box-shadow, border-color 0.125s cubic-bezier(0.24, 1, 0.4, 1) | = | = |
| Cursor | pointer | = | = |
| ::after | 516px x 42px, absolute, bg #000000 @ 0, radius 10px | = | = |
| Painted layers | div.astryx-card.default 518.0x44.0 bg #ffffff border T:1px solid #e6e6e7 / R:1px solid #e6e6e7 / B:1px solid #e6e6e7 / L:1px solid #e6e6e7 r 10px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px | div.astryx-card.default 518.0x44.0 bg #f3f3f3 border T:1px solid #e6e6e7 / R:1px solid #e6e6e7 / B:1px solid #e6e6e7 / L:1px solid #e6e6e7 r 10px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px | div.astryx-card.default 518.0x44.0 bg #ffffff border T:1px solid #e6e6e7 / R:1px solid #e6e6e7 / B:1px solid #e6e6e7 / L:1px solid #e6e6e7 r 10px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px outline 2px solid #0064e0 offset 3px |
| Ancestor paint | 2 up section.canvas_dock bg #ffffff shadow #000000 @ 0.07 0px 6px 24px 0px | = | = |
| How | at rest | mouse hover | Shift+Tab, Tab |

Crops: `quiz-option-default.png`, `quiz-option-hover.png`, `quiz-option-focus-visible.png`.

### Lesson player: math

#### math-lesson-page

Math lesson page. Two columns on #faf9f5: a 360px tutor column at the left and the slide in a white radius-32 frame at the right, under a 66px header with the progress bar.

Page: lesson-math. Selector: `[class*="shared_lessonPage__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 1440 x 900 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #faf9f5 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | span.shared_text: -apple-system 14px/21px 400, #646a77 |
| Transition | none |
| Icon | 40 x 40, colour #21252e |
| Painted layers | div.shared_lessonPage 1440.0x900.0 bg #faf9f5; aside.shared_tutorPanel 360.0x900.0 bg #faf9f5; div.shared_tutorTopMask 360.0x140.0 image linear-gradient(#faf9f5 0px, #faf9f5 82%, #faf9f5 @ 0 100%); span.shared_text 276.0x42.0 image linear-gradient(100deg, #7c818c 0px, #7c818c 38%, #a9adb5 47%, #d4d6da 52%, #a9adb5 57%, #; div.tutor_inputBar 296.0x48.0 bg #ffffff border T:1px solid #e4e6eb / R:1px solid #e4e6eb / B:1px solid #e4e6eb / L:1px solid #e4e6eb r 16px; div.shared_progressTrack 532.0x8.0 bg #edeade r 100px |
| How | at rest |

Crops: none.

#### tutor-panel

Tutor column. The mascot, a status line ("Explaining ...") with a shimmer, the running transcript and the "Ask gauth" field at the foot.

Page: lesson-math. Selector: `aside[class*="shared_tutorPanel__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 360 x 900 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #faf9f5 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | span.shared_text: -apple-system 14px/21px 400, #646a77 |
| Transition | none |
| Icon | 12.72 x 13.55, colour #646a77 |
| Painted layers | aside.shared_tutorPanel 360.0x900.0 bg #faf9f5; div.shared_tutorTopMask 360.0x140.0 image linear-gradient(#faf9f5 0px, #faf9f5 82%, #faf9f5 @ 0 100%); span.shared_text 276.0x42.0 image linear-gradient(100deg, #7c818c 0px, #7c818c 38%, #a9adb5 47%, #d4d6da 52%, #a9adb5 57%, #; div.tutor_inputBar 296.0x48.0 bg #ffffff border T:1px solid #e4e6eb / R:1px solid #e4e6eb / B:1px solid #e4e6eb / L:1px solid #e4e6eb r 16px |
| Ancestor paint | 1 up div.shared_lessonPage bg #faf9f5 |
| How | at rest |

Crops: `tutor-panel-default.png`.

#### tutor-status

Tutor status line.

Page: lesson-math. Selector: `[class*="shared_status__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 296 x 42 |
| Padding | 0px |
| Gap | 4px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #646a77 |
| Text node | span.shared_text: -apple-system 14px/21px 400, #646a77 |
| Transition | none |
| Icon | 12.72 x 13.55, colour #646a77 |
| Painted layers | span.shared_text 276.0x42.0 image linear-gradient(100deg, #7c818c 0px, #7c818c 38%, #a9adb5 47%, #d4d6da 52%, #a9adb5 57%, # |
| How | at rest |

Crops: `tutor-status-default.png`.

#### tutor-input

Ask gauth field. White, 1px #e4e6eb border, radius 16, 48px, Inter 16, a microphone at the right; it grows with the text. Sample text was typed and deleted; nothing was sent.

Page: lesson-math. Selector: `[class*="tutor_inputBar__"]`. States: default, hover, focused, filled.

| Property | default | hover | focused | filled |
|---|---|---|---|---|
| Size (w x h) | 296 x 48 | = | = | 296 x 71 |
| Padding | 9px 12px | = | = | 12px |
| Gap | 12px | = | = | = |
| Border | 1px solid #e4e6eb | = | = | = |
| Radius | 16px | = | = | = |
| Background | #ffffff | = | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | Inter 16px/normal 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #21252e | = | = | = |
| Transition | none | = | = | = |
| Icon | 30 x 30, colour #21252e | = | = | 10.19 x 10.19, colour #000000 |
| Painted layers | div.tutor_inputBar 296.0x48.0 bg #ffffff border T:1px solid #e4e6eb / R:1px solid #e4e6eb / B:1px solid #e4e6eb / L:1px solid #e4e6eb r 16px | = | = | div.tutor_inputBar.tutor_inputBarMultiline 296.0x71.0 bg #ffffff border T:1px solid #e4e6eb / R:1px solid #e4e6eb / B:1px solid #e4e6eb / L:1px solid #e4e6eb r 16px; button.tutor_actionButton.tutor_sendButton 30.0x30.0 bg #000000 r 50% |
| How | at rest | mouse hover | clicked into the field | typed "Why is the empty set a subset?", then deleted; nothing sent |
| Text node | - | = | = | textarea: Inter 16px/22.4px 400, #21252e |

Crops: `tutor-input-default.png`, `tutor-input-hover.png`, `tutor-input-focused.png`, `tutor-input-filled.png`.

#### progress-bar

Lesson progress. Previous and next page arrows around an 8px track (#edeade fill, #27220c value) and one 20px dot per later chapter.

Page: lesson-math. Selector: `[class*="shared_progressGroup__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 718 x 40 |
| Padding | 0px |
| Gap | 8px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Transition | none |
| Icon | 40 x 40, colour #646a77 |
| Painted layers | div.shared_progressTrack 532.0x8.0 bg #edeade r 100px; span.shared_progressValue 22.2x8.0 bg #27220c r 100px; span.shared_progressDot 20.0x8.0 bg #edeade r 100px; span.shared_progressDot 20.0x8.0 bg #edeade r 100px; span.shared_progressDot 20.0x8.0 bg #edeade r 100px |
| How | at rest |

Crops: `progress-bar-default.png`.

#### page-nav

Page arrow button.

Page: lesson-math. Selector: `button "Next lesson page"`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 40 x 40 | = | = | 37.6 x 37.6 |
| Padding | 0px | = | = | = |
| Border | none | = | = | = |
| Radius | 50% | = | = | = |
| Background | transparent | #000000 @ 0.05 | = | #000000 @ 0.05 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | Arial 13.3333px/normal 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #646a77 | = | = | = |
| Transition | background, opacity, transform 0.16s, 0.16s, 0.12s ease, ease, ease delay 0s, 0s, 0s | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 40 x 40, colour #646a77 | = | = | 37.6 x 37.6, colour #646a77 |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |
| Painted layers | - | button.shared_pageNavigationButton 40.0x40.0 bg #000000 @ 0.05 r 50% | = | button.shared_pageNavigationButton 37.6x37.6 bg #000000 @ 0.05 r 50% |
| Transform | - | = | = | matrix(0.94, 0, 0, 0.94, 0, 0) |

Crops: `page-nav-default.png`, `page-nav-hover.png`, `page-nav-focus-visible.png`, `page-nav-pressed.png`.

#### header-round-button

Header round button. Pause, speed ("1x") and chapters: 40px round ghost buttons.

Page: lesson-math. Selector: `button "Pause lesson"`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 40 x 40 | = | = | 37.6 x 37.6 |
| Padding | 0px | = | = | = |
| Border | none | = | = | = |
| Radius | 50% | = | = | = |
| Background | transparent | #000000 @ 0.05 | = | #000000 @ 0.05 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 15px/normal 600 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #21252e | = | = | = |
| Transition | background, transform 0.16s, 0.12s ease, ease delay 0s, 0s | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 26.81 x 26.81, colour #21252e | = | = | 25.2 x 25.2, colour #21252e |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |
| Painted layers | - | button 40.0x40.0 bg #000000 @ 0.05 r 50% | = | button 37.6x37.6 bg #000000 @ 0.05 r 50% |
| Transform | - | = | = | matrix(0.94, 0, 0, 0.94, 0, 0) |

Crops: `header-round-button-default.png`, `header-round-button-hover.png`, `header-round-button-focus-visible.png`, `header-round-button-pressed.png`.

#### speed-button

Speed button.

Page: lesson-math. Selector: `button "Playback speed"`. States: default, hover.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 40 x 40 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 50% | = |
| Background | transparent | #000000 @ 0.05 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 15px/normal 600 | = |
| Letter spacing | normal | = |
| Colour | #21252e | = |
| Transition | background, transform 0.16s, 0.12s ease, ease delay 0s, 0s | = |
| Cursor | pointer | = |
| How | at rest | mouse hover |
| Painted layers | - | button 40.0x40.0 bg #000000 @ 0.05 r 50% |

Crops: `speed-button-default.png`, `speed-button-hover.png`.

#### player-frame

Slide frame. The white radius-32 frame the slide plays in, title in Playfair Display.

Page: lesson-math. Selector: `[class*="shared_playerFrame__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 1048 x 820 |
| Padding | 0px |
| Border | 1px solid #000000 @ 0 |
| Radius | 32px |
| Background | #ffffff |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Transition | border-color 0.18s ease |
| Painted layers | section.shared_playerFrame.shared_playerFrameWithAction 1048.0x820.0 bg #ffffff border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 32px; div.pgc_playerStage 1046.0x738.0 bg #ffffff; hyperframes-player.pgc_playerElement 928.0x613.0 bg #ffffff |
| How | at rest |

Crops: `player-frame-default.png`.

#### chapters-panel

Chapters panel. Opened from the list button at the top right: a white panel of chapter rows, the current one tinted.

Page: lesson-math. Selector: `aside[class*="pgc_panel__"]`. States: opened.

| Property | opened |
|---|---|
| Size (w x h) | 320 x 460 |
| Padding | 12px 8px |
| Gap | 4px |
| Border | none |
| Radius | 16px |
| Background | #ffffff |
| Box shadow | #000000 @ 0.08 0px 0px 10px 0px |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | h1.pgc_outlineTitle: -apple-system 16px/normal 700, #21252e |
| Transition | none |
| Painted layers | aside.pgc_panel 320.0x460.0 bg #ffffff r 16px shadow #000000 @ 0.08 0px 0px 10px 0px; button.pgc_chapterOption.pgc_activeOption 304.0x37.0 bg #f5f5f7 r 10px |
| Ancestor paint | 1 up div.shared_lessonPage bg #faf9f5 |
| How | Open lesson chapters pressed (opens a panel) |

Crops: `chapters-panel-opened.png`.

#### chapter-option-active

Chapter row, current.

Page: lesson-math. Selector: `[class*="pgc_activeOption__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 304 x 37 |
| Padding | 8px 12px |
| Border | none |
| Radius | 10px |
| Background | #f5f5f7 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/normal 600 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | p: -apple-system 14px/normal 600, #21252e |
| Transition | none |
| Cursor | pointer |
| Painted layers | button.pgc_chapterOption.pgc_activeOption 304.0x37.0 bg #f5f5f7 r 10px |
| Ancestor paint | 2 up aside.pgc_panel bg #ffffff shadow #000000 @ 0.08 0px 0px 10px 0px |
| How | at rest |

Crops: `chapter-option-active-default.png`.

#### chapter-option

Chapter row. A 37px row. Hovered and focused only.

Page: lesson-math. Selector: `[class*="pgc_chapterOption__"]`. States: default, hover, focus-visible.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 304 x 37 | = | = |
| Padding | 8px 12px | = | = |
| Border | none | = | = |
| Radius | 10px | = | = |
| Background | transparent | #f5f5f7 | #f5f5f7 |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/normal 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #21252e | = | = |
| Text node | p: -apple-system 14px/normal 400, #21252e | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Ancestor paint | 2 up aside.pgc_panel bg #ffffff shadow #000000 @ 0.08 0px 0px 10px 0px | = | = |
| How | at rest | mouse hover | Shift+Tab, Tab |
| Painted layers | - | button.pgc_chapterOption 304.0x37.0 bg #f5f5f7 r 10px | button.pgc_chapterOption 304.0x37.0 bg #f5f5f7 r 10px |

Crops: `chapter-option-default.png`, `chapter-option-hover.png`, `chapter-option-focus-visible.png`.

#### tutor-transcript

Tutor transcript. The column under the mascot. While the tutor narrates it holds the status line with a shimmer; no transcript text appeared in 25 seconds of playback.

Page: lesson-math. Selector: `[class*="shared_tutorTranscript__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 296 x 748 |
| Padding | 73px 0px 20px 0px |
| Gap | 16px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | span.shared_text: -apple-system 14px/21px 400, #646a77 |
| Transition | none |
| Icon | 12.72 x 13.55, colour #646a77 |
| Painted layers | span.shared_text 230.7x21.0 image linear-gradient(100deg, #7c818c 0px, #7c818c 38%, #a9adb5 47%, #d4d6da 52%, #a9adb5 57%, # |
| Ancestor paint | 1 up aside.shared_tutorPanel bg #faf9f5 |
| How | at rest |

Crops: `tutor-transcript-default.png`.

### Lesson player: history

#### history-lesson-page

History lesson page. An immersive player on #faf9f5: chapter pills centred in the header, the scene in the middle, a round play button and a caption line at the foot.

Page: lesson-history. Selector: `[class*="lesson_lessonPage__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 1440 x 900 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #faf9f5 |
| Box shadow | none |
| Outline | none |
| Font | SF Pro 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | span.lesson_chapterLabel: SF Pro 14px/21px 500, #21252e |
| Transition | none |
| Icon | 40 x 40, colour #21252e |
| Painted layers | div.lesson_lessonPage.lesson_immersive 1440.0x900.0 bg #faf9f5; div.lesson_chapterPills 382.9x44.0 image linear-gradient(#f7f9fa, #fcfcfc) r 22px; button.lesson_chapterPill.lesson_chapterPillActive 122.2x32.0 bg #21252e @ 0.07 r 999px; span.lesson_chapterSeparator.lesson_chapterSeparatorUpcoming 16.0x1.0 border T:1px dashed #21252e @ 0.25; button.lesson_chapterPill.lesson_chapterPillUpcoming 50.6x32.0 bg #21252e @ 0.04 r 999px; span.lesson_chapterSeparator.lesson_chapterSeparatorUpcoming 16.0x1.0 border T:1px dashed #21252e @ 0.25 |
| How | at rest |

Crops: none.

#### chapter-pills

Chapter pills. The current chapter as a grey pill with an icon and its name; later chapters as numbered pills joined by dashed lines; a chapters list button at the end.

Page: lesson-history. Selector: `[class*="lesson_chapterPills__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 382.92 x 44 |
| Padding | 0px 6px |
| Gap | 16px |
| Border | none |
| Radius | 22px |
| Background | transparent |
| Background image | linear-gradient(#f7f9fa, #fcfcfc) |
| Box shadow | none |
| Outline | none |
| Font | SF Pro 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | span.lesson_chapterLabel: SF Pro 14px/21px 500, #21252e |
| Transition | none |
| Icon | 14 x 14, colour #21252e |
| Painted layers | div.lesson_chapterPills 382.9x44.0 image linear-gradient(#f7f9fa, #fcfcfc) r 22px; button.lesson_chapterPill.lesson_chapterPillActive 122.2x32.0 bg #21252e @ 0.07 r 999px; span.lesson_chapterSeparator.lesson_chapterSeparatorUpcoming 16.0x1.0 border T:1px dashed #21252e @ 0.25; button.lesson_chapterPill.lesson_chapterPillUpcoming 50.6x32.0 bg #21252e @ 0.04 r 999px; span.lesson_chapterSeparator.lesson_chapterSeparatorUpcoming 16.0x1.0 border T:1px dashed #21252e @ 0.25; button.lesson_chapterPill.lesson_chapterPillUpcoming 51.0x32.0 bg #21252e @ 0.04 r 999px |
| How | at rest |

Crops: `chapter-pills-default.png`.

#### chapter-pill-active

Chapter pill, current.

Page: lesson-history. Selector: `[class*="lesson_chapterPillActive__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 122.19 x 32 |
| Padding | 8px 14px |
| Gap | 4px |
| Border | none |
| Radius | 999px |
| Background | #21252e @ 0.07 |
| Box shadow | none |
| Outline | none |
| Font | SF Pro 14px/21px 500 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | span.lesson_chapterLabel: SF Pro 14px/21px 500, #21252e |
| Transition | background-color, color 0.12s, 0.12s ease, ease delay 0s, 0s |
| Cursor | pointer |
| Icon | 14 x 14, colour #21252e |
| Painted layers | button.lesson_chapterPill.lesson_chapterPillActive 122.2x32.0 bg #21252e @ 0.07 r 999px |
| How | at rest |

Crops: `chapter-pill-active-default.png`.

#### chapter-pill

Chapter pill, upcoming. An upcoming chapter: a 32px pill at 4% ink with its number at 25% ink; hover doubles both.

Page: lesson-history. Selector: `[class*="lesson_chapterPillUpcoming__"]`. States: default, hover, focus-visible.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 50.56 x 32 | = | = |
| Padding | 0px 12px | = | = |
| Gap | 3px | = | = |
| Border | none | = | = |
| Radius | 999px | = | = |
| Background | #21252e @ 0.04 | #21252e @ 0.08 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | SF Pro 16px/22.4px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #21252e @ 0.25 | #21252e @ 0.48 | = |
| Text node | span: SF Pro 16px/22.4px 500, #21252e @ 0.25 | span: SF Pro 16px/22.4px 500, #21252e @ 0.48 | = |
| Transition | background-color, color 0.12s, 0.12s ease, ease delay 0s, 0s | = | = |
| Cursor | pointer | = | = |
| Icon | 14 x 14, colour #21252e @ 0.25 | 14 x 14, colour #21252e @ 0.48 | = |
| Painted layers | button.lesson_chapterPill.lesson_chapterPillUpcoming 50.6x32.0 bg #21252e @ 0.04 r 999px | button.lesson_chapterPill.lesson_chapterPillUpcoming 50.6x32.0 bg #21252e @ 0.08 r 999px | = |
| How | at rest | mouse hover | Shift+Tab, Tab |

Crops: `chapter-pill-default.png`, `chapter-pill-hover.png`, `chapter-pill-focus-visible.png`.

#### play-button

Play button. A 60px disc, white at 82%, with a 0 8 28 navy shadow and a black play glyph. Not pressed.

Page: lesson-history. Selector: `[class*="lesson_mediaControlButton__"]`. States: default, hover, focus-visible.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 60 x 60 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 50% | = | = |
| Background | #ffffff @ 0.82 | = | = |
| Box shadow | #24304d @ 0.16 0px 8px 28px 0px | = | = |
| Backdrop filter | blur(8px) | = | = |
| Outline | none | = | = |
| Font | SF Pro 16px/normal 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #161823 | = | = |
| Transition | transform 0.12s ease | = | = |
| Cursor | pointer | = | = |
| Icon | 26 x 26, colour #161823 | = | = |
| Painted layers | button.lesson_mediaControlButton.lesson_pauseButton 60.0x60.0 bg #ffffff @ 0.82 r 50% shadow #24304d @ 0.16 0px 8px 28px 0px | = | = |
| How | at rest | mouse hover | Shift+Tab, Tab |

Crops: `play-button-default.png`, `play-button-hover.png`, `play-button-focus-visible.png`.

#### chapter-panel

Chapter panel. A 400px white panel from the right edge, radius 28 on the leading corners, a -8 0 40 shadow: each chapter with a number, a 600 name and a two-line description; the current chapter is pink #fff0f3 with red text.

Page: lesson-history. Selector: `aside[class*="lesson_chapterPanel__"]`. States: opened.

| Property | opened |
|---|---|
| Size (w x h) | 400 x 900 |
| Padding | 8px 16px |
| Border | none |
| Radius | 28px 0px 0px 28px |
| Background | #ffffff |
| Box shadow | #000000 @ 0.12 -8px 0px 40px 0px |
| Backdrop filter | blur(28px) |
| Outline | none |
| Font | SF Pro 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | h1.lesson_panelTitle: SF Pro 16px/22.4px 700, #21252e |
| Transition | opacity, transform 0.18s, 0.18s ease, ease delay 0s, 0s |
| Transform | matrix(1, 0, 0, 1, 0, 0) |
| Icon | 24 x 24, colour #21252e |
| Painted layers | aside.lesson_sidePanel.lesson_chapterPanel 400.0x900.0 bg #ffffff r 28px 0px 0px 28px shadow #000000 @ 0.12 -8px 0px 40px 0px; button.lesson_panelClose 36.0x36.0 bg #21252e @ 0.08 r 50%; button.lesson_chapterPanelItem.lesson_chapterPanelItemActive 368.0x94.0 bg #fff0f3 r 16px |
| Ancestor paint | 1 up div.lesson_lessonPage.lesson_immersive bg #faf9f5 |
| How | chapters button pressed (opens a panel) |

Crops: `chapter-panel-opened.png`.

#### chapter-panel-item

Chapter panel row.

Page: lesson-history. Selector: `[class*="lesson_chapterPanelItem__"]`. States: default, hover, focus-visible.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 368 x 94 | = | = |
| Padding | 16px 4px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 16px | = | = |
| Background | transparent | #21252e @ 0.04 | #21252e @ 0.04 |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | SF Pro 16px/normal 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #21252e | = | = |
| Text node | span.lesson_chapterPanelIndex: SF Pro 16px/normal 700, #21252e | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Ancestor paint | 3 up aside.lesson_sidePanel.lesson_chapterPanel bg #ffffff shadow #000000 @ 0.12 -8px 0px 40px 0px | = | = |
| How | at rest | mouse hover | Shift+Tab, Tab |
| Painted layers | - | button.lesson_chapterPanelItem 368.0x94.0 bg #21252e @ 0.04 r 16px | button.lesson_chapterPanelItem 368.0x94.0 bg #21252e @ 0.04 r 16px |

Crops: `chapter-panel-item-default.png`, `chapter-panel-item-hover.png`, `chapter-panel-item-focus-visible.png`.

#### caption

Caption line. The narration as one centred grey line under the scene.

Page: lesson-history. Selector: `caption`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 284.52 x 22.41 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | SF Pro 20px/22.4px 400 |
| Letter spacing | normal |
| Colour | #757c88 |
| Transition | none |
| How | at rest |

Crops: `caption-default.png`.

### Atlas

#### atlas-header

Atlas top bar. Atlas has its own 56px shell: logo and a menu button at the left, Sign in at the right.

Page: atlas. Selector: `header[class*="header_header__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 1440 x 56 |
| Padding | 0px 20px |
| Border | none |
| Radius | 0px |
| Background | #ffffff |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Text node | span: -apple-system 14px/normal 600, #ffffff |
| Transition | none |
| Icon | 24 x 24, colour #1f2556 |
| Painted layers | header.header_header 1440.0x56.0 bg #ffffff; span 70.0x30.0 bg #21252e r 10px |
| Ancestor paint | 1 up div.layout_desktopShell bg #ffffff |
| How | at rest |

Crops: `atlas-header-default.png`.

#### atlas-drawer

Atlas sidebar. A 230px white drawer: New Topic, a search field and the topic list (empty when signed out).

Page: atlas. Selector: `[class*="header_drawer__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 230 x 844 |
| Padding | 0px 12px 20px 12px |
| Border | none |
| Radius | 0px |
| Background | #ffffff |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Text node | button.header_addBtn: Rubik 12px/normal 400, #2f343d |
| Transition | none |
| Icon | 20 x 20, colour #2f343d |
| Painted layers | div.header_drawer 230.0x844.0 bg #ffffff |
| Ancestor paint | 1 up div.layout_desktopShell bg #ffffff |
| How | at rest |

Crops: `atlas-drawer-default.png`.

#### new-topic

New Topic button. A 44px row, radius 12, plus icon and Rubik 12px label.

Page: atlas. Selector: `[class*="header_addBtn__"]`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 206 x 44 | = | = | = |
| Padding | 0px 10px | = | = | = |
| Gap | 10px | = | = | = |
| Border | none | = | = | = |
| Radius | 12px | = | = | = |
| Background | transparent | #f7f7f9 | = | #f7f7f9 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | Rubik 12px/normal 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #2f343d | = | = | = |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 20 x 20, colour #2f343d | = | = | = |
| Ancestor paint | 1 up div.header_drawer bg #ffffff | = | = | = |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |
| Painted layers | - | button.header_addBtn 206.0x44.0 bg #f7f7f9 r 12px | = | button.header_addBtn 206.0x44.0 bg #f7f7f9 r 12px |

Crops: `new-topic-default.png`, `new-topic-hover.png`, `new-topic-focus-visible.png`, `new-topic-pressed.png`.

#### atlas-search

Topic search field.

Page: atlas. Selector: `[class*="header_searchBox__"]`. States: default, hover, focused, filled.

| Property | default | hover | focused | filled |
|---|---|---|---|---|
| Size (w x h) | 206 x 44 | = | = | = |
| Padding | 0px 10px 0px 40px | = | = | = |
| Border | none | = | = | = |
| Radius | 12px | = | = | = |
| Background | transparent | #f7f7f9 | #f7f7f9 | #f7f7f9 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 16px/normal 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #000000 | = | = | = |
| Transition | none | = | = | = |
| Icon | 20 x 20, colour #000000 | = | = | = |
| Ancestor paint | 1 up div.header_drawer bg #ffffff | = | = | = |
| How | at rest | mouse hover | clicked into the field | typed "Moon", then deleted; nothing sent |
| Painted layers | - | div.header_searchBox 206.0x44.0 bg #f7f7f9 r 12px | div.header_searchBox 206.0x44.0 bg #f7f7f9 r 12px | div.header_searchBox 206.0x44.0 bg #f7f7f9 r 12px |

Crops: `atlas-search-default.png`, `atlas-search-hover.png`, `atlas-search-focused.png`, `atlas-search-filled.png`.

#### atlas-title

Atlas title. "Turn any topic into a visual story" in Libre Baskerville 40/48 700, the first letter filled with a red gradient.

Page: atlas. Selector: `[class*="atlas-landing_start-project-title__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 682.92 x 48 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #21252e |
| Background image | url(data:…) |
| Box shadow | none |
| Outline | none |
| Font | Libre Baskerville 40px/48px 700 |
| Letter spacing | -0.4px |
| Colour | #000000 |
| Transition | none |
| Painted layers | h1.atlas-landing_start-project-title 682.9x48.0 bg #21252e image url(data:…) |
| How | at rest |

Crops: `atlas-title-default.png`.

#### atlas-composer

Atlas prompt box. A 920 x 148 white box, 1px #e4e6eb border, radius 20, a peach glow (0 6 20 rgba(255,215,199,.4)) that deepens on focus, a Search toggle pill and a round send button. Sample text was typed and deleted; nothing was sent.

Page: atlas. Selector: `[class*="atlas-landing_composer__"]`. States: default, hover, focused, filled.

| Property | default | hover | focused | filled |
|---|---|---|---|---|
| Size (w x h) | 920 x 148 | = | = | = |
| Padding | 12px 12px 10px 12px | = | = | = |
| Gap | 6px | = | = | = |
| Border | 1px solid #e4e6eb | = | 1px solid #d9dce3 | 1px solid #d9dce3 |
| Radius | 20px | = | = | = |
| Background | #ffffff | = | = | = |
| Box shadow | #ffd7c7 @ 0.4 0px 6px 20px 0px | = | #ffd7c7 @ 0.52 0px 8px 24px 0px | #ffd7c7 @ 0.52 0px 8px 24px 0px |
| Outline | none | = | = | = |
| Font | SF Pro 16px/normal 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #000000 | = | = | = |
| Text node | span.atlas-landing_placeholder-text: SF Pro 15px/22px 400, #9ca2ac | = | = | textarea.ant-input.css-ypkju9: -apple-system 15px/23.5714px 400, #21252e |
| Transition | border-color, box-shadow, background 0.2s, 0.2s, 0.2s ease, ease, ease delay 0s, 0s, 0s | = | = | = |
| Icon | 13 x 13, colour #ffffff | = | = | = |
| Painted layers | div.atlas-landing_composer 920.0x148.0 bg #ffffff border T:1px solid #e4e6eb / R:1px solid #e4e6eb / B:1px solid #e4e6eb / L:1px solid #e4e6eb r 20px shadow #ffd7c7 @ 0.4 0px 6px 20px 0px; button.atlas-landing_search-toggle.atlas-landing_search-toggle-active 85.2x30.0 bg #171410 border T:1px solid #171410 / R:1px solid #171410 / B:1px solid #171410 / L:1px solid #171410 r 20px shadow #111410 @ 0.16 0px 5px 12px 0px; button.atlas-landing_send-button 36.0x36.0 bg #eef0f3 r 50% | = | div.atlas-landing_composer 920.0x148.0 bg #ffffff border T:1px solid #d9dce3 / R:1px solid #d9dce3 / B:1px solid #d9dce3 / L:1px solid #d9dce3 r 20px shadow #ffd7c7 @ 0.52 0px 8px 24px 0px; button.atlas-landing_search-toggle.atlas-landing_search-toggle-active 85.2x30.0 bg #171410 border T:1px solid #171410 / R:1px solid #171410 / B:1px solid #171410 / L:1px solid #171410 r 20px shadow #111410 @ 0.16 0px 5px 12px 0px; button.atlas-landing_send-button 36.0x36.0 bg #eef0f3 r 50% | div.atlas-landing_composer 920.0x148.0 bg #ffffff border T:1px solid #d9dce3 / R:1px solid #d9dce3 / B:1px solid #d9dce3 / L:1px solid #d9dce3 r 20px shadow #ffd7c7 @ 0.52 0px 8px 24px 0px; button.atlas-landing_search-toggle.atlas-landing_search-toggle-active 85.2x30.0 bg #171410 border T:1px solid #171410 / R:1px solid #171410 / B:1px solid #171410 / L:1px solid #171410 r 20px shadow #111410 @ 0.16 0px 5px 12px 0px; button.atlas-landing_send-button.atlas-landing_send-button-active 36.0x36.0 bg #171410 r 50% |
| How | at rest | mouse hover | clicked into the field | typed "The water cycle", then deleted; nothing sent |

Crops: `atlas-composer-default.png`, `atlas-composer-hover.png`, `atlas-composer-focused.png`, `atlas-composer-filled.png`.

#### search-toggle

Search toggle pill. The web-search switch, on: a near-black #171410 pill, radius 20, with a 0 5 12 shadow; hover lightens it to #2a2d34. Not toggled.

Page: atlas. Selector: `[class*="atlas-landing_search-toggle__"]`. States: default, hover, focus-visible.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 85.17 x 30 | = | = |
| Padding | 0px 12px | = | = |
| Gap | 5px | = | = |
| Border | 1px solid #171410 | 1px solid #2a2d34 | = |
| Radius | 20px | = | = |
| Background | #171410 | #2a2d34 | = |
| Box shadow | #111410 @ 0.16 0px 5px 12px 0px | #111410 @ 0.18 0px 6px 14px 0px | = |
| Outline | none | = | 2px solid #171410 @ 0.18 offset 2px |
| Font | -apple-system 12px/12px 600 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Transition | background, border-color, color, box-shadow, transform 0.15s, 0.15s, 0.15s, 0.15s, 0.12s ease, ease, ease, ease, ease delay 0s, 0s, 0s, 0s, 0s | = | = |
| Cursor | pointer | = | = |
| Icon | 13 x 13, colour #ffffff | = | = |
| Painted layers | button.atlas-landing_search-toggle.atlas-landing_search-toggle-active 85.2x30.0 bg #171410 border T:1px solid #171410 / R:1px solid #171410 / B:1px solid #171410 / L:1px solid #171410 r 20px shadow #111410 @ 0.16 0px 5px 12px 0px | button.atlas-landing_search-toggle.atlas-landing_search-toggle-active 85.2x30.0 bg #2a2d34 border T:1px solid #2a2d34 / R:1px solid #2a2d34 / B:1px solid #2a2d34 / L:1px solid #2a2d34 r 20px shadow #111410 @ 0.18 0px 6px 14px 0px | button.atlas-landing_search-toggle.atlas-landing_search-toggle-active 85.2x30.0 bg #171410 border T:1px solid #171410 / R:1px solid #171410 / B:1px solid #171410 / L:1px solid #171410 r 20px shadow #111410 @ 0.16 0px 5px 12px 0px outline 2px solid #171410 @ 0.18 offset 2px |
| Ancestor paint | 3 up div.atlas-landing_composer bg #ffffff shadow #ffd7c7 @ 0.4 0px 6px 20px 0px | = | 3 up div.atlas-landing_composer bg #ffffff shadow #ffd7c7 @ 0.52 0px 8px 24px 0px |
| How | at rest | mouse hover | Shift+Tab, Tab |

Crops: `search-toggle-default.png`, `search-toggle-hover.png`, `search-toggle-focus-visible.png`.

#### send-button

Send button. Grey #eef0f3 disc while the box is empty. Never pressed.

Page: atlas. Selector: `[class*="atlas-landing_send-button__"]`. States: default, hover.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 36 x 36 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 50% | = |
| Background | #eef0f3 | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | Arial 13.3333px/normal 400 | = |
| Letter spacing | normal | = |
| Colour | #9ca2ac | = |
| Transition | background, color, transform 0.18s, 0.18s, 0.18s ease, ease, ease delay 0s, 0s, 0s | = |
| Cursor | default | = |
| Icon | 18 x 18, colour #9ca2ac | = |
| Painted layers | button.atlas-landing_send-button 36.0x36.0 bg #eef0f3 r 50% | = |
| Ancestor paint | 2 up div.atlas-landing_composer bg #ffffff shadow #ffd7c7 @ 0.4 0px 6px 20px 0px | = |
| How | at rest | mouse hover |

Crops: `send-button-default.png`, `send-button-hover.png`.

#### recommendation-chip

Recommendation chip. A white chip, 1px #dcdcdc border, radius 10, SF Pro 13/19.5 black; hover lifts it 1px onto #f5f5f7 with a soft shadow. Pressing one would start a story, so it was only hovered, focused and forced.

Page: atlas. Selector: `[class*="atlas-landing_recommendation-chip__"]`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 170.5 x 41.5 | = | = | = |
| Padding | 10px 16px | = | = | = |
| Border | 1px solid #dcdcdc | 1px solid #cfcfcf | = | 1px solid #cfcfcf |
| Radius | 10px | = | = | = |
| Background | #ffffff | #f5f5f7 | = | #f5f5f7 |
| Box shadow | none | #000000 @ 0.04 0px 4px 14px 0px | = | #000000 @ 0.04 0px 4px 14px 0px |
| Outline | none | = | = | = |
| Font | SF Pro 13px/19.5px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #000000 | = | = | = |
| Transition | box-shadow, transform, border-color 0.18s, 0.18s, 0.18s ease, ease, ease delay 0s, 0s, 0s | = | = | = |
| Cursor | pointer | = | = | = |
| Painted layers | button.atlas-landing_recommendation-chip 170.5x41.5 bg #ffffff border T:1px solid #dcdcdc / R:1px solid #dcdcdc / B:1px solid #dcdcdc / L:1px solid #dcdcdc r 10px | button.atlas-landing_recommendation-chip 170.5x41.5 bg #f5f5f7 border T:1px solid #cfcfcf / R:1px solid #cfcfcf / B:1px solid #cfcfcf / L:1px solid #cfcfcf r 10px shadow #000000 @ 0.04 0px 4px 14px 0px | = | button.atlas-landing_recommendation-chip 170.5x41.5 bg #f5f5f7 border T:1px solid #cfcfcf / R:1px solid #cfcfcf / B:1px solid #cfcfcf / L:1px solid #cfcfcf r 10px shadow #000000 @ 0.04 0px 4px 14px 0px |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |
| Transform | - | matrix(1, 0, 0, 1, 0, -1) | = | matrix(1, 0, 0, 1, 0, -1) |

Crops: `recommendation-chip-default.png`, `recommendation-chip-hover.png`, `recommendation-chip-focus-visible.png`, `recommendation-chip-pressed.png`.

#### stories-title

Popular Stories heading.

Page: atlas. Selector: `[class*="user-cases_title__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 1080 x 24 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | Libre Baskerville 20px/24px 700 |
| Letter spacing | normal |
| Colour | #000000 |
| Transition | none |
| How | at rest |

Crops: `stories-title-default.png`.

#### story-card

Story card. A 339px white card, 1px rgba(0,0,0,.08) border, radius 16, a 0 6 18 shadow at 4%: a radius-12 thumbnail (video or image) and a 16/24 600 title. Hover lifts it 4px with a 0 18 42 shadow at 10%.

Page: atlas. Selector: `[class*="user-cases_card__"]`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 338.67 x 313.5 | = | = | = |
| Padding | 14px 14px 18px 14px | = | = | = |
| Gap | 14px | = | = | = |
| Border | 1px solid #000000 @ 0.08 | 1px solid #000000 @ 0.12 | = | 1px solid #000000 @ 0.12 |
| Radius | 16px | = | = | = |
| Background | #ffffff | = | = | = |
| Box shadow | #000000 @ 0.04 0px 6px 18px 0px | #000000 @ 0.1 0px 18px 42px 0px | = | #000000 @ 0.1 0px 18px 42px 0px |
| Outline | none | = | = | = |
| Font | Arial 13.3333px/normal 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #000000 | = | = | = |
| Text node | span.user-cases_videoBadge.user-cases_videoOverlayHidden: Arial 12px/24px 600, #ffffff | = | span.user-cases_videoBadge: Arial 12px/24px 600, #ffffff | span.user-cases_videoBadge: Arial 12px/24px 600, #ffffff |
| Transition | transform, box-shadow, border-color 0.25s, 0.25s, 0.25s ease, ease, ease delay 0s, 0s, 0s | = | = | = |
| Cursor | pointer | = | = | = |
| Painted layers | button.user-cases_card 338.7x313.5 bg #ffffff border T:1px solid #000000 @ 0.08 / R:1px solid #000000 @ 0.08 / B:1px solid #000000 @ 0.08 / L:1px solid #000000 @ 0.08 r 16px shadow #000000 @ 0.04 0px 6px 18px 0px; span.user-cases_thumbnail 308.7x231.5 bg #f7f7f7 r 12px; span.user-cases_videoBadge.user-cases_videoOverlayHidden 48.5x24.0 bg #000000 @ 0.42 r 8px; span.user-cases_playIcon.user-cases_videoOverlayHidden 48.0x48.0 bg #ffffff @ 0.66 r 50% shadow #0f172a @ 0.22 0px 12px 28px 0px, #ffffff @ 0.24 0px 1px 0px 0px inset; span::before.user-cases_playIcon.user-cases_videoOverlayHidden 17pxx17px bg #ffffff | button.user-cases_card 338.7x313.5 bg #ffffff border T:1px solid #000000 @ 0.12 / R:1px solid #000000 @ 0.12 / B:1px solid #000000 @ 0.12 / L:1px solid #000000 @ 0.12 r 16px shadow #000000 @ 0.1 0px 18px 42px 0px; span.user-cases_thumbnail 308.7x231.5 bg #f7f7f7 r 12px; span.user-cases_videoBadge.user-cases_videoOverlayHidden 48.5x24.0 bg #000000 @ 0.42 r 8px; span.user-cases_playIcon.user-cases_videoOverlayHidden 48.0x48.0 bg #ffffff @ 0.66 r 50% shadow #0f172a @ 0.22 0px 12px 28px 0px, #ffffff @ 0.24 0px 1px 0px 0px inset; span::before.user-cases_playIcon.user-cases_videoOverlayHidden 17pxx17px bg #ffffff | button.user-cases_card 338.7x313.5 bg #ffffff border T:1px solid #000000 @ 0.08 / R:1px solid #000000 @ 0.08 / B:1px solid #000000 @ 0.08 / L:1px solid #000000 @ 0.08 r 16px shadow #000000 @ 0.04 0px 6px 18px 0px; span.user-cases_thumbnail 308.7x231.5 bg #f7f7f7 r 12px; span.user-cases_videoBadge 48.5x24.0 bg #000000 @ 0.42 r 8px; span.user-cases_playIcon 48.0x48.0 bg #ffffff @ 0.66 r 50% shadow #0f172a @ 0.22 0px 12px 28px 0px, #ffffff @ 0.24 0px 1px 0px 0px inset; span::before.user-cases_playIcon 17pxx17px bg #ffffff | button.user-cases_card 338.7x313.5 bg #ffffff border T:1px solid #000000 @ 0.12 / R:1px solid #000000 @ 0.12 / B:1px solid #000000 @ 0.12 / L:1px solid #000000 @ 0.12 r 16px shadow #000000 @ 0.1 0px 18px 42px 0px; span.user-cases_thumbnail 308.7x231.5 bg #f7f7f7 r 12px; span.user-cases_videoBadge 48.5x24.0 bg #000000 @ 0.42 r 8px; span.user-cases_playIcon 48.0x48.0 bg #ffffff @ 0.66 r 50% shadow #0f172a @ 0.22 0px 12px 28px 0px, #ffffff @ 0.24 0px 1px 0px 0px inset; span::before.user-cases_playIcon 17pxx17px bg #ffffff |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |
| Transform | - | matrix(1, 0, 0, 1, 0, -4) | = | matrix(1, 0, 0, 1, 0, -4) |

Crops: `story-card-default.png`, `story-card-hover.png`, `story-card-focus-visible.png`, `story-card-pressed.png`.

#### video-badge

Video badge. A dark translucent radius-8 label over the thumbnail.

Page: atlas. Selector: `[class*="user-cases_videoBadge__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 48.47 x 24 |
| Padding | 0px 8px |
| Border | none |
| Radius | 8px |
| Background | #000000 @ 0.42 |
| Box shadow | none |
| Backdrop filter | blur(8px) |
| Outline | none |
| Font | Arial 12px/24px 600 |
| Letter spacing | normal |
| Colour | #ffffff |
| Transition | opacity 0.16s ease |
| Cursor | pointer |
| Painted layers | span.user-cases_videoBadge 48.5x24.0 bg #000000 @ 0.42 r 8px |
| Ancestor paint | 1 up span.user-cases_thumbnail bg #f7f7f7; 2 up button.user-cases_card bg #ffffff shadow #000000 @ 0.04 0px 6px 18px 0px |
| How | at rest |

Crops: `video-badge-default.png`.

#### new-badge

New badge. A red #ff013e radius-8 label.

Page: atlas. Selector: `[class*="user-cases_newBadge__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 40.8 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 8px |
| Background | #ff013e |
| Box shadow | none |
| Outline | none |
| Font | Rubik 15px/18px 600 |
| Letter spacing | 0.45px |
| Colour | #ffffff |
| Transition | none |
| Transform | matrix(0.8, 0, 0, 0.8, 0, 0) |
| Cursor | pointer |
| Painted layers | span.user-cases_newBadge 40.8x20.0 bg #ff013e r 8px |
| Ancestor paint | 1 up span.user-cases_thumbnail bg #f7f7f7; 2 up button.user-cases_card bg #ffffff shadow #000000 @ 0.04 0px 6px 18px 0px |
| How | at rest |

Crops: `new-badge-default.png`.

#### play-icon

Play disc. A 48px white-alpha disc over a video thumbnail.

Page: atlas. Selector: `[class*="user-cases_playIcon__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 48 x 48 |
| Padding | 0px |
| Border | none |
| Radius | 50% |
| Background | #ffffff @ 0.66 |
| Box shadow | #0f172a @ 0.22 0px 12px 28px 0px, #ffffff @ 0.24 0px 1px 0px 0px inset |
| Backdrop filter | blur(10px) |
| Outline | none |
| Font | Arial 13.3333px/normal 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Transition | opacity, transform 0.16s, 0.16s ease, ease delay 0s, 0s |
| Transform | matrix(1, 0, 0, 1, -24, -24) |
| Cursor | pointer |
| ::before | 17px x 17px, absolute, bg #ffffff, radius 0px |
| Painted layers | span.user-cases_playIcon 48.0x48.0 bg #ffffff @ 0.66 r 50% shadow #0f172a @ 0.22 0px 12px 28px 0px, #ffffff @ 0.24 0px 1px 0px 0px inset; span::before.user-cases_playIcon 17pxx17px bg #ffffff |
| Ancestor paint | 1 up span.user-cases_thumbnail bg #f7f7f7; 2 up button.user-cases_card bg #ffffff shadow #000000 @ 0.04 0px 6px 18px 0px |
| How | at rest |

Crops: `play-icon-default.png`.

#### story-stage

Story canvas. The story image in a radius-20 frame, hotspot rings over places in it, a "Content generated by AI" note under it.

Page: story. Selector: `[class*="atlas_visualFrame__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 1034 x 581.63 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Text node | div.canvas_aiGenerated: Libre Baskerville 12px/normal 400, #9ca2ac @ 0.5 |
| Transition | none |
| Icon | 18 x 18, colour #000000 |
| Painted layers | span.canvas_tapMark 18.0x18.0 bg #795cff @ 0.14 border T:2px solid #ffffff @ 0.94 / R:2px solid #ffffff @ 0.94 / B:2px solid #ffffff @ 0.94 / L:2px solid #ffffff @ 0.94 r 999px shadow #7a5cff @ 0.16 0px 0px 0px 5px, #5029ff @ 0.2 0px 8px 18px 0px; span.canvas_tapMark 18.0x18.0 bg #795cff @ 0.14 border T:2px solid #ffffff @ 0.94 / R:2px solid #ffffff @ 0.94 / B:2px solid #ffffff @ 0.94 / L:2px solid #ffffff @ 0.94 r 999px shadow #7a5cff @ 0.16 0px 0px 0px 5px, #5029ff @ 0.2 0px 8px 18px 0px; span.canvas_tapMark 18.0x18.0 bg #795cff @ 0.14 border T:2px solid #ffffff @ 0.94 / R:2px solid #ffffff @ 0.94 / B:2px solid #ffffff @ 0.94 / L:2px solid #ffffff @ 0.94 r 999px shadow #7a5cff @ 0.16 0px 0px 0px 5px, #5029ff @ 0.2 0px 8px 18px 0px; span.canvas_tapMark 18.0x18.0 bg #795cff @ 0.14 border T:2px solid #ffffff @ 0.94 / R:2px solid #ffffff @ 0.94 / B:2px solid #ffffff @ 0.94 / L:2px solid #ffffff @ 0.94 r 999px shadow #7a5cff @ 0.16 0px 0px 0px 5px, #5029ff @ 0.2 0px 8px 18px 0px; div.canvas_modeMenu 70.0x132.0 bg #ffffff border T:1px solid #eeeeee / R:1px solid #eeeeee / B:1px solid #eeeeee / L:1px solid #eeeeee r 16px shadow #000000 @ 0.06 0px 4px 20px 0px; button::before.canvas_modeButton.canvas_modeButtonActive 3pxx36px bg #000000 r 0px 4px 4px 0px |
| How | at rest |

Crops: `story-stage-default.png`.

#### share-button

Share button. The dark #21252e radius-8 button, Rubik 12/20 600. It shows no hover, focus or pressed change. Measured, never pressed.

Page: story. Selector: `[class*="atlas-share-button_button__"]`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 70 x 30 | = | = | = |
| Padding | 0px 6px | = | = | = |
| Gap | 6px | = | = | = |
| Border | 1px solid #21252e | = | = | = |
| Radius | 8px | = | = | = |
| Background | #21252e | = | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | Arial 13.3333px/normal 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #ffffff | = | = | = |
| Text node | span.atlas-share-button_pcButtonText: Rubik 12px/20px 600, #ffffff | = | = | = |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Painted layers | button.atlas-share-button_button.atlas-share-button_pc 70.0x30.0 bg #21252e border T:1px solid #21252e / R:1px solid #21252e / B:1px solid #21252e / L:1px solid #21252e r 8px | = | = | = |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |

Crops: `share-button-default.png`, `share-button-hover.png`, `share-button-focus-visible.png`, `share-button-pressed.png`.

#### generate-video-button

Generate Video button. A white button, 1px #dfe3ea border, radius 8, Rubik 12/20 600, a red guide dot; hover greys it to #f9fafb. Never pressed.

Page: story. Selector: `button "Generate Video"`. States: default, hover, focus-visible.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 141.83 x 34 | = | = |
| Padding | 0px 14px | = | = |
| Gap | 8px | = | = |
| Border | 1px solid #dfe3ea | 1px solid #cbd5e1 | = |
| Radius | 8px | = | = |
| Background | #ffffff | #f9fafb | = |
| Box shadow | #101828 @ 0.02 0px 1px 2px 0px | = | = |
| Outline | none | = | = |
| Font | Rubik 12px/20px 600 | = | = |
| Letter spacing | normal | = | = |
| Colour | #374151 | #111827 | = |
| Transition | border-color, background-color, color, box-shadow 0.18s, 0.18s, 0.18s, 0.18s ease, ease, ease, ease delay 0s, 0s, 0s, 0s | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #374151 | 16 x 16, colour #111827 | = |
| Painted layers | button.header_headerVideoButton 141.8x34.0 bg #ffffff border T:1px solid #dfe3ea / R:1px solid #dfe3ea / B:1px solid #dfe3ea / L:1px solid #dfe3ea r 8px shadow #101828 @ 0.02 0px 1px 2px 0px; span.header_headerGuideDot 9.0x9.0 bg #ff3b30 border T:2px solid #ffffff / R:2px solid #ffffff / B:2px solid #ffffff / L:2px solid #ffffff r 999px shadow #000000 @ 0 0px 0px 0px 4.27426px | button.header_headerVideoButton 141.8x34.0 bg #f9fafb border T:1px solid #cbd5e1 / R:1px solid #cbd5e1 / B:1px solid #cbd5e1 / L:1px solid #cbd5e1 r 8px shadow #101828 @ 0.02 0px 1px 2px 0px; span.header_headerGuideDot 9.0x9.0 bg #ff3b30 border T:2px solid #ffffff / R:2px solid #ffffff / B:2px solid #ffffff / L:2px solid #ffffff r 999px shadow #ff3b30 @ 0.196 0px 0px 0px 3.96556px | button.header_headerVideoButton 141.8x34.0 bg #ffffff border T:1px solid #dfe3ea / R:1px solid #dfe3ea / B:1px solid #dfe3ea / L:1px solid #dfe3ea r 8px shadow #101828 @ 0.02 0px 1px 2px 0px; span.header_headerGuideDot 9.0x9.0 bg #ff3b30 border T:2px solid #ffffff / R:2px solid #ffffff / B:2px solid #ffffff / L:2px solid #ffffff r 999px shadow #ff3b30 @ 0 0px 0px 0px 6.99395px |
| How | at rest | mouse hover | Shift+Tab, Tab |

Crops: `generate-video-button-default.png`, `generate-video-button-hover.png`, `generate-video-button-focus-visible.png`.

#### video-settings

Video Settings popover. Source image tiles, a language select and a dark Generate Video button with an estimate line, in a white radius-16 popover with a 0 10 40 shadow that springs in (cubic-bezier(0.34, 1.56, 0.64, 1)). Nothing in it was pressed.

Page: story. Selector: `[class*="video_header__"] parent`. States: opened.

| Property | opened |
|---|---|
| Size (w x h) | 314.88 x 365.04 |
| Padding | 0px |
| Border | 1px solid #eeeeee |
| Radius | 16px |
| Background | #ffffff |
| Box shadow | #000000 @ 0.12 0px 10px 40px 0px |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Text node | h3: Rubik 12px/18px 700, #111827 |
| Transition | opacity, transform 0.25s, 0.3s ease, cubic-bezier(0.34, 1.56, 0.64, 1) delay 0s, 0s |
| Transform | matrix(0.96, 0, 0, 0.96, 0, -8) |
| Opacity | 0 |
| Icon | 19.2 x 19.2, colour #000000 |
| ::after | 12px x 12px, absolute, bg #ffffff, radius 0px |
| Painted layers | section.video_popover 314.9x365.0 bg #ffffff border T:1px solid #eeeeee / R:1px solid #eeeeee / B:1px solid #eeeeee / L:1px solid #eeeeee r 16px shadow #000000 @ 0.12 0px 10px 40px 0px; section::after.video_popover 12pxx12px bg #ffffff border T:1px solid #eeeeee / L:1px solid #eeeeee; section.video_settingBlock 289.9x105.8 bg #f9fafb r 12px; button.video_imageTile.video_imageTileSelected 96.0x54.0 bg #e5e7eb r 8px shadow #000000 @ 0.15 0px 1px 4px 0px; span.video_imageCheck 13.4x13.4 bg #000000 @ 0.78 r 999px; button.video_imageTile.video_imageTileSelected 96.0x54.0 bg #e5e7eb r 8px shadow #000000 @ 0.15 0px 1px 4px 0px |
| How | hovered Generate Video |

Crops: `video-settings-opened.png`.

#### view-rail

View and Details rail. A floating white radius-16 rail at the right edge of the canvas, 1px #eeeeee border, with View (current, a 3px black bar) and Details.

Page: story. Selector: `View / Details rail`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 70 x 132 |
| Padding | 6px |
| Gap | 6px |
| Border | 1px solid #eeeeee |
| Radius | 16px |
| Background | #ffffff |
| Box shadow | #000000 @ 0.06 0px 4px 20px 0px |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Text node | button.canvas_modeButton.canvas_modeButtonActive: Rubik 12px/13.2px 700, #000000 |
| Transition | none |
| Transform | matrix(1, 0, 0, 1, 0, -66) |
| Icon | 18 x 18, colour #000000 |
| Painted layers | div.canvas_modeMenu 70.0x132.0 bg #ffffff border T:1px solid #eeeeee / R:1px solid #eeeeee / B:1px solid #eeeeee / L:1px solid #eeeeee r 16px shadow #000000 @ 0.06 0px 4px 20px 0px; button::before.canvas_modeButton.canvas_modeButtonActive 3pxx36px bg #000000 r 0px 4px 4px 0px |
| How | at rest |

Crops: `view-rail-default.png`.

#### rail-item

Rail item.

Page: story. Selector: `button "Details"`. States: default, hover, focus-visible.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 56 x 56 | = | = |
| Padding | 0px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 12px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | Rubik 12px/13.2px 700 | = | = |
| Letter spacing | normal | = | = |
| Colour | #9ca3af | #4b5563 | = |
| Transition | background-color, color 0.18s, 0.18s ease, ease delay 0s, 0s | = | = |
| Cursor | pointer | = | = |
| Icon | 18 x 18, colour #9ca3af, fill #000000 | 18 x 18, colour #4b5563, fill #000000 | = |
| Ancestor paint | 1 up div.canvas_modeMenu bg #ffffff shadow #000000 @ 0.06 0px 4px 20px 0px | = | = |
| How | at rest | mouse hover | Shift+Tab, Tab |

Crops: `rail-item-default.png`, `rail-item-hover.png`, `rail-item-focus-visible.png`.

#### story-strip-item

Story strip item. The current story under the canvas: thumbnail and a 600 title on a #f5f6f9 radius-12 tile.

Page: story. Selector: `story strip`. States: default, hover.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 289 x 62 | = |
| Padding | 8px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 11px | = |
| Background | #f5f7fa | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | Arial 13.3333px/normal 400 | = |
| Letter spacing | normal | = |
| Colour | #000000 | = |
| Text node | span.thumbnails_activeLabel: Rubik 12px/15.6px 510, #1f2021, ls -0.12px | = |
| Transition | none | = |
| Cursor | default | = |
| Painted layers | button.thumbnails_activeTile 289.0x62.0 bg #f5f7fa r 11px; span.thumbnails_thumbImg 82.0x46.0 bg #d9d9d9 @ 0.2 r 4px | = |
| How | at rest | mouse hover |

Crops: `story-strip-item-default.png`, `story-strip-item-hover.png`.

### Insights

#### breadcrumb

Breadcrumb.

Page: news. Selector: `[class*="content-list_breadcrumb__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 720 x 82 |
| Padding | 35px 0px 29px 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/18px 400 |
| Letter spacing | normal |
| Colour | #9ca2ac |
| Text node | a.content-list_breadcrumbText.content-list_breadcrumbLink: -apple-system 12px/18px 400, #9ca2ac |
| Transition | none |
| Icon | 12 x 13, colour #9ca2ac |
| How | at rest |

Crops: `breadcrumb-default.png`.

#### pill-tab-active

Pill tab, current. News: pink #fff0f3 fill, 1px #ffe5ec border, red #f00039 label, radius 100. Keyboard focus draws a 2px red ring 2px out.

Page: news. Selector: `[class*="media-center_tab-active__"]`. States: default, focus-visible.

| Property | default | focus-visible |
|---|---|---|
| Size (w x h) | 70.52 x 37 | = |
| Padding | 0px 16px | = |
| Border | 1px solid #ffe5ec | = |
| Radius | 100px | = |
| Background | #fff0f3 | = |
| Box shadow | none | = |
| Outline | none | 2px solid #f0023a offset 2px |
| Font | -apple-system 14px/21px 500 | = |
| Letter spacing | normal | = |
| Colour | #f00039 | = |
| Transition | none | outline-offset, outline 0s, 0s ease, ease delay 0s, 0s |
| Cursor | pointer | = |
| Painted layers | a.media-center_tab.media-center_tab-active 70.5x37.0 bg #fff0f3 border T:1px solid #ffe5ec / R:1px solid #ffe5ec / B:1px solid #ffe5ec / L:1px solid #ffe5ec r 100px | a.media-center_tab.media-center_tab-active 70.5x37.0 bg #fff0f3 border T:1px solid #ffe5ec / R:1px solid #ffe5ec / B:1px solid #ffe5ec / L:1px solid #ffe5ec r 100px outline 2px solid #f0023a offset 2px |
| How | at rest | Shift+Tab, Tab |

Crops: `pill-tab-active-default.png`, `pill-tab-active-focus-visible.png`.

#### pill-tab

Pill tab. White, 1px #e4e6eb border, radius 100, 14/21 500; pressed fills it #f5f5f7.

Page: news. Selector: `[class*="media-center_tab__"]`. States: default, hover, focus-visible, pressed.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 63.63 x 37 | = | = | = |
| Padding | 0px 16px | = | = | = |
| Border | 1px solid #e4e6eb | = | = | = |
| Radius | 100px | = | = | = |
| Background | #ffffff | = | = | #f5f5f7 |
| Box shadow | none | = | = | = |
| Outline | none | = | 2px solid #f0023a offset 2px | = |
| Font | -apple-system 14px/21px 500 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #21252e | = | = | = |
| Transition | none | = | outline-offset, outline 0s, 0s ease, ease delay 0s, 0s | = |
| Cursor | pointer | = | = | = |
| Painted layers | a.media-center_tab 63.6x37.0 bg #ffffff border T:1px solid #e4e6eb / R:1px solid #e4e6eb / B:1px solid #e4e6eb / L:1px solid #e4e6eb r 100px | = | a.media-center_tab 63.6x37.0 bg #ffffff border T:1px solid #e4e6eb / R:1px solid #e4e6eb / B:1px solid #e4e6eb / L:1px solid #e4e6eb r 100px outline 2px solid #f0023a offset 2px | a.media-center_tab 63.6x37.0 bg #f5f5f7 border T:1px solid #e4e6eb / R:1px solid #e4e6eb / B:1px solid #e4e6eb / L:1px solid #e4e6eb r 100px |
| How | at rest | mouse hover | Shift+Tab, Tab | CDP forcePseudoState :active:hover |
| Opacity | - | = | = | 0.8 |

Crops: `pill-tab-default.png`, `pill-tab-hover.png`, `pill-tab-focus-visible.png`, `pill-tab-pressed.png`.

#### featured-article

Featured article. A 26/36 700 title and a 16/24 description beside a 333 x 200 radius-12 image.

Page: news. Selector: `[class*="media-center_featured-card__"]`. States: default, hover, focus-visible.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 720 x 200 | = | = |
| Padding | 0px | = | = |
| Gap | 16px | = | = |
| Border | none | = | = |
| Radius | 0px | = | 12px |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | 2px solid #f00039 offset 4px |
| Font | -apple-system 13px/normal 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #21252e | = | = |
| Text node | h1.media-center_featured-title: -apple-system 26px/36px 700, #21252e | = | = |
| Transition | none | = | outline-offset, outline 0s, 0s ease, ease delay 0s, 0s |
| Cursor | pointer | = | = |
| Painted layers | span::after.media-center_featured-image-wrap 333pxx200px bg #000000 @ 0.05 | = | a.media-center_featured-card 720.0x200.0 r 12px outline 2px solid #f00039 offset 4px; span::after.media-center_featured-image-wrap 333pxx200px bg #000000 @ 0.05 |
| How | at rest | mouse hover | Shift+Tab, Tab |

Crops: `featured-article-default.png`, `featured-article-hover.png`, `featured-article-focus-visible.png`.

#### article-row

Article row. A 171 x 96 radius-8 image beside an 18px title and a two-line grey summary, rows split by a 1px rule.

Page: news. Selector: `[class*="media-center_list-item__"]`. States: default, hover.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 720 x 128 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 13px/normal 400 | = |
| Letter spacing | normal | = |
| Colour | #333333 | = |
| Text node | h2.media-center_list-title: -apple-system 18px/27px 600, #21252e | = |
| Transition | none | = |
| ::after | 720px x 1px, absolute, bg #f5f5f7, radius 0px | = |
| Painted layers | li::after.media-center_list-item 720pxx1px bg #f5f5f7; span::after.media-center_thumbnail-wrap 170.656pxx96px bg #000000 @ 0.05 | = |
| How | at rest | mouse hover |

Crops: `article-row-default.png`, `article-row-hover.png`.

### Mobile (390 wide)

#### m-promo-dialog

Promo dialog (mobile).

Page: home. Selector: `[class*="atlas-intro-modal_aw-atlas-intro-modal__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 358 x 437.22 |
| Padding | 0px |
| Border | none |
| Radius | 24px |
| Background | #ffffff |
| Box shadow | #0f1114 @ 0.1 0px 8px 20px 0px |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Text node | h2.atlas-intro-modal_aw-atlas-intro-modal-title: Playfair Display 24px/31.2px 800, #21252e |
| Transition | none |
| Icon | 0 x 0, colour #ffffff |
| Painted layers | div.atlas-intro-modal_aw-atlas-intro-modal 358.0x437.2 bg #ffffff r 24px shadow #0f1114 @ 0.1 0px 8px 20px 0px; div.xg-bar.xg-timebar 0.0x0.0 bg #ffffff @ 0.3 r 10px; div.xg-curbar 0.0x0.0 bg #ff0000; div.xg-playbackrate.xg-top-note 0.0x0.0 bg #000000 @ 0.3 r 100px; xg-prompt.xgplayer-prompt.controls-follow 24.0x11.0 bg #000000 @ 0.5 r 50px; xg-loading.xgplayer-loading 0.0x0.0 bg #3e424b r 20px |
| How | at rest |

Crops: `m-promo-dialog-default.png`.

#### m-header

Mobile top bar. Logo and a menu button; the sidebar becomes a drawer.

Page: home. Selector: `wap-header_headerContent`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 390 x 60 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Transition | none |
| Icon | 24 x 24, colour #21252e |
| How | at rest |

Crops: `m-header-default.png`.

#### m-menu-button

Mobile menu button.

Page: home. Selector: `top bar menu button`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 44 x 27 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #000000 |
| Transition | none |
| Icon | 24 x 24, colour #000000 |
| How | at rest |

Crops: `m-menu-button-default.png`.

#### m-question-box

Mobile question field.

Page: home. Selector: `question field`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 322 x 36 |
| Padding | 0px |
| Border | none |
| Radius | 6px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 13px/18px 400 |
| Letter spacing | 0.126px |
| Colour | #000000 @ 0.88 |
| Transition | all 0.3s ease |
| Cursor | text |
| Placeholder | #9ca2ac, opacity 1 |
| How | at rest |

Crops: `m-question-box-default.png`.

#### m-app-banner

App banner (mobile). A bottom banner with the app icon, rating and an Open pill. Open was not pressed.

Page: home. Selector: `bottom app banner`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 390 x 64 |
| Padding | 14px 12px 14px 14px |
| Border | none |
| Radius | 16px 16px 0px 0px |
| Background | #ffffff |
| Box shadow | #000000 @ 0.12 0px -4px 16px 0px |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | p.wap-footer-view_sticky-footer-description-title: -apple-system 14px/19.6px 600, #21252e |
| Transition | none |
| Transform | matrix(1, 0, 0, 1, 0, 0) |
| Icon | 12 x 13, colour #ffffff |
| Painted layers | div.wap-footer-view_sticky-footer 390.0x64.0 bg #ffffff r 16px 16px 0px 0px shadow #000000 @ 0.12 0px -4px 16px 0px; button.button_btn.button_btn-large 96.6x33.6 bg #fff0f3 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 10px |
| How | at rest |

Crops: `m-app-banner-default.png`.

#### m-unit-card

Unit card (mobile). On a phone the unit card is a 112px row card at radius 20 with a 4px track.

Page: math. Selector: `[class*="catalog_card__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 358 x 112 |
| Padding | 11px 12px 12px 11px |
| Gap | 12px 16px |
| Border | 1px solid #000000 @ 0.08 |
| Radius | 20px |
| Background | #ffffff |
| Box shadow | #000000 @ 0.04 0px 4px 7px 0px |
| Outline | none |
| Font | -apple-system 16px/normal 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | h3: Inter 15px/21px 600, #21252e |
| Transition | box-shadow 0.16s ease |
| Cursor | pointer |
| Painted layers | a.catalog_card 358.0x112.0 bg #ffffff border T:1px solid #000000 @ 0.08 / R:1px solid #000000 @ 0.08 / B:1px solid #000000 @ 0.08 / L:1px solid #000000 @ 0.08 r 20px shadow #000000 @ 0.04 0px 4px 7px 0px; span::before 1pxx12px bg #d9dde3; div.catalog_progressTrack 333.0x4.0 bg #f2f2f4 r 999px |
| How | at rest |

Crops: `m-unit-card-default.png`.

#### m-category-tab

Category tab (mobile).

Page: math. Selector: `[class*="catalog_categoryTab__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 147.28 x 36 |
| Padding | 0px 15px |
| Border | 1px solid #000000 @ 0 |
| Radius | 12px |
| Background | #f4ebe5 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/19.6px 700 |
| Letter spacing | normal |
| Colour | #21252e |
| Transition | none |
| Cursor | pointer |
| Painted layers | a.catalog_categoryTab.catalog_categoryTabActive 147.3x36.0 bg #f4ebe5 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 12px |
| How | at rest |

Crops: `m-category-tab-default.png`.

#### m-create-button

Create button (mobile). On a phone Create Course shrinks to "+ Create" on a #f4f2e6 pill.

Page: math. Selector: `[class*="catalog_createButton__"]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 82 x 32 |
| Padding | 0px 7px |
| Gap | 3px |
| Border | none |
| Radius | 12px |
| Background | #f4f2e6 |
| Box shadow | none |
| Outline | none |
| Font | SF Pro 14px/21px 400 |
| Letter spacing | normal |
| Colour | #21252e |
| Text node | span.catalog_createButtonLabel: SF Pro 14px/21px 500, #21252e |
| Transition | none |
| Cursor | pointer |
| Icon | 16 x 16, colour #21252e |
| Painted layers | button.catalog_createButton 82.0x32.0 bg #f4f2e6 r 12px |
| Ancestor paint | 2 up div.catalog_catalogHeader bg #faf9f4 shadow #faf9f4 0px -16px 0px 0px |
| How | at rest |

Crops: `m-create-button-default.png`.

## Dialog backdrop

The layers behind the promo dialog that paint a fill, from the dialog outwards. The first is the overlay that dims the page.

- `overlay (hashed class names only)`:#0f1114 @ 0.45
- `overlay (hashed class names only)`:#ffffff
- `pc-search-question-input_maskWrap`:#000000 @ 0

## Transitions declared in the readable stylesheets

Gauth's own CSS is served cross-origin, so this list holds only what the CSSOM could read on each page (antd's CSS-in-JS and inline styles); the per-state Transition rows above are computed values and cover Gauth's own rules.

- academy: `color var(--ant-motion-duration-slow)`, `outline-offset, outline`, `all var(--ant-motion-duration-slow)`, `height 0.2s linear`, `width 0.3s linear`, `background-color 0.218s, border-color 0.218s`, `background-color 0.218s`

- atlas: none

- home: `all var(--ant-motion-duration-slow)`

- lesson-math: none

- lesson-science: none

- unit: `color var(--ant-motion-duration-slow)`, `outline-offset, outline`, `all var(--ant-motion-duration-slow)`, `height 0.2s linear`, `width 0.3s linear`, `background-color 0.218s, border-color 0.218s`, `background-color 0.218s`
