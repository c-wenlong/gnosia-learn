# Duolingo product components

## App shell

### Sidebar navigation
Where: every desktop page at >=700px wide (absent from all *-mobile dumps); nav items dt=home-nav, characters-nav, practice-hub-nav, leaderboard-nav, quests-nav, shop-nav, profile-tab, more-nav

Anatomy:
- container: fixed full-height column with 2px right border (cl=_3P5E_)
- logo block (wordmark 128x30; 40x40 mark when collapsed)
- nav list: 8 items in a 8px-gap column
- nav item: 32x32 icon + uppercase label, 2px border box, 12px radius when hovered/selected
- notification dot on the icon (Practice)
- profile item uses the round avatar as its icon
- MORE item (role=button) that opens a side popover menu
- promo card (Want to learn chess?) under the list, >=1160px only

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| container | width x height | 256 x 797 (100vh); width = calc(var(--web-ui_navbar-width,224px) + 32px) at >=1160px, calc(var(--web-ui_navbar-width-no-labels,56px) + 32px) = 88px below | learn-dark-default cl=_3P5E_ (#3); css:9071-d035f2e5.css ._3P5E_ and ._3P5E_ @media (min-width:1160px) |
| container | padding / border | 0 16px; border-right 2px solid; box-sizing border-box, so the content column is 222px | learn-dark-default cl=_3P5E_ (#3) |
| container | position / z-index / overflow | position fixed, top var(--web-ui_topbar-top,0), left 0; z-index 210; overflow-y auto with the scrollbar hidden | learn-dark-default cl=_3P5E_ _14v8V (#3); css:4243-a8d324a8.css ._14v8V |
| logo block | box | 222 x 92: padding 32px 0 30px 16px, height 30px (>=1160); below 1160: height 39px, padding 36px 0 25px 10px | learn-dark-default cl=_3vxyy (#4); css:9071-d035f2e5.css ._3vxyy |
| logo | size | wordmark img 128 x 30 at x32 y32 (cl=sOuBs, shown >=1160); collapsed mark cl=_1C091 40 x 40 (shown <1160, not captured) | learn-dark-default cl=sOuBs (#6); css:9071-d035f2e5.css .sOuBs, ._1C091 |
| nav list | layout | flex column, gap 8px; 222 wide (width 56px below 1160) | learn-dark-default cl=_2uLXp (#7); css:9071-d035f2e5.css ._2uLXp |
| nav item | width x height | 222 x 52 (inner height 40px + 4px padding x2 + 2px border x2); 48px tall and padding 0 below 1160 | learn-dark-default dt=home-nav span cl=_22Pme _33YLo p3liX YAEPa (#10); css:9071-d035f2e5.css .p3liX, .YAEPa |
| nav item | padding / border / radius | padding var(--web-ui_tab-padding,4px 8px); border 2px solid transparent; radius 12px (applied by the selected and hover rules) | css:9071-d035f2e5.css .YAEPa, ._348_2, ._3Dchg:hover |
| nav item | pitch | 60px (52 item + 8 gap): items at y 92, 152, 212, 272, 332, 392, 452, 512 | learn-dark-default dt=*-nav (#9,#15,#21,#28,#34,#40,#46,#52) |
| nav item | alignment | flex row, align-items center; justify-content flex-start (center below 1160) | css:9071-d035f2e5.css ._33YLo, ._22Pme |
| icon | size / offset | 32 x 32 img, margin-left 6px (0 below 1160) inside a 38 x 32 wrapper with margin-right 20px (0 below 1160); icon x=32, label x=84 | learn-dark-default cl=_4fxfA (#11), cl=_101n8 (#12); css:9071-d035f2e5.css ._4fxfA, ._101n8 |
| avatar icon | size | 32 x 32, radius 50% | learn-dark-default dt=profile-tab img cl=_1eYjP _2eox0 (#49); css:9071-d035f2e5.css ._1eYjP |
| notification dot | size / position | 8 x 8 plus 2px ring = 12 x 12 rendered; absolute top 0 right 0 of the 32px icon (x52 y222) | learn-dark-default cl=_3niSR _2O71O _3MaD6 (#25); css:9071-d035f2e5.css ._3niSR, ._2O71O, ._3MaD6 |
| label | size | text box 25px tall (line-height 25px from the container font 500 17px/25px); hidden (display none) below 1160 | learn-dark-default cl=_1AZJt (#13); css:9071-d035f2e5.css ._1AZJt |
| MORE popover | rect / offset | 291 x 262 at x246 y502: position fixed, 8px (margin-left) right of the 238px item edge; z-index 220; surface radius 15px, 2px border; rows 52px (link rows) and 40px (Settings, Help, Log out) with padding 0 40px 0 20px, 2px divider after the link group | learn-dark-more-menu cl=_3zpnU D0iFS _1o3g5 xw9u1 (#58), cl=_36bu_ (#59), cl=_1fv9a (#60), dt=det-nav (#61), dt=settings-button (#68); css:4779-c36ad395.css ._36bu_; css:9071-d035f2e5.css .GHXZL, ._2ifes |
| MORE hover bridge | ::after | 10px wide invisible strip to the right of the item (right -10px) so the pointer can travel to the popover | learn-dark-more-menu cl=_3tK_c (#53) ::after; css:9071-d035f2e5.css ._3tK_c:hover:after |
| promo card | box | 222 x 199, margin 12px 0, padding 24px 12px 16px, gap 8px, border 2px, radius 12px, text-align center; display none below 1160 | learn-dark-default cl=_2cabz (#58); css:4243-a8d324a8.css ._2cabz @media (min-width:1160px) |
| promo card | content | image 55 x 47; title 20/24 700; body 16/24; CTA "TRY CHESS" 14px/28px 700 uppercase, 83 x 32 | learn-dark-default cl=_1vDVl (#59), _332av (#60), _2WGIW (#61), _2rQ98 (#62) |

| State | What changes | Source |
| --- | --- | --- |
| default | transparent 2px border, no fill, label wolf | learn-dark-default #16 cl=_3Dchg |
| hover (non-selected) | background polar, radius 12px (only under @media (hover:hover)) | css:9071-d035f2e5.css ._3Dchg:hover; captured:learn-dark-nav-hover (dt=quests-nav #35 gained rgb(32,47,54) + 12px radius) |
| selected / active page | background iguana, 2px blue-jay border, radius 12px, label macaw (wrapper cl=_3glZ0 colours the label) | css:9071-d035f2e5.css ._348_2, ._3glZ0 ._1AZJt; captured:learn-dark-default #10 |
| selected per page | home-nav on /learn and /sections, characters-nav, practice-hub-nav, leaderboard-nav, quests-nav, shop-nav, profile-tab on their pages; nothing selected on /settings/* | captured: *-dark-default dumps (cl=_348_2); settings-account-dark-default has no _348_2 |
| MORE open | trigger keeps the polar hover fill (outer span cl=_3tK_c) while the popover (its DOM child) is hovered; ::after 10px bridge to the right | captured:learn-dark-more-menu #53/#54, learn-light-more-menu #53/#54; css:9071-d035f2e5.css ._3tK_c:hover, ._3tK_c:hover:after |
| MORE menu row hover | row background polar; the inner item span drops its own hover fill but the outer _3tK_c keeps it | captured:learn-dark-more-menu-item-hover dt=settings-button (#68); css:9071-d035f2e5.css .GHXZL:hover |
| focus / active (pressed) | no :focus, :focus-visible or :active rules exist for the nav item classes | states_for on _22Pme _33YLo p3liX YAEPa _3Dchg _348_2 _2dvyl: none |
| collapsed hover tooltip (<1160) | label shown as a fixed tooltip: background wolf, text snow, radius 8px, padding 7px 12px, 15px, left 88px | css:9071-d035f2e5.css .j5zXd (not captured) |

Tokens (dark): container background #131F24 (snow, dark); container border-right #37464F (swan, dark); label (default) color #DCE6EC (wolf, dark); label (selected) color #49C0F8 (macaw, dark); item (selected) background #202F36 (iguana, dark); item (selected) border 2px #3F85A7 (blue-jay, dark); item (hover) background #202F36 (polar, dark), same hex as iguana in dark, so selected differs from hover only by the blue-jay border; notification dot fill / ring #EE5555 (cardinal, dark) / 2px #131F24 (snow, dark); MORE popover surface / border / row hover #131F24 (snow, dark) / #37464F (swan, dark) / #202F36 (polar, dark); MORE popover row text #DCE6EC (wolf, dark); promo card border / title / body / CTA #37464F (swan) / #F1F7FB (eel, from CSS; equal to the dump default) / #DCE6EC (wolf) / #49C0F8 (macaw), dark

Tokens (light): container background #FFFFFF (snow, light); container border-right #E5E5E5 (swan, light); label (default) color #777777 (wolf, light); label (selected) color #1CB0F6 (macaw, light); item (selected) background #DDF4FF (iguana, light); item (selected) border 2px #84D8FF (blue-jay, light); item (hover) background #F7F7F7 (polar, light); notification dot fill / ring #FF4B4B (cardinal, light) / 2px #FFFFFF (snow, light); MORE popover surface / border / row text #FFFFFF (snow) / #E5E5E5 (swan) / #777777 (wolf), light; promo card border / title / body / CTA #E5E5E5 (swan) / #4B4B4B (eel) / #777777 (wolf) / #1CB0F6 (macaw), light

Type: nav label: duolingo-sans 700 15px, line-height 25px, uppercase, letter-spacing 0.8px (0 for [lang=ar]); container base: 500 17px/25px duolingo-sans, antialiased; MORE popover row: 700 15px/16px uppercase (link rows add letter-spacing 0.8px from ._1AZJt); promo title / body / CTA: 700 20/24 / 400 16/24 / 700 14px/28px uppercase ls 0.56px

Contains: popover shell (MORE menu, side placement, 15px radius), menu (MORE menu rows), card (chess promo, 12px radius variant), button: text/ghost macaw (TRY CHESS)

Desktop vs mobile: >=1160px: 256px wide with labels, wordmark and promo card. 700-1159px: 88px icon-only rail (labels display none, items 48px tall and centred, 40x40 logo mark, hover tooltip), page padding-left 88px (css:4243 ._19E80). <700px: not rendered; replaced by mobile-top-bar and mobile-tab-bar (absent from every *-mobile dump).

Crops: [sidebar-nav-dark](crops/sidebar-nav-dark.png) · [sidebar-nav-light](crops/sidebar-nav-light.png) · [sidebar-nav--more-open-dark](crops/sidebar-nav--more-open-dark.png) · [sidebar-nav--more-open-light](crops/sidebar-nav--more-open-light.png) · [sidebar-nav--more-item-hover-dark](crops/sidebar-nav--more-item-hover-dark.png)

Gaps: Collapsed 88px sidebar (700-1159px) never captured: values come from CSS only. learn-dark-nav-hover has no screenshot (dump diff only), and there is no light hover dump; light hover colour is from CSS. Keyboard focus ring not captured and no focus rule found on the nav classes. Dump never records font-family (it equals the reference div); family comes from css:app-f2ef02f8.css * rule. Screenshots show the capture tool's pointer (orange-outlined arrow); it is not part of the UI.

Notes: In dark, polar and iguana share #202F36, so hover and selected fills are identical and only the blue-jay border marks the selected page. Icons do not swap between default and selected (same src on every page).

### Stat bar (desktop)
Where: top of the right rail on /learn, /leaderboard, /quests, /shop, /profile, /practice-hub, /characters, /sections (not on /settings): dt=courses-menu, streak-menu, lingot-menu (gems), hearts-menu

Anatomy:
- row container 368 x 44, space-between
- course trigger: flag (+ number in the light captures)
- streak trigger: flame icon + count
- gems trigger: gem icon + count
- hearts trigger: heart icon + count
- each trigger is a 12px-radius role=button span with a 10px hover bridge below it

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| row | width x height / spacing | 368 x 44, flex row, justify-content space-between, align-items center; margin-bottom 8px (so the first card sits 8 + 16 gap below) | learn-dark-default cl=_2gxqo (#69); css:5275-8898b509.css ._2gxqo |
| trigger | height / radius | 44px (height 100%), border-radius 12px, flex centred | learn-dark-default cl=_1LP0k (#71,#75,#80,#84); css:5275-8898b509.css ._1LP0k |
| course trigger | size | flag only: 64 x 44 (width 64px, cl=_3gO6p) in dark dumps; flag + number: 90 x 44 (min-width 80px, padding 0 16px 0 13px, gap 14px) in light dumps | learn-dark-default dt=courses-menu (#70,#71); learn-light-default dt=courses-menu cl=_2cstC (#70), cl=_310Fd (#71), cl=IBL62 (#72); css:5275-8898b509.css ._3gO6p, ._2cstC, ._310Fd, .IBL62 |
| flag | size / shape | 31 x 24, radius 18%, 2px outline | learn-dark-default cl=jNMwi (#73); css:5275-8898b509.css .jNMwi |
| streak trigger | size / padding | 68 x 44 (67 light), padding 0 16px 0 10px; icon wrapper 34 x 28 | learn-dark-default dt=streak-menu (#74,#75), cl=_1BpZv (#76); css:5275-8898b509.css ._3KUWP |
| streak icon | size | 23 x 28, margin-right 11px | learn-dark-default cl=_1CQ4X (#77); css:5275-8898b509.css ._1CQ4X |
| gems trigger | size / padding | 89 x 44, padding 0 16px 0 10px | learn-dark-default dt=lingot-menu (#79,#80); css:5275-8898b509.css ._3w8he |
| gem icon | size | 22 x 28, margin-right 10px | learn-dark-default cl=_2Jf7o (#81); css:5275-8898b509.css ._2Jf7o |
| hearts trigger | size / padding | 72 x 44 (width 72px), padding 0 16px 0 10px, justify space-between | learn-dark-default dt=hearts-menu (#83,#84); css:5275-8898b509.css .hCZR9 |
| heart icon | size | 28 x 28 | learn-dark-default cl=_1LRS8 (#85); css:5275-8898b509.css ._1LRS8 |
| count | box | text box 20px tall (body line-height 20px) | learn-dark-default dt=streak-stat (#78), dt=lingot-stat (#82), cl=xb7v_ (#86) |
| hover bridge | ::after | absolute, top 44px, left 0, right 0, height 10px (bottom -10px): keeps hover while moving into the dropdown | captured:learn-dark-streak-dropdown #75 ::after; css:5275-8898b509.css ._1LP0k:not(._1cy5G):hover:after |

| State | What changes | Source |
| --- | --- | --- |
| default | no background | learn-dark-default #71-#86 |
| hover | background polar under @media (hover:hover), plus the 10px ::after bridge | css:5275-8898b509.css ._1LP0k:not(._1cy5G):hover |
| open (dropdown showing) | identical to hover: trigger gets polar fill and the ::after bridge; nothing else on the trigger changes (no border, no colour change on the count) | captured:learn-dark-streak-dropdown #75, learn-dark-gems-dropdown #80, learn-dark-hearts-dropdown #84, learn-dark-courses-dropdown #71 and the four learn-light-*-dropdown dumps |
| streak inactive vs active | 0 days: count swan and grey flame (src images/icons/65b8a029...svg); 1+ days: count fox and orange flame (src images/icons/398e4298...svg) | captured:learn-dark-default #77/#78 vs learn-light-default #78/#79 |
| course with number | light dumps show the flag plus a number (35) with min-width 80px; dark dumps show the flag alone at 64px. The number has no label in the dump | captured:learn-light-default #70-#74 vs learn-dark-default #70-#73 |
| focus / active | no :focus or :active rules on these classes | states_for on _1LP0k _3JwD6 B6n_W: hover only |

Tokens (dark): flag outline 2px #FFFFFF (snow-always-light, dark); streak count (0 days) color #37464F (swan, dark); streak count (active) color #FFAB33 (fox, dark), from CSS; desktop dark was only captured at streak 0 (the dark mobile bar shows the same token); gems count color #49C0F8 (macaw, dark); hearts count color #EE5555 (cardinal, dark); trigger hover / open background #202F36 (polar, dark)

Tokens (light): flag outline 2px #FFFFFF (snow-always-light, light); invisible on the white page; course number color #4B4B4B (eel, light); streak count (0 days) color #E5E5E5 (swan, light), from CSS (light was captured at streak 1); streak count (active) color #FF9600 (fox, light); gems count color #1CB0F6 (macaw, light); hearts count color #FF4B4B (cardinal, light); trigger hover / open background #F7F7F7 (polar, light)

Type: counts: duolingo-sans 700 15px, line-height 20px (body default), no letter-spacing, no transform; course number: duolingo-sans 700 16px/24px

Contains: popover shell (the four dropdowns, documented elsewhere)

Desktop vs mobile: Desktop: in the right rail, 368 wide, 44 tall, 15px counts. Mobile (<700): the same four stats move into the fixed mobile-top-bar (58 tall, 17px counts, larger outlined icons). See mobile-top-bar.

Crops: [stat-bar-dark](crops/stat-bar-dark.png) · [stat-bar-light](crops/stat-bar-light.png) · [stat-bar--streak-open-dark](crops/stat-bar--streak-open-dark.png) · [stat-bar--streak-open-light](crops/stat-bar--streak-open-light.png)

Gaps: Active streak on desktop dark and inactive streak on desktop light were not captured; the colours come from CSS. What the course number (35) counts is not labelled in any dump. Hearts at 0 or refilling, and Super (unlimited hearts) variants, not captured.

Notes: The dropdown diffs also add a 14x22 svg at the pointer: that is the capture tool's cursor, not UI.

### Right rail
Where: right column of every desktop page at >=700px (learn, leaderboard, quests, shop, profile, practice-hub, characters, sections, settings)

Anatomy:
- outer column (cl=_1UT5d, width 368px) with a JS-sized ::before spacer
- inner sticky stack (cl=_1GhPE) with 16px gaps
- stat bar first, then page-specific cards, then footer links

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| rail | width | 368px (._2SBm1 / ._3hqQW width 368px override ._1UT5d width 380px), flex 0 0 auto | learn-dark-default cl=_2SBm1 _1UT5d _2YNyh (#67); css:5275-8898b509.css ._1UT5d, ._2SBm1, ._3hqQW |
| rail | position (sticky variant) | outer: position sticky, bottom 24px, align-self flex-end, flex-direction column-reverse; inner: position sticky, top calc(var(--app-offset) + 24px), min-height calc(100vh - var(--app-offset) - 48px) = 749px at 797 tall | learn-dark-default #67, cl=_74gJE _1GhPE (#68); css:5275-8898b509.css ._2SBm1, ._74gJE |
| rail | scroll spacer | ::before height calc(var(--sidebar-offset) - var(--app-offset) - 24px); measured outer 14427 = inner 1174 + 13253, where scroll offset meta.sy = 13252.5, so the rail stays pinned while the page scrolls and releases at its bottom | learn-dark-default #67 rect vs #68 rect; learn-light-default #67 14809 = 1122 + 13687 (sy 13686.5); css:5275-8898b509.css ._2SBm1:before |
| rail | position (static variant) | cl=_3hqQW: flex column, width 368, not sticky (used on /quests and /profile) | quests-dark-default cl=_3hqQW _1UT5d _2YNyh (#66); profile-dark-default (#66); css:5275-8898b509.css ._3hqQW |
| stack | gap | 16px between cards; the stat bar adds its own 8px margin-bottom, so the first card starts 68px below the rail top (y 92) | learn-dark-default cl=_1GhPE (#68), _2gxqo (#69); css:5275-8898b509.css ._1GhPE |
| rail | z-index | 1 (main column z-index 0) | css:5275-8898b509.css ._2YNyh, ._2HEhk |
| cards | common shell | 368 wide, padding 18px, 2px border, radius 16px (card class _2cnFr _1T_BQ) | learn-dark-default #95; css:1008-b4d34396.css ._2cnFr, ._1T_BQ |
| footer links | box | 348 wide, margin 16px 10px 4px, flex wrap centred; each li margin 0 10px 12px; link 13px/16px 700 uppercase | learn-dark-default dt=footer-links (#134), cl=pQQIb (#135), cl=_1oCct (#136); css:5275-8898b509.css ._3mfHU, .pQQIb, ._1oCct |
| order /learn (dark 1200) | cards [y, h] | stat bar [24,44]; Super promo _16rRh [92,233]; Leaderboard result card [341,230]; Daily Quests [587,165]; ad-blocker Super card _3D_HB [768,330]; footer [1130,64] | learn-dark-default children of #68 |
| order /learn (light 1384) | cards [y, h] | stat bar [24,44]; Super promo [92,233]; Bronze League card [341,178]; Daily Quests [535,165]; ad-blocker card [716,330]; footer [1078,64] | learn-light-default children of #68 |
| order /practice-hub, /characters, /sections | cards | same stack as /learn in each theme | practice-hub-*-default, characters-*-default, sections-*-default children of cl=_1GhPE |
| order /shop | cards [y, h] | stat bar; Bronze League [92,175]; Daily Quests [283,165]; ad-blocker [464,330]; footer [826,64] (no Super promo) | shop-dark-default children of #67 |
| order /leaderboard | cards [y, h] | stat bar; "Set your status" card _1Queb [92,320]; footer [444,64] | leaderboard-dark-default children of #67 |
| order /quests | cards [y, h] | stat bar; Monthly Badges _3Ek2T [92,524]; footer [648,64] (static rail) | quests-dark-default children of #67 |
| order /profile | cards [y, h] | stat bar; friend activity _16cpx [92,499]; Following [607,378]; Add friends [1001,204]; footer [1237,64] (static rail) | profile-dark-default children of #67 |
| order /settings/* | cards [y, h] | no stat bar: Account/Preferences _1uIIO [24,404]; Subscription [444,140]; Support [600,140]; LOG OUT button [756,48] | settings-account-dark-default children of #67 |

| State | What changes | Source |
| --- | --- | --- |
| sticky | rail pins 24px from the top while its content fits the viewport; taller rails scroll with the page then pin 24px from the bottom | css:5275-8898b509.css ._2SBm1, ._74gJE; captured:learn-dark-default (sy 13252) |
| footer link hover | colour macaw | css:5275-8898b509.css ._1oCct:hover |

Tokens (dark): card shell background / border #131F24 (snow, dark) / #37464F (swan, dark); footer links color #52656D (hare, dark); hover #49C0F8 (macaw, dark)

Tokens (light): card shell background / border #FFFFFF (snow, light) / #E5E5E5 (swan, light); footer links color #AFAFAF (hare, light); hover #1CB0F6 (macaw, light)

Type: footer links: duolingo-sans 700 13px/16px uppercase

Contains: card (16px radius, 2px border), button: primary / secondary inside cards (documented by the card owners)

Desktop vs mobile: Not rendered below 700px (no _1UT5d node in any *-mobile dump); its stat bar moves to mobile-top-bar and the cards are dropped.

Crops: [right-rail-dark](crops/right-rail-dark.png) · [right-rail-light](crops/right-rail-light.png)

Gaps: --sidebar-offset and --app-offset are set by JS; their live values were not dumped (derived from rects). No CSS rule hides the rail between 700px and 1159px; it stays 368 wide there (derived, not captured).

Notes: The Leaderboard card differs by moment, not theme: dark captured the end-of-week result card, light the in-week Bronze League card.

### Mobile top bar
Where: <700px on /learn and /shop only (cl=_3sbzq _1lHE4); not rendered on /leaderboard, /quests, /profile, /settings mobile

Anatomy:
- fixed full-width bar, 58px tall
- four stat triggers spread with space-between: course (flag + number), streak, gems, hearts

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| bar | width x height | 570 x 58 (height 58px), position fixed top var(--web-ui_topbar-top,0), z-index 210 | learn-dark-mobile cl=_3sbzq _1lHE4 hJZ_L (#3); css:5275-8898b509.css ._3sbzq, ._1lHE4 |
| bar | padding | 0 10px; inner row 550 wide, flex, justify-content space-between, height 100% | learn-dark-mobile #3, cl=qs_bd (#4); css:5275-8898b509.css ._3sbzq .qs_bd |
| bar | bottom border | 2px solid swan by default (._1lHE4); removed with border-bottom 0 !important on /learn and /shop (cl=hJZ_L) | css:5275-8898b509.css ._1lHE4; css:4769-628e48ee.css .hJZ_L |
| trigger | hit area | full bar height (58px), no padding: course 54, streak 39, gems 64, hearts 46 wide at x 10, 180, 334, 514 | learn-dark-mobile dt=courses-menu (#5), streak-menu (#10), lingot-menu (#15), hearts-menu (#19) |
| course | flag + number | flag 32 x 25, gap 6px, number 16 x 24 | learn-dark-mobile cl=_2Zkly (#7), img (#8), cl=_2DN_i (#9); css:5275-8898b509.css ._2Zkly |
| streak | icon | 25 x 30, margin-right 6px | learn-dark-mobile dt=imageStreak cl=_1s1SW (#13); css:5275-8898b509.css ._1s1SW |
| gems | icon | 24 x 30, margin-right 6px | learn-dark-mobile cl=_1J0jY (#17); css:5275-8898b509.css ._1J0jY |
| hearts | icon | 32 x 32, gap 6px; count margin 6px auto | learn-dark-mobile cl=_3QChT (#21), img (#22), cl=IYCa_ (#23); css:4769-628e48ee.css ._3QChT, .IYCa_ |
| content offset | padding-top | page wrapper padding-top 58px so content starts under the bar | learn-dark-mobile cl=kPqwA _2kkzG (#46) |

| State | What changes | Source |
| --- | --- | --- |
| themed bar | background and count colour can be overridden via --web-ui_topbar-background-color / --web-ui_topbar-color (and -shine- variants); colour change animates 0.2s linear | css:5275-8898b509.css ._3sbzq, .iFJ2Z, ._2u6H3 (override not captured) |
| hover / pressed | no rules for the mobile trigger classes | states_for on _1cSCG _1vdTe _1M9zP _25xLQ: none |
| open dropdown | not captured on mobile | not captured |

Tokens (dark): bar background #131F24 (snow, dark), overridable by --web-ui_topbar-background-color; bar text colour #52656D (hare, dark); course number color #F1F7FB (eel, dark), from CSS (equals the dump default); streak count color #FFAB33 (fox, dark); gems count color #49C0F8 (macaw, dark); hearts count color #EE5555 (cardinal, dark)

Tokens (light): bar background #FFFFFF (snow, light); bar text colour #AFAFAF (hare, light); course number color #4B4B4B (eel, light); streak count color #FF9600 (fox, light); gems count color #1CB0F6 (macaw, light); hearts count color #FF4B4B (cardinal, light)

Type: counts: duolingo-sans 700 17px, line-height 20px (bar font 500 17px/25px with line-height 20px; dump records no size change); course number: duolingo-sans 700 16px/24px

Contains: none

Desktop vs mobile: Mobile-only replacement for the desktop stat bar: 58 tall vs 44, counts 17px vs 15px, icons use outlined artwork (different src: vendor/398e4298, vendor/45c14e05) and are 25-32px vs 22-28px, no rounded hover chips, and the course number is always shown.

Crops: [mobile-top-bar-dark](crops/mobile-top-bar-dark.png) · [mobile-top-bar-light](crops/mobile-top-bar-light.png)

Gaps: Border-bottom variant (without hJZ_L) was not seen on any captured page. Dropdown/open state and any themed (--web-ui_topbar-*) variant not captured on mobile.

### Mobile tab bar
Where: <700px on /learn, /leaderboard, /quests, /profile, /shop (cl=_1p0jQ > nav _2_E8y > _2zdkO); absent on /settings/* mobile

Anatomy:
- fixed bottom bar, 82px, top border
- 6 icon-only tabs: Learn, Characters, Practice, Leaderboards, Quests, Profile (no Shop, no More)
- active tab: 48x48 chip with fill and border
- scrim layer for an overlay (opacity 0, unused in captures)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| bar | width x height | 570 x 82 (height 82px), position fixed bottom 0, width 100%, z-index 210 | learn-dark-mobile cl=_1p0jQ (#24), cl=_2zdkO (#27); css:5275-8898b509.css ._1p0jQ, ._2zdkO |
| bar | padding / gap | padding 16px; flex, align-items center, justify-content space-between, gap 12px; box-sizing border-box | learn-dark-mobile #27; css:5275-8898b509.css ._2zdkO |
| bar | top border | 2px solid | learn-dark-mobile #27 |
| tab | size | 48 x 48, flex centred; at 570 wide the tabs sit at x 16, 114, 212, 310, 408, 506 (98px pitch) | learn-dark-mobile cl=_3UCzw (#28,#31,#34,#37,#40,#43); css:5275-8898b509.css ._3UCzw |
| icon | size | 40 x 40 (no label) | learn-dark-mobile cl=_3J4we (#30); css:5275-8898b509.css ._3J4we |
| active chip | border / radius | 2px solid border, radius 8px (on the 48x48 tab) | learn-dark-mobile cl=_2-WjO (#28); css:5275-8898b509.css ._2-WjO |
| page spacer | height | 82px spacer at the end of /learn (cl=_1uwk5, 0 at >=700) so content clears the bar | learn-dark-mobile cl=_1uwk5 (#1293); css:path-e50cab6b.css ._1uwk5 |
| scrim | layer | fixed full-screen, black at 0.3, opacity 0, transition opacity 0.3s, z-index -1 inside the bar | learn-dark-mobile cl=_1gNU8 (#26); css:5275-8898b509.css ._1gNU8 |

| State | What changes | Source |
| --- | --- | --- |
| active | iguana fill, 2px blue-jay border, 8px radius; icon unchanged (same src) | captured:learn-dark-mobile #28 (Learn), leaderboard-dark-mobile #16, quests-dark-mobile #19, profile-dark-mobile #22 and light twins; css:5275-8898b509.css ._2-WjO |
| no active tab | on /shop none of the 6 tabs is active (Shop has no tab) | captured:shop-dark-mobile, shop-light-mobile #28-#43 |
| hover / pressed / focus | no rules for _3UCzw, _39wwe, _3J4we | states_for: none |

Tokens (dark): bar background / top border #131F24 (snow, dark) / #37464F (swan, dark); active chip background #202F36 (iguana, dark); active chip border 2px #3F85A7 (blue-jay, dark)

Tokens (light): bar background / top border #FFFFFF (snow, light) / #E5E5E5 (swan, light); active chip background #DDF4FF (iguana, light); active chip border 2px #84D8FF (blue-jay, light)

Type: tabs: icon only; accessible name via aria-label (Learn, Characters, Practice, Leaderboards, Quests, Profile)

Contains: none

Desktop vs mobile: Mobile-only replacement for sidebar-nav: icons 40px (desktop 32px), no labels, chip radius 8px (desktop item 12px), same iguana/blue-jay selected tokens; Shop and More are not reachable from the bar.

Crops: [mobile-tab-bar-dark](crops/mobile-tab-bar-dark.png) · [mobile-tab-bar-light](crops/mobile-tab-bar-light.png) · [mobile-tab-bar--leaderboard-active-dark](crops/mobile-tab-bar--leaderboard-active-dark.png)

Gaps: Safe-area (iOS home indicator) handling not visible in CSS or captures. What opens the scrim (_1gNU8) was not captured.

### Page grid
Where: all logged-in pages: app wrapper cl=_3Cy6o _2kkzG (kPqwA on some pages) > _19E80 > AkzqY (max 1056) > wl71D (dt=home on /learn) > [rail _1UT5d, main _2HEhk] in row-reverse

Anatomy:
- fixed sidebar (256 / 88 / none)
- content wrapper: max-width 1056, centred, padding-top 24
- flex row-reverse: main column (flex 1) + 48px gap + 368px right rail, 24px side and bottom padding

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| app wrapper | min-width / top padding | >=700px: min-width 900px, margin 0 auto, padding-top calc(var(--app-offset) + 24px); below: padding-top var(--app-offset) | learn-dark-default cl=_3Cy6o _2kkzG (#1); css:4243-a8d324a8.css ._2kkzG |
| sidebar offset | padding-left | 256px at >=1160, 88px below (the fixed sidebar width) | learn-dark-default cl=_19E80 (#2); css:4243-a8d324a8.css ._19E80 |
| content wrapper | max-width | 1056px, margin 0 auto, width 100%, padding-top 24px | learn-dark-default cl=AkzqY (#65); css:4243-a8d324a8.css .AkzqY |
| row | flex | flex-direction row-reverse (>=700) / column (<700); gap 48px; padding 0 24px 24px (>=700 only) | learn-dark-default dt=home cl=wl71D (#66); css:4819-8f413e73.css .wl71D |
| main column | width rule | flex 1, min-width 0 = min(viewport - sidebar, 1056) - 24 - 24 - 48 - 368 | css:4819-8f413e73.css ._2HEhk |
| 1200 wide (dark captures) | columns | sidebar 0-256; wrapper 944 at x256 (no side margin); main 480 at x280; gap 48; rail 368 at x808; 24 right padding | learn/leaderboard/quests/shop/profile/practice-hub/characters/settings-account-dark-default: _2HEhk and _1UT5d rects |
| 1384 wide (light captures) | columns | sidebar 256; wrapper 1056 at x292 (36px auto margins each side); main 592 at x316; gap 48; rail 368 at x956; 24 right padding | all *-light-default dumps: cl=AkzqY margin 36px, _2HEhk and _1UT5d rects |
| main max width reached | viewport | main hits 592 (wrapper 1056) at >=1312px with the full sidebar; below 1160 the collapsed 88px sidebar gives 1056 again from 1144 down, so main is 592 between 1144 and 1159 (derived from CSS) | CSS arithmetic: ._3P5E_, ._19E80, .AkzqY, .wl71D, ._2SBm1 |
| 900 floor | viewport | below 900 (and >=700) the page keeps min-width 900 and scrolls sideways: main = 900 - 88 - 464 = 348 (derived, not captured) | css:4243-a8d324a8.css ._2kkzG @media (min-width:700px) |
| main inner caps | max-width | /learn path max-width 630 (column is narrower, so never binds); /leaderboard _2A6iC and /quests _1sXRH max 592; /learn path-end _3M4Dc 310 | learn-dark-default cl=_41Y_n (#162); leaderboard-dark-default #143; quests-dark-default #142 |
| /sections at 1200 | overflow | main content forces 516 wide (rows min-width), row grows to 980 and the rail sits at x844, overflowing the 1200 viewport by 12px | sections-dark-default cl=wl71D (#67) 980 wide, _2HEhk (#152) 516, rail (#68) x844 |
| mobile 570 | columns | no sidebar, no rail; main 570 full width; top bar 58 (only /learn, /shop) and tab bar 82 fixed; inner page padding is per page: /profile 16px, /shop 16px (padding 16 16 0), /settings 24px 16px, /leaderboard and /quests full bleed | learn/shop/profile/leaderboard/quests/settings-account-dark-mobile: cl=_2HEhk and first child |

| Page | 1200 (dark) | 1384 (light) | 570 (mobile) |
| --- | --- | --- | --- |
| /learn | main 480 @280, rail 368 @808 (sticky) | main 592 @316, rail 368 @956 (sticky) | main 570, top bar + tab bar (Learn active) |
| /leaderboard | main 480 (inner max 592), rail sticky | main 592 | full bleed, tab bar only (Leaderboards active), sticky league header |
| /quests | main 480, rail static (_3hqQW) | main 592, rail static | full bleed, tab bar only (Quests active) |
| /shop | main 480, rail sticky | main 592 | padding 16px, top bar + tab bar (none active) |
| /profile | main 480, rail static | main 592, rail static | padding 0 16px, tab bar only (Profile active) |
| /practice-hub | main 480, rail sticky | main 592 | not captured |
| /characters | main 480, rail sticky | main 592 | not captured |
| /sections | main 516 (overflows), rail @844 | main 592 | not captured |
| /settings/* | main 480, rail sticky (settings cards, no stat bar) | main 592 | no top bar, no tab bar; sticky 58px page header _3Zt5A; padding 24px 16px |

| State | What changes | Source |
| --- | --- | --- |
| >=1160px | sidebar 256 with labels; content offset 256 | css:9071-d035f2e5.css ._3P5E_ @media (min-width:1160px); css:4243-a8d324a8.css ._19E80 |
| 700-1159px | sidebar 88 icon-only; content offset 88; wrapper min-width 900 | css:9071-d035f2e5.css; css:4243-a8d324a8.css ._2kkzG (not captured) |
| <700px | mobile layout: column flow, no row padding, no sidebar or rail, fixed top and tab bars; kPqwA max-width 1140 only applies >=700 | css:4819-8f413e73.css .wl71D; css:4243-a8d324a8.css .kPqwA; captured:*-mobile |
| <=980px | two helper classes swap (d-oj5 shown, LeLT1 and _3Zsmh hidden); their owners are not in the shell | css:4243-a8d324a8.css .d-oj5, .LeLT1, ._3Zsmh @media (max-width:980px) |

Tokens (dark): page background #131F24 (snow, dark)

Tokens (light): page background #FFFFFF (snow, light)

Type: body default: 500 17px/20px, family duolingo-sans (the * rule)

Contains: none

Desktop vs mobile: See the 1200 / 1384 / 570 rows and the breakpoint states: 1160 (sidebar collapse), 900 (min-width floor), 700 (mobile switch).

Crops: [page-grid-dark](crops/page-grid-dark.png) · [page-grid-light](crops/page-grid-light.png) · [page-grid--mobile-dark](crops/page-grid--mobile-dark.png) · [page-grid--mobile-light](crops/page-grid--mobile-light.png)

Gaps: No capture between 700 and 1199 px, so the collapsed-sidebar and 900px-floor layouts are derived from CSS only. Dark captures are all 1200 wide and light 1384, so theme and width vary together; widths do not depend on theme. --app-offset value not dumped (0 in these captures, judging by rects).

## Learn path

### Unit header banner
Where: /learn, sticky at the top of the path column; div.PsNCe + unit colour class (LJB6r owl, _1p2Lt starfish, ...) inside div._1g8jV

Anatomy:
- sticky wrapper (_1g8jV) with 24px page-colour spacer above (_3LueZ, desktop only)
- banner (PsNCe): 2-column grid, unit colour background, radius 13
- back link row: arrow icon 16x16 + label "SECTION 4, UNIT 12" (links to /sections)
- unit title
- GUIDEBOOK button (grid column 2, spans both rows): 24px notebook icon + label (label only at >=1100px)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| sticky wrapper | position / top / z-index | sticky, top 0 (>=700px), z-index 210, min-height 82px | learn-dark-default cl=_1g8jV (#152); css:path-e50cab6b.css ._1g8jV |
| spacer above banner | height | 24px (desktop), 0 (mobile) | learn-dark-default cl=_3LueZ (#153) r=[280,0,480,24]; css:path-e50cab6b.css ._3LueZ |
| banner | width x height | 480 x 90px at 1200 viewport; 592 x 90px at 1384 viewport (fills the path column) | learn-dark-default cl=PsNCe LJB6r (#154); learn-light-default (#163) |
| banner | padding | 16px | learn-dark-default PsNCe (#154) |
| banner | gap (row / column) | 6px / 16px (row-gap 3px below 700px) | learn-dark-default PsNCe (#154); css:path-e50cab6b.css .PsNCe |
| banner | border-radius | 13px (>=700px only; 0 on mobile) | learn-dark-default PsNCe (#154); css:path-e50cab6b.css .PsNCe @media (min-width:700px) |
| back link | layout | flex, gap 8px; arrow img 16x16; r=[296,40,284,24] | learn-dark-default cl=_3HqVu (#155), img (#156) |
| section/unit label | size | 127 x 24px, opacity 0.7 | learn-dark-default h1 cl=_3WYpp (#157) |
| title | size | 284 x 28px, max-width 100% | learn-dark-default span cl=U_xpg (#158) |
| GUIDEBOOK button | width x height | 148 x 54px | learn-dark-default dt=guidebook-button-82 (#159) |
| GUIDEBOOK button | padding | 12px 14px 12px 12px | learn-dark-default (#159); css:path-e50cab6b.css ._1ORKS |
| GUIDEBOOK button | border width / radius | 2px sides and top, 4px bottom (lip); radius 16px | learn-dark-default (#159) |
| GUIDEBOOK icon | size | 24 x 24px | learn-dark-default img cl=uGhFr (#160) |
| GUIDEBOOK label | margin-left / display | 12px; display none below 1100px viewport | learn-dark-default span cl=_30k3d (#161); css:path-e50cab6b.css ._30k3d @media (min-width:1100px) |

| State | What changes | Source |
| --- | --- | --- |
| scroll (sticky swap) | banner re-colours and re-labels to the unit under it: owl "SECTION 4, UNIT 12" at sy 13252 becomes starfish "SECTION 4, UNIT 11" at sy 12094 | captured: learn-dark-completed-unit #154 vs learn-dark-default #154 |
| GUIDEBOOK hover | filter opacity(0.8): ._1yhVg (later in the file than ._2V6ug) sets --__internal__filter-hover to opacity(0.8), applied by the :hover rule | css:4779-c36ad395.css ._1yhVg; css:4779-c36ad395.css ._2V6ug:hover:not(._2wryV):not(.ypJiL) @media (hover:hover) |
| GUIDEBOOK active | translateY(2px), ::before box-shadow none (lip collapses) | css:4779-c36ad395.css ._2V6ug:active:not(._2wryV) |
| dark theme | none: banner colours use *-always-light names so both themes render identically | learn-dark-default #154 vs learn-light-default #163 |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| banner (unit 81, owl) | background | #58CC02 (owl-always-light, dark) | learn-dark-default PsNCe LJB6r (#154) |
| banner (unit 80, starfish) | background | #FF86D0 (starfish, dark) | learn-dark-completed-unit PsNCe _1p2Lt (#154) |
| banner | text colour | #FFFFFF (snow-always-light, dark) | learn-dark-default (#154); css:path-e50cab6b.css .LJB6r |
| label | colour | #FFFFFF (snow-always-light) at opacity 0.7 | learn-dark-default _3WYpp (#157) |
| GUIDEBOOK button | face | transparent (header colour shows through); ::before border and 2px lip #000000 @0.20 (black) | learn-dark-default dt=guidebook-button-82 (#159) ::before |
| GUIDEBOOK label | colour | #FFFFFF (snow-always-light, dark) | learn-dark-default _30k3d (#161) |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| banner (unit 81, owl) | background | #58CC02 (owl-always-light, light) | learn-light-default PsNCe LJB6r (#163) |
| banner (unit 80, starfish) | background | #FF86D0 (starfish, light) | learn-light-completed-unit PsNCe _1p2Lt (#163) |
| banner | text colour | #FFFFFF (snow-always-light, light) | css:path-e50cab6b.css .LJB6r |
| GUIDEBOOK button | face / lip | transparent; ::before border and lip #000000 @0.20 (black) | learn-light-default dt=guidebook-button-82 |

Type:

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| section/unit label | font | 700 16px/24px, opacity 0.7 (not uppercased by CSS; the string is uppercase) | learn-dark-default _3WYpp (#157); css:path-e50cab6b.css ._3WYpp |
| title | font | 700 22px/28px (19px/22px below 700px) | learn-dark-default U_xpg (#158); css:path-e50cab6b.css .U_xpg |
| GUIDEBOOK label | font | 700 15px/18px uppercase, letter-spacing 0.8px (duolingo-sans via button class _1ursp) | learn-dark-default (#161); css:4779-c36ad395.css ._1ursp |
| all | font-family | not recorded in dumps (body rule: 500 17px/20px) | css:app-f2ef02f8.css body |

Unit colours:

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| owl | banner class / colour | LJB6r: owl-always-light #58CC02 (both themes) | captured: learn-dark-default #154, learn-light-default #163; css:path-e50cab6b.css .LJB6r |
| starfish | banner class / colour | _1p2Lt: starfish #FF86D0 (both themes) | captured: learn-dark-completed-unit #154, learn-light-completed-unit #163; css:path-e50cab6b.css ._1p2Lt |
| macaw | banner class / colour | _1yHHi or _3cANP: macaw-always-light #1CB0F6 | css only on desktop: css:path-e50cab6b.css ._1yHHi, ._3cANP; seen visually on the mobile screenshot (learn-dark-mobile, unit 1) |
| cardinal | banner class / colour | _1g6lo: cardinal-always-light #FF4B4B | css only: css:path-e50cab6b.css ._1g6lo (unit 128 is cardinal in learn-*-path-end, but its header was not on screen) |
| fox | banner class / colour | _2DiMj / _2Iw0k: fox-always-light #FF9600 | css only: css:path-e50cab6b.css |
| grizzly-lite | banner class / colour | _3JOb1: grizzly-lite #DC8F47 | css only: css:path-e50cab6b.css |
| beetle | banner class / colour | M7Jo3: beetle #CE82FF | css only: css:path-e50cab6b.css |
| peacock | banner class / colour | _2bAvg: peacock #00CD9C | css only: css:path-e50cab6b.css |
| dragon | banner class / colour | _14qwu: dragon #CC348D | css only: css:path-e50cab6b.css |
| legendary (gold) | banner vars | jTeoa / _13YX7._1Bwfb: bee #FFC800 L / #FFC700 D with gold-shine #FFE700 @0.5 diagonal stripes (136deg: 10-40%, 53-71%), text guinea-pig-always-light #CD7900 | css only: css:path-e50cab6b.css .jTeoa, ._13YX7._1Bwfb |

Contains: button: secondary (GUIDEBOOK, desktop), button: unit-coloured split button (mobile)
Desktop vs mobile: Mobile (<700px): the banner becomes two joined buttons inside div.SwnLV (padding 0 16px, min-height 82px): left a._1Cm_g 482x82 (radius 12 0 0 12, padding 0 16 12, face owl-always-light #58CC02, 4px lip tree-frog-always-light #58A700), right guidebook a._1J0Ov 56x82 (radius 0 12 12 0, padding 16, icon 24x24, 2px tree-frog divider on its left edge). Label h1.nS3-9 16px/24px 700 uppercase opacity 0.7 margin-top 12; title span._1ejwf 19px/22px 700. Sticky at top 58px under the mobile top bar with a snow background (._3IQDn). No back arrow, no GUIDEBOOK text. Source: learn-dark-mobile #49-#55 and ::before of #51/#54; css:path-e50cab6b.css ._1Cm_g, ._1J0Ov, .FxC7I, ._2Wapu, ._3IQDn. The mobile screenshots show a different moment (SECTION 4, UNIT 1, macaw) than the mobile dump (UNIT 12, owl); the mobile crop is visual only.
Crops: [unit-header-dark](crops/unit-header-dark.png) · [unit-header-light](crops/unit-header-light.png) · [unit-header--starfish-dark](crops/unit-header--starfish-dark.png) · [unit-header--starfish-light](crops/unit-header--starfish-light.png) · [unit-header--mobile-dark](crops/unit-header--mobile-dark.png) · [unit-header--mobile-light](crops/unit-header--mobile-light.png)
Gaps: Only owl and starfish banners were captured on desktop; other unit colours are from CSS only.; Legendary (gold) banner not in any dump.; GUIDEBOOK hover/active not captured (CSS only).; Mobile screenshots do not match the mobile dumps (screenshot shows unit 1 macaw, dump shows unit 12 owl); mobile colours are taken from the dump only.
Notes: Dark theme rules (html[data-duo-theme=dark] .EDeQe:not(._1Bwfb) etc.) switch --path-unit-background-color to polar-always-dark #202F36 inside the path sections, but the banner uses its own colour class (LJB6r) so it stays saturated.

### Unit divider
Where: /learn, first child of every section[dt=skill-path-unit-N]: header._10Xfk

Anatomy:
- left rule (hr._1JA0o, flex-grow)
- unit title (h2._3qGKs)
- right rule

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| divider | height / margins | 82px tall; margin 8px 0 | learn-dark-default header cl=_10Xfk (#1182) r=[280,146,480,82] |
| rule | thickness / length | 2px top border; flex-basis 48px grow 1 (115px each at 480 column, 176px at 592, 165px at 570 mobile) | learn-dark-default hr cl=_1JA0o (#1183,#1185); learn-light-default (#175); learn-dark-mobile (#60) |
| rule | vertical margin | 40px top and bottom (centres the rule) | learn-dark-default (#1183) |
| title | margin | 0 16px | learn-dark-default h2 cl=_3qGKs (#1184); css:path-e50cab6b.css ._3qGKs |

| State | What changes | Source |
| --- | --- | --- |
| none | static; no interactive rules on _10Xfk/_1JA0o/_3qGKs | states_for: no rules |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| rule | colour | #37464F (swan, dark) | learn-dark-default _1JA0o (#1183) |
| title | colour | #52656D (hare, dark) | learn-dark-default _3qGKs (#1184) |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| rule | colour | #E5E5E5 (swan, light) | learn-light-default _1JA0o (#175) |
| title | colour | #AFAFAF (hare, light) | learn-light-default _3qGKs (#176) |

Type:

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| title | font | 700 19px/26.6px, centred | learn-dark-default (#1184); css:path-e50cab6b.css ._3qGKs |

Contains: none
Desktop vs mobile: Identical styles on mobile; rules stretch to the 570px column (learn-dark-mobile #59-#62).
Crops: [unit-divider-dark](crops/unit-divider-dark.png) · [unit-divider-light](crops/unit-divider-light.png)
Gaps: none
Notes: The divider repeats the unit title; the sticky banner slides over it while scrolling.

### Path node
Where: /learn, button[dt="skill-path-level-N skill-path-level-{skill|story|duo_radio|alphabet|practice|unit_review}"] cl=_1gEmM _7jW2t {_1333i|G_Z0K} [_22TV_] _3Jm09; wrapper div.R7x3_._8Iu6E carries the zig-zag offset

Anatomy:
- offset wrapper (R7x3_, position relative, left = zig-zag offset)
- face: ::after ellipse 70x57, radius 50%
- lip: ::after box-shadow 0 8px (black @0.20 over the face colour) plus ::before 8px band at top 28.5px that fills the sides
- shine overlay (completed only): span._1IwKR 56x51 at (6,5), svg in the unit shine colour
- icon: img._1B6UH 42x34 at left 14 top 11.5 (radio uses an inline svg span 36x35)
- current only: progress ring svg._2FMGJ 98x93 around the node, and the START bubble above
- chest variant: button 80x90 with chest image, no face
- jump variant: a[dt=skill-path-state-unit_test] with "JUMP HERE?" tooltip

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| button | width x height | 70 x 65px (face 57 + lip 8) | learn-dark-default dt=skill-path-level-0 (#1236) r=[485,317,70,65] |
| face (::after) | size / radius | 70 x 57px (top 0, bottom 8px), border-radius 50% | learn-dark-default (#1236) ::after; css:path-e50cab6b.css ._3Jm09:after |
| lip | depth | 8px: box-shadow 0 8px 0 rgb(black/.2), 0 8px 0 var(--path-level-color) | learn-dark-default (#1236) ::after; css:path-e50cab6b.css ._3Jm09:after |
| side band (::before) | size | 70 x 8px at top 28.5px, same colour stack as the lip | learn-dark-default (#1236) ::before; css:path-e50cab6b.css ._3Jm09:before |
| icon | size / position | 42 x 34px at left 14px, top 11.5px | learn-dark-default img cl=_1B6UH (#1237); css:path-e50cab6b.css ._1B6UH |
| shine overlay | size / position | 56 x 51px box at left 6, top 5; svg 56x46 | learn-dark-default span cl=_1kZ3q _25i8d _1IwKR (#573), svg (#574) |
| progress ring | size | 98 x 98px svg scaled 0.946 vertically = 98 x 93px; node sits inside with 14px margin (_1xsb4) | learn-dark-default svg cl=_2FMGJ (#1231), div cl=_1xsb4 (#1235); css:path-e50cab6b.css ._2FMGJ, ._1xsb4 |
| progress ring | stroke | outer radius 50, inner 42 in a 100 viewBox = 8 units, about 7.8px rendered; arc ends rounded (r 4) | dumps/icons-_learn.json svg._2FMGJ |
| zig-zag | horizontal offsets (wrapper left) | 0, +44.884, +70, +44.884, 0, -44.884, -70, -44.884, 0 ... (px from column centre); the sign of the first swing alternates per unit (unit 79 and 81 start +, unit 80 and 82 start -) | learn-dark-default div.R7x3_ wrappers of #572-#729 (unit 79), #1036-#1175 (unit 80), #1236-#1303 (unit 81) |
| zig-zag | vertical gap (wrapper margin-top) | 11.853px between rows at offset 0 and 44.884; 20.383px between 44.884 and 70; so centre-to-centre pitch 76.9px or 85.4px | learn-dark-default R7x3_ wrappers (e.g. parent of #1245 mt 11.8533, parent of #1250 mt 20.3826) |
| zig-zag | first node / unit review margin-top | 24px for the first node of a unit and for the unit-review node; 67px for the current unit first node (room for START bubble) | learn-dark-default wrappers of #572, #729, #1229 (67px); css:path-e50cab6b.css ._1_rYF |
| chest | size | 80 x 90px, placed on the zig-zag like a node | learn-dark-default button aria=Chest (#1258) r=[480,656,80,90] |
| START bubble | size / position | 80 x 45px (min-width 80), radius 10px, border 2px, padding 12px; above the ring (top -43px), arrow 20x10 pointing down | learn-dark-default cl=_3zpnU _37pE2 _1o3g5 _kJVz (#1238), _36bu_ _27IMa (#1239), _3T97b (#1240); css:path-e50cab6b.css ._kJVz, ._27IMa |
| jump tooltip | size | 126 x 45px, radius 10px, border 2px, padding 12px, arrow 20x10 | learn-dark-default dt=skill-path-tooltip-unit-test (#1321), TOHdU (#1322) |
| path column | width | 480px (1200 viewport), 592px (1384), 570px (mobile); nodes centred | learn-dark-default dt=skill-path (#162) |

| State | What changes | Source |
| --- | --- | --- |
| current (active) | unit-colour face, class _1333i plus hover class _22TV_; wrapped in progress ring 98x93 and START bubble; aria-label "Lesson 1 of 6" | captured: learn-dark-default #1229-#1241; learn-light-default #1251-#1259 |
| current with progress | ring arc in unit colour over swan track, rounded ends, snow end cap | captured: learn-light-default #1252-#1256 (Lesson 3 of 6) |
| locked | class G_Z0K: --path-level-color swan (#37464F dark / #E5E5E5 light); grey theme-specific icon; no _22TV_ so no hover shift | captured: learn-dark-default #1245; learn-light-default #1267; css:path-e50cab6b.css .G_Z0K |
| completed | unit-colour face (_1333i) plus shine overlay span._1IwKR in <unit>-shine colour; check icon (book for story, trophy for unit review, coloured headphones for radio) | captured: learn-dark-default units 79/80 (#572-#1175); learn-dark-completed-unit |
| hover | transform translateY(1.5px); ::after lip shadow 8px to 6.5px; ::before band hidden | captured: learn-dark-node-popover #1236 vs learn-dark-default #1236; css:path-e50cab6b.css ._22TV_:hover:not(:active) |
| hover filter | none (._3Jm09 sets --web-ui_button-filter-hover:none, so the generic brightness(1.1) does not apply); chests likewise (_2vzTv) | css:path-e50cab6b.css ._3Jm09, ._2vzTv; css:4779-c36ad395.css ._1gEmM:hover |
| active (pressed) | transform translateY(8px); ::after box-shadow none; ::before hidden (face drops onto the lip) | css:path-e50cab6b.css ._3Jm09:active, ._3Jm09:active:after, ._3Jm09:active:before |
| legendary | class _2ucCV: face bee (#FFC800 light / #FFC700 dark), lip and band guinea-pig-always-light #CD7900 @0.5 | css:path-e50cab6b.css ._2ucCV, ._2ucCV:before, ._2ucCV:after (not captured) |
| unit test / jump | a[dt=skill-path-state-unit_test] at slot 0 of the next unit, face in that unit colour (#FF9600 fox), tooltip "JUMP HERE?" above, href /lesson/unit/83/test | captured: learn-dark-default #1319-#1324; learn-light-default #1341-#1346 |
| chest | button 80x90 with class _2wryV (cursor default), no face; locked chest art per theme, opened chest art in completed units | captured: learn-dark-default #1258, #669 |
| transition | transition: filter 0.2s | learn-dark-default #1236; css:4779-c36ad395.css ._1gEmM |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| current / completed face | background | unit colour: #58CC02 (owl-always-light), #1CB0F6 (macaw-always-light), #FF86D0 (starfish), #FF9600 (fox-always-light) in the captured units | learn-dark-default ::after of #1236 (owl), #572 (macaw), #1036 (starfish), #1319 (fox) |
| lip | colour | face colour with #000000 @0.20 (black) laid over it | learn-dark-default (#1236) ::after box-shadow |
| locked face | background | #37464F (swan, dark) | learn-dark-default G_Z0K ::after (#1245); css:path-e50cab6b.css .G_Z0K |
| progress ring track | fill | #37464F (swan, dark) | learn-dark-default svg path (#1233) |
| progress ring end cap | fill | #131F24 (snow, dark) | learn-dark-default circle (#1234) |
| progress ring arc | fill | var(--path-unit-character-color) = unit colour (no arc drawn at Lesson 1 of 6) | learn-dark-default (#1231); icons-_learn.json |
| shine overlay | colour | macaw units #43BEF8 (bea-junior-shine); starfish units #FF9ED9 (zari-shine) | learn-dark-default _25i8d (#573), _3aYNQ (#1037) |
| radio icon (completed) | colour | macaw units #147BAC (bea-radio); starfish #B35E92 (zari-radio); owl #3E8F01 (duo-radio) | learn-dark-default _1-7MG (#595), _2GiEE; learn-dark-completed-unit _3y0yK |
| START bubble | bg / border / text | #131F24 (snow) / #37464F (swan) / unit colour #58CC02 (owl-always-light) | learn-dark-default _27IMa (#1239) |
| jump tooltip | bg / border / text | #131F24 (snow) / #37464F (swan) / #FF9600 (fox-always-light, next unit colour) | learn-dark-default TOHdU (#1322) |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| current / completed face | background | same unit colours as dark (*-always-light names): owl #58CC02, macaw #1CB0F6, starfish #FF86D0, fox #FF9600 | learn-light-default ::after of #1258, #581, #1045, #1341 |
| locked face | background | #E5E5E5 (swan, light) | learn-light-default G_Z0K ::after (#1267) |
| progress ring track | fill | #E5E5E5 (swan, light) | learn-light-default svg path (#1254) |
| progress ring arc | fill | #58CC02 (owl, light) = unit colour; arc covers about a third at "Lesson 3 of 6" | learn-light-default path (#1256) r=[612,303,49,68] |
| progress ring end cap | fill | #FFFFFF (snow, light) | learn-light-default circle (#1255) |
| START bubble | bg / border / text | #FFFFFF (snow) / #E5E5E5 (swan) / #58CC02 (owl) | learn-light-default _27IMa; css:path-e50cab6b.css ._27IMa |
| jump tooltip | bg / border / text | #FFFFFF (snow) / #E5E5E5 (swan) / #FF9600 (fox) | learn-light-default TOHdU (#1344) |

Type:

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| START / JUMP HERE? bubble | font | 700 17px/17px uppercase, letter-spacing 0.51px (0.03em), nowrap | learn-dark-default (#1239, #1322); css:path-e50cab6b.css ._27IMa, .TOHdU |

Node icons:

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| skill, current | src | https://d35aaqx5ub95lt.cloudfront.net/images/path/icons/ef9c771afdb674f0ff82fae25c6a7b0a.svg (star, white) | learn-dark-default #1237; learn-light-default #1259 |
| skill / alphabet / practice, completed | src | https://d35aaqx5ub95lt.cloudfront.net/images/path/icons/bfa591f6854b4de08e1656b3e8ca084f.svg (check) | learn-dark-default #577 and others |
| story, completed | src | https://d35aaqx5ub95lt.cloudfront.net/images/path/icons/7aa61c3f60bd961a60a46fb36e76c72f.svg (open book) | learn-dark-default #581 child |
| unit_review, completed ("Level up Unit N to Legendary") | src | https://d35aaqx5ub95lt.cloudfront.net/images/path/icons/44fdc5acd4cc2644f6c8329939446b42.svg | learn-dark-default #729 child |
| duo_radio, completed | src | inline svg 36x35 (headphones: white band, cups in the unit radio colour) | learn-dark-default span._1B6UH (#595); icons-_learn.json svg[1] |
| skill locked (also used on two locked practice nodes) | src | dark https://d35aaqx5ub95lt.cloudfront.net/images/path/icons/cbb0e971ac10030a120848c71c419892.svg; light https://d35aaqx5ub95lt.cloudfront.net/images/path/icons/ddd21f172a2db0f5ef169c09b4d3badb.svg | learn-dark-default #1264, #1294; learn-light-default #1286, #1316 |
| story locked | src | dark https://d35aaqx5ub95lt.cloudfront.net/images/path/icons/3ea75bf2164eed9218a7163be002af82.svg; light https://d35aaqx5ub95lt.cloudfront.net/images/path/icons/9f3118f48729b85c884b43f81a24e0ab.svg | learn-dark-default #1245; learn-light-default #1267 |
| duo_radio locked | src | dark https://d35aaqx5ub95lt.cloudfront.net/images/path/icons/3281d1a66ea41cbeddfb4128f163b3f2.svg; light https://d35aaqx5ub95lt.cloudfront.net/images/path/icons/f5d7269148d87e945a139254e4477a5e.svg | learn-dark-default #1250; learn-light-default #1272 |
| alphabet locked | src | dark https://d35aaqx5ub95lt.cloudfront.net/images/path/icons/8f184f527d34439480a2eb55b4239c35.svg; light https://d35aaqx5ub95lt.cloudfront.net/images/path/icons/83b364518b1f2014a78a14f8058298af.svg | learn-dark-default #1255; learn-light-default #1277 |
| practice locked | src | dark https://d35aaqx5ub95lt.cloudfront.net/images/path/icons/7ebf5ec1643d186b7edb283966329b2f.svg; light https://d35aaqx5ub95lt.cloudfront.net/images/path/icons/09f58d40e31d28e089395af4c54d0c20.svg | learn-dark-default #1284; learn-light-default #1306 |
| unit_review locked | src | dark https://d35aaqx5ub95lt.cloudfront.net/images/path/icons/f4b1c683214cf55f5ddea4535b983745.svg; light https://d35aaqx5ub95lt.cloudfront.net/images/path/icons/7d84afaa096ff1f1d3f8c86d6c2c9542.svg | learn-dark-default #1303; learn-light-default #1325 |
| unit test / jump | src | https://d35aaqx5ub95lt.cloudfront.net/images/path/icons/5e4203031e39fc43d94371565fd0d369.svg | learn-dark-default #1319; learn-light-default #1341 |
| chest locked | src | dark https://d35aaqx5ub95lt.cloudfront.net/images/path/0ae912c0b7a66354a850e6733ef653cb.svg; light .../images/path/b841637c196f5be786d8b8578a42ffbf.svg | learn-dark-default #1258; learn-light-default #1280 |
| chest opened (completed unit) | src | https://d35aaqx5ub95lt.cloudfront.net/images/path/8e1b4675455a4e453aac3681e0f5599e.svg (both themes) | learn-dark-default #669; learn-light-default #678 |

Unit colour families:

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| per unit colour | face / shine / radio icon / mobile-header lip | macaw: #1CB0F6 / bea-junior-shine #43BEF8 / bea-radio #147BAC / bea-secondary #1899D6; owl: #58CC02 / duo-shine #72D627 / duo-radio #3E8F01 / tree-frog-always-light #58A700; cardinal: #FF4B4B / eddy-shine #FF6969 / eddy-radio #B33535 / eddy-secondary #EA2B2B; grizzly-lite: #DC8F47 / falstaff-shine #E3A56C / falstaff-radio #834F33 / falstaff-secondary #965A3A; beetle: #CE82FF / lily-shine #D696FF / lily-radio #905BB3 / lily-secondary #A568CC; fox: #FF9600 / lin-lucy-shine #FFA82C / lin-lucy-radio #B36900 / guinea-pig-always-light #CD7900; peacock: #00CD9C / oscar-shine #3FD9B5 / oscar-radio #00906D / oscar-secondary #00A47D; dragon: #CC348D / vikram-shine #D65AA2 / vikram-radio #8F2463 / vikram-secondary #A32A71; starfish: #FF86D0 / zari-shine #FF9ED9 / zari-radio #B35E92 / zari-secondary #CC6BA6 | css:path-e50cab6b.css: unit classes (._2hQt4 ... ._2_zd7), shine classes (.nboUl ... ._3aYNQ), radio classes (._7lILJ ... ._2GiEE), secondary classes (._3TE__ ... ._43NnU). Pairing inferred from matching rule order; captured pairs: macaw/_25i8d/_1-7MG, starfish/_3aYNQ/_2GiEE, owl/_3y0yK |

Contains: popover shell (START bubble, JUMP HERE? tooltip)
Desktop vs mobile: Same node size, offsets (0, 44.884, 70) and vertical gaps on mobile (learn-dark-mobile #466-#623: identical wrapper left/margin-top values); only the column is wider (570px).
Crops: [path-node-dark](crops/path-node-dark.png) · [path-node-light](crops/path-node-light.png) · [path-node--completed-dark](crops/path-node--completed-dark.png) · [path-node--completed-light](crops/path-node--completed-light.png) · [path-node--hover-dark](crops/path-node--hover-dark.png)
Gaps: Legendary node (_2ucCV) not present in any dump; CSS only.; Active/pressed state not captured; CSS only.; No dump shows the progress arc in dark theme (dark was at Lesson 1 of 6).; Icon image dumps/icons-_learn.json lists .../images/path/5b531828e59ae83aadb3d88e6b3a98a8.svg, which no dump node references.; Unit colours other than owl, macaw, starfish, fox and cardinal were not captured on nodes.; Icon descriptions (star, check, book, trophy) are read from the screenshots, not from the files.
Notes: Node colours use *-always-light palette names, so a completed or current node looks the same in both themes; only locked faces, icons, ring track and bubbles change with theme.

### Node popover
Where: /learn, opens under a clicked node: div._3zpnU._3OfAS._1o3g5._2dBq4._27rki > div._36bu_._3RP1Q

Anatomy:
- popover shell (generic) 295px wide, below the node
- arrow (20x10 clip with a rotated 20x20 square) at the top, aimed at the node
- title (h1.QPQgr)
- subtitle (p._21efi): "Lesson x of y", kanji list, or "Complete all levels above to unlock this!"
- full-width action button: START +10 XP / REVIEW +5 XP / LOCKED (disabled)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| shell | width x height | 295 x 151px (current, completed); 295 x 182px (locked) | learn-dark-node-popover cl=_36bu_ _3RP1Q _1Fbw- (#1239); learn-dark-locked-popover (#1270) |
| shell | padding / radius | 16px / 15px | learn-dark-node-popover (#1239); css:path-e50cab6b.css ._3RP1Q |
| shell | offset from node | margin-top 12px below the node (arrow overlaps 8px); horizontal translate centres the shell on the column (-147.5px for the centre node, -192.384px for the node at +44.884, -102.616px for a node at -44.884) | learn-dark-node-popover (#1238); learn-dark-locked-popover (#1269); learn-dark-completed-popover (#1428) |
| arrow | size / radius | 20 x 10px clip, inner square 20x20 rotated 45deg, radius 2px; margin 0 15px (popover radius var) | learn-dark-node-popover _3T97b (#1245), _1TMn5 (#1246); css:4779-c36ad395.css ._37pE2>._3T97b |
| title | box | 263 x 27px | learn-dark-node-popover QPQgr (#1242) |
| button | width x height | 263 x 50px (min-height 50), margin-top 16px (8px in locked), padding 8px 16px, radius 16px, border-bottom 4px lip | learn-dark-node-popover dt="skill-path-state-active skill-path-unit-test-81" (#1244); css:path-e50cab6b.css ._2sYfM |

| State | What changes | Source |
| --- | --- | --- |
| current | unit-colour shell, "Lesson 1 of 6", START +10 XP (dt skill-path-state-active) | captured: learn-dark-node-popover, learn-light-node-popover |
| completed | unit-colour shell, subtitle lists the kanji, REVIEW +5 XP (dt skill-path-state-passed) | captured: learn-dark-completed-popover, learn-light-completed-popover |
| locked | grey shell with swan border, "Complete all levels above to unlock this!", disabled LOCKED button (class _2wryV, transform translateY(4px)) | captured: learn-dark-locked-popover, learn-light-locked-popover; css:4779-c36ad395.css ._1VYyp._2wryV:not(._3fmUm) |
| button hover | filter brightness(1.1) | captured: learn-dark-popover-button-hover #1256 vs learn-dark-node-popover #1244; css:4779-c36ad395.css ._1VYyp:hover:not(._2wryV):not(.ypJiL) |
| button active | translateY(lip 4px), ::before box-shadow none | css:4779-c36ad395.css ._1VYyp:active:not(._2wryV) |
| legendary | gold variant: button text bee (.asTDB .PbV1v), badge guinea-pig on bee (.asTDB .g3Q9-) | css:path-e50cab6b.css .asTDB .PbV1v, .asTDB .g3Q9- (not captured) |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| current shell + arrow | background | #58CC02 (owl-always-light) = unit colour; no border (_1Fbw- border 0) | learn-dark-node-popover (#1239, #1246); css:path-e50cab6b.css ._1Fbw- |
| completed shell | background | #FF86D0 (starfish) = unit colour | learn-dark-completed-popover (#1429) |
| shell text | colour | #FFFFFF (snow-always-light) | learn-dark-node-popover (#1239) |
| START / REVIEW button | face / text / lip | face #FFFFFF (snow-always-light); text = unit colour (#58CC02 owl / #FF86D0 starfish); lip #FFFFFF @0.70 | learn-dark-node-popover (#1244) ::before; learn-dark-completed-popover (#1434); css:app-f2ef02f8.css ._19ped; css:path-e50cab6b.css ._2yBgn .PbV1v |
| locked shell + arrow | bg / border / text | #202F36 (polar, dark) / 2px #37464F (swan) / #52656D (hare) | learn-dark-locked-popover _2txMY (#1270, #1278); css:path-e50cab6b.css ._2txMY |
| LOCKED button | face / text | #37464F (swan) / #52656D (hare); no lip (pushed down 4px) | learn-dark-locked-popover dt=skill-path-level-locked-button (#1275) |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| current shell + arrow | background | #58CC02 (owl, light) | learn-light-node-popover (#1249, #1256) |
| completed shell | background | #FF86D0 (starfish, light) | learn-light-completed-popover (#1438) |
| shell text | colour | #FFFFFF (snow, light) | learn-light-node-popover (#1249) |
| START / REVIEW button | face / text / lip | #FFFFFF / unit colour / #FFFFFF @0.70 | learn-light-node-popover (#1254); learn-light-completed-popover (#1443) |
| locked shell + arrow | bg / border / text | #F7F7F7 (polar, light) / 2px #E5E5E5 (swan) / #AFAFAF (hare) | learn-light-locked-popover (#1268, #1276) |
| LOCKED button | face / text | #E5E5E5 (swan) / #AFAFAF (hare) | learn-light-locked-popover (#1273) |

Type:

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| title | font | 700 19px/26.6px, left aligned | learn-dark-node-popover QPQgr (#1242); css:path-e50cab6b.css .QPQgr |
| subtitle | font | 500 17px/26.6px (locked: 19px, margin-top 8px) | css:path-e50cab6b.css ._21efi, ._3WUdw ._21efi; learn-dark-locked-popover (#1274) |
| button label | font | 700 15px/18px uppercase, letter-spacing 0.8px | learn-dark-node-popover (#1244) |

Contains: popover shell, button: white (snow-always-light, _19ped), button: disabled
Desktop vs mobile: No mobile popover dump.
Crops: [node-popover-dark](crops/node-popover-dark.png) · [node-popover-light](crops/node-popover-light.png) · [node-popover--locked-dark](crops/node-popover--locked-dark.png) · [node-popover--locked-light](crops/node-popover--locked-light.png) · [node-popover--completed-dark](crops/node-popover--completed-dark.png) · [node-popover--completed-light](crops/node-popover--completed-light.png) · [node-popover--button-hover-dark](crops/node-popover--button-hover-dark.png)
Gaps: Mobile popover not captured.; Legendary and chest popovers not captured.; Open/close animation not captured.
Notes: The shell width class _27rki fixes 295px; _2GujK (343px) and _196gn (max 295px) exist for other popover variants.

### Path character
Where: /learn, div._3jOjF (position absolute) inside each unit's node column div._2QaYj

Anatomy:
- absolute box on the left or right half of the column
- animated lottie svg (span.u_TP-) for units reached so far, or a static img (pathCharacters/dark/*.svg in dark, pathCharacters/locked/*.svg in light) for units ahead

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| box | width x height | 243 x 236px at a 480 column; 299 x 236 at 592; 288 x 236 on mobile 570 (width = half the 16px-padded column + 19px); some lottie boxes 261px tall | learn-dark-default cl=_3jOjF (#1187); learn-light-default (#1196); learn-dark-mobile (#1081); learn-dark-default (#443) |
| box | horizontal position | left 16px / right 221px, or left 221px / right 16px (alternates each time) | learn-dark-default #1187, #1225, #1227 |
| box | vertical position | top set per row, then translateY(-117.879px) (half of 236; -130.379 for 261) so the box centres on the row of the node that swings to the opposite side at offset +-70 | learn-dark-default #1187 (centre y 526) vs node dt=skill-path-level-2 (#1250, centre y 525.5) |
| placement | count per unit | 3 characters per unit, sides alternate L, R, L (unit 80 starts R) | learn-dark-default #1187/#1225/#1227; #741/#839/#913 |

| State | What changes | Source |
| --- | --- | --- |
| reached vs ahead | reached units: animated lottie svg in colour; units ahead: flat greyed img | captured: learn-dark-default #1187 (lottie) vs #1225 (img) |
| popover hover interplay | lottie paths re-pose while the popover is open (animation frames differ) | captured: learn-dark-popover-button-hover vs learn-dark-node-popover (#1191-#1236 transforms) |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| ahead-of-learner art | src | https://d35aaqx5ub95lt.cloudfront.net/images/pathCharacters/dark/05164af290313e637e51f5a30c472e96.svg (and f8fa7904..., 7a6f4cca..., 24b858c7...) | learn-dark-default img (#1226, #1228, #1312, #1314) |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| ahead-of-learner art | src | https://d35aaqx5ub95lt.cloudfront.net/images/pathCharacters/locked/905c171ee1863bfa3cfff749ce7b0fda.svg (and 40203307..., 9ebf7d48..., 79487c03...) | learn-light-default img (#1247, #1249) |

Contains: none
Desktop vs mobile: Same rule on mobile; the box widens to 288px because the column is 570px (learn-dark-mobile #1081).
Crops: [path-character-dark](crops/path-character-dark.png) · [path-character-light](crops/path-character-light.png)
Gaps: Lottie animation timing is not in the dumps.
Notes: Characters sit behind the nodes (absolute, no z-index) and never overlap the zig-zag because each is centred on the row where the path swings furthest the other way.

### Go to current unit button
Where: /learn, button[aria-label="Go to current unit"] cl=_2V6ug _1ursp _7jW2t _2dnkd _1KSEa eAlyQ _2El3L _3AJpR

Anatomy:
- square secondary button, sticky to the bottom right of the path column
- arrow icon 18x20: points up when the current unit is above, rotated 180deg (_3wVBw) when it is below

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| button | width x height | 52 x 52px | learn-dark-completed-unit (#1668); css:path-e50cab6b.css ._2dnkd |
| button | border / radius | 2px sides and top, 4px bottom; radius 16px; ::before inset -2px with 2px border and 0 2px lip | learn-dark-completed-unit (#1668) |
| button | position | sticky, bottom 24px (>=700px; 98px on mobile), right edge on the column edge (x 708-760 in a 280-760 column) | learn-dark-completed-unit (#1668); css:path-e50cab6b.css ._2El3L |
| icon | size | 18 x 20px | learn-dark-completed-unit img cl=_3wVBw _1FKvm (#1669); css:path-e50cab6b.css ._1FKvm |

| State | What changes | Source |
| --- | --- | --- |
| current unit below | icon rotated 180deg (class _3wVBw) | captured: learn-dark-completed-unit #1669 |
| current unit above | icon upright | captured: learn-dark-path-end #467 |
| hover | filter brightness(0.9) | css:4779-c36ad395.css ._2V6ug:hover:not(._2wryV):not(.ypJiL) (default --__internal__filter-hover) |
| active | translateY(2px), lip removed | css:4779-c36ad395.css ._2V6ug:active:not(._2wryV) |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| face | background | #131F24 (snow, dark) | learn-dark-completed-unit (#1668) ::before |
| border + lip | colour | #37464F (swan, dark) | learn-dark-completed-unit (#1668) ::before |
| icon | src | https://d35aaqx5ub95lt.cloudfront.net/images/path/icons/6a4aeae39e2054b3d9a33cc8e5a05816.svg (blue arrow) | learn-dark-path-end (#467) |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| face | background | #FFFFFF (snow, light) | learn-light-completed-unit (#1659) ::before |
| border + lip | colour | #E5E5E5 (swan, light) | learn-light-completed-unit (#1659) ::before |
| icon | src | same arrow svg | learn-light-path-end (#477) |

Contains: button: secondary (icon-only)
Desktop vs mobile: Mobile: bottom 98px (clears the tab bar) and a 16px side margin (--fab-margin-horizontal); the mobile dump does not contain it (captured at the current unit), the mobile screenshot shows it at bottom right.
Crops: [jump-to-current-dark](crops/jump-to-current-dark.png) · [jump-to-current-light](crops/jump-to-current-light.png) · [jump-to-current--up-dark](crops/jump-to-current--up-dark.png)
Gaps: Hover not captured: learn-dark-secondary-button-hover hovers the JUMP HERE? button, not this one.; Mobile instance not in any dump.

### Section end card
Where: /learn, after the last unit of the section: div._1wgqa

Anatomy:
- outlined card
- UP NEXT pill
- lock icon + "Section 5" title
- description
- full-width JUMP HERE? secondary button

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| card | width x height | 480 x 295px (592 at 1384 viewport) | learn-dark-path-end cl=_1wgqa (#468); learn-light-path-end (#478) |
| card | padding / margin-top | 36px 30px / 80px | learn-dark-path-end (#468) |
| card | border / radius | 2px / 16px | learn-dark-path-end (#468) |
| content | max-width | 310px, centred | learn-dark-path-end cl=_3M4Dc (#469) |
| UP NEXT pill | size / padding / radius | 74 x 26px, padding 4px 8px, radius 6px, margin-bottom 16px | learn-dark-path-end cl=_1Qswf _3LDH7 (#470) |
| lock icon | size | 21 x 25px, margin-right 12px | learn-dark-path-end img cl=_3kRS5 (#472) |
| title row | margin-bottom | 13px | learn-dark-path-end cl=_3iRHZ (#471) |
| description | margin-bottom | 24px | learn-dark-path-end cl=_3czy6 (#474) |
| button | width x height / radius | 416 x 50px (528 at 592 card), radius 16px, border 2/4px | learn-dark-path-end cl=_3xDVI _2V6ug _1jUqO (#475) |

| State | What changes | Source |
| --- | --- | --- |
| button hover | filter brightness(0.9) | captured: learn-dark-secondary-button-hover #475 vs learn-dark-path-end #475 |
| button active | translateY(2px), lip removed | css:4779-c36ad395.css ._2V6ug:active:not(._2wryV) |
| unlocked (next section available) | pill uses ._3LDH7 alone (iguana/macaw); card may take ._3ZBbM polar background | css:path-e50cab6b.css ._3LDH7, ._3ZBbM (not captured) |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| card | border | #37464F (swan, dark); background transparent | learn-dark-path-end (#468) |
| UP NEXT pill (locked) | bg / text | #37464F (swan) / #52656D (hare) | learn-dark-path-end (#470); css:path-e50cab6b.css ._1Qswf |
| title | colour | #DCE6EC (wolf, dark) | learn-dark-path-end _1YutV (#473) |
| description | colour | #52656D (hare, dark) | learn-dark-path-end _3czy6 (#474) |
| button | face / border+lip / text | #131F24 (snow) / #37464F (swan) / #49C0F8 (macaw, dark) | learn-dark-path-end (#475) ::before |
| lock icon | src | https://d35aaqx5ub95lt.cloudfront.net/images/path/icons/9df8cee6fe91d35859cc7013d23e5d77.svg | learn-dark-path-end (#472) |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| card | border | #E5E5E5 (swan, light) | learn-light-path-end (#478) |
| UP NEXT pill (locked) | bg / text | #E5E5E5 (swan) / #AFAFAF (hare) | learn-light-path-end (#480) |
| title | colour | #777777 (wolf, light) | learn-light-path-end (#483) |
| description | colour | #AFAFAF (hare, light) | learn-light-path-end (#484) |
| button | face / border+lip / text | #FFFFFF (snow) / #E5E5E5 (swan) / #1CB0F6 (macaw, light) | learn-light-path-end (#485) ::before |
| lock icon | src | https://d35aaqx5ub95lt.cloudfront.net/images/path/icons/42790390eb3178780c3620661860e84b.svg | learn-light-path-end (#482) |
| UP NEXT pill (unlocked, CSS) | bg / text | #DDF4FF (iguana-always-light) / macaw #1CB0F6 L, #49C0F8 D | css:path-e50cab6b.css ._3LDH7 (not captured) |

Type:

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| UP NEXT | font | 700 15px/18px uppercase, letter-spacing 0.6px (0.04em) | learn-dark-path-end (#470) |
| title | font | 700 25px/32px | learn-dark-path-end (#473) |
| description | font | 19px/29px (weight from body, 500) | learn-dark-path-end (#474) |
| button | font | 700 15px/18px uppercase, letter-spacing 0.8px | learn-dark-path-end (#475) |

Contains: button: secondary (full width), badge/pill
Desktop vs mobile: No mobile capture of the path end.
Crops: [section-end-card-dark](crops/section-end-card-dark.png) · [section-end-card-light](crops/section-end-card-light.png) · [section-end-card--button-hover-dark](crops/section-end-card--button-hover-dark.png)
Gaps: Card bottom (y 797-835) is below the viewport in both screenshots; crops cut 38px of the bottom padding.; Unlocked variant not captured.; Mobile not captured.

### Section card (sections page)
Where: /sections, div.JTQLF (grid, gap 16px) of div._3AIkT cards: completed ._2UWvP, in progress ._1pT8b._2E1uv, locked ._36wSS._2E1uv

Anatomy:
- card (radius 16, padding 0 24, grid 1fr + min-content)
- CEFR link button "A1 • SEE DETAILS"
- section title
- status row: check icon + COMPLETED! / progress bar + trophy / lock icon + "260 UNITS"
- action: REVIEW (completed, right column), CONTINUE (in progress), JUMP TO SECTION N (locked)
- in progress and locked: right column with speech bubble (ruby Japanese text) and character art

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| list | gap | 16px | sections-dark-default cl=JTQLF (#153); css:pathSections-c1a583d8.css .JTQLF |
| completed card | width x height | 516 x 161px (592 wide at 1384) | sections-dark-default cl=_2UWvP _3AIkT (#158); sections-light-default (#167) |
| in-progress card | width x height | 516 x 311px | sections-dark-default cl=_1pT8b _2E1uv _3AIkT (#191) |
| locked card | width x height | 516 x 265-346px (content dependent) | sections-dark-default #234-#403 |
| card | radius / padding | 16px / 0 24px; two-column cards: columns 1fr 1fr, gap 26px | sections-dark-default (#158, #191); css:pathSections-c1a583d8.css ._3AIkT, ._2E1uv |
| left column | padding | 21px 0 | sections-dark-default cl=CQzMM (#159) |
| SEE DETAILS button | height | 48px (line-height 44, border 1/5px) | sections-dark-default cl=_2rQ98 _1GQxS (#160) |
| title | margin-bottom | 15px | sections-dark-default h1 cl=_39RQh (#162) |
| status icon | size | 16 x 17px (check), 13 x 16px (lock); margin-right 8px / 5px | sections-dark-default _6wAz8 (#164), _2cmY1 (#238) |
| REVIEW button | width x height / radius | 90 x 50px / 12px | sections-dark-default cl=_3xDVI _2V6ug _2izhP (#167) |
| progress bar | width x height / radius | 178 x 18px (254 at 1384), radius 9px; top highlight strip 3px tall, inset 5px, radius 9999, white @0.2 | sections-dark-default role=progressbar (#197), _3yKMC (#198), _1EFTr (#202) |
| trophy | size | 37 x 36px, overlapping the bar end (left calc(100% - 30px), top -8px) | sections-dark-default _320PF (#205); css:pathSections-c1a583d8.css ._320PF |
| CONTINUE button | width x height / margin-top | 178 x 50px, radius 12px, margin-top 24px | sections-dark-default cl=_3_XLT _3RMj4 (#210) |
| speech bubble | width / radius / padding | 264px, radius 16px, padding 28px 16px 16px; tail img 23 x 24px | sections-dark-default _2NZrx (#214), O93KC (#215), _3moA6 (#232) |
| character | size | 128 x 136px (varies per section, e.g. 139x146, 170x200) | sections-dark-default img _1XMGl (#233), OjEbD (#264), oNIUa (#413) |

| State | What changes | Source |
| --- | --- | --- |
| completed | striped snow card with swan border, COMPLETED! row, REVIEW button | captured: sections-dark-default #158-#189 |
| in progress | iguana card, progress bar with trophy, CONTINUE button, speech bubble + character | captured: sections-dark-default #191-#233 |
| locked | polar card, muted text, unit count with lock, JUMP TO SECTION N button, bordered bubble (light) | captured: sections-dark-default #234-#413 |
| button hover | secondary buttons brightness(0.9); CONTINUE (primary style) brightness per generic button | css:4779-c36ad395.css ._2V6ug:hover (not captured) |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| completed card | background | #131F24 (snow) with diagonal stripes #202F36 (polar) at 136deg, bands 10-40% and 53-71% | sections-dark-default (#158); css:pathSections-c1a583d8.css ._2UWvP |
| completed card | border | 2px #37464F (swan, dark) | sections-dark-default (#158) |
| COMPLETED! label | colour | #58CC02 (owl-always-light), opacity 1 | sections-dark-default _1tBwZ (#165) |
| SEE DETAILS / REVIEW text | colour | #49C0F8 (macaw, dark) | sections-dark-default (#160, #167) |
| REVIEW button | face / border+lip | #131F24 (snow) / #37464F (swan) | sections-dark-default (#167) ::before |
| in-progress card | background | #202F36 (iguana, dark); no border | sections-dark-default (#191); css:pathSections-c1a583d8.css ._1pT8b |
| progress bar | track / fill | #131F24 (snow) / #93D333 (owl, dark); label #AFAFAF (hare-always-light) on track, #131F24 on fill | sections-dark-default (#198, #200, #199, #203) |
| trophy | colour | #37464F (swan, dark) | sections-dark-default _320PF (#205); css:pathSections-c1a583d8.css html[data-duo-theme=dark] ._320PF |
| CONTINUE button | face / lip / text | #1CB0F6 (macaw-always-light) / #1CB0F6 @0.70 / #FFFFFF | sections-dark-default (#210) ::before; css:pathSections-c1a583d8.css ._3_XLT |
| speech bubble | bg / text / furigana | #131F24 (snow) / eel #F1F7FB (css) / #52656D (hare) | sections-dark-default _2NZrx (#214), rt (#218); css:pathSections-c1a583d8.css .O93KC |
| locked card | bg / text | #202F36 (polar) / #52656D (dark-mode-locked-path-section-text-color) | sections-dark-default _36wSS (#234); css:pathSections-c1a583d8.css html[data-duo-theme=dark] ._36wSS |
| locked JUMP TO SECTION button | face / border / text | #131F24 / #37464F / #49C0F8 (macaw) | sections-dark-default (#241) |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| completed card | background | #FFFFFF (snow) with stripes #F7F7F7 (polar) | sections-light-default (#167) |
| completed card | border | 2px #E5E5E5 (swan, light) | sections-light-default (#167) |
| COMPLETED! label | colour | #58CC02 (owl, light) | sections-light-default (#174) |
| SEE DETAILS / REVIEW text | colour | #1CB0F6 (macaw, light) | sections-light-default (#169, #176) |
| REVIEW button | face / border+lip | #FFFFFF / #E5E5E5 | sections-light-default (#176) ::before |
| in-progress card | background | #DDF4FF (iguana, light) | sections-light-default (#200) |
| progress bar | track / fill | #FFFFFF (snow) / #58CC02 (owl); label #AFAFAF on track, #FFFFFF on fill | sections-light-default (#207, #209, #208, #212) |
| CONTINUE button | face / lip / text | #1CB0F6 / #1CB0F6 @0.70 / #FFFFFF | sections-light-default (#221) |
| speech bubble | bg / border | #FFFFFF; locked cards add 2px #E5E5E5 border (Un2ta) | sections-light-default (#225, #256) |
| locked card | bg / text | #F7F7F7 (polar) / #777777 (wolf) | sections-light-default (#245) |

Type:

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| SEE DETAILS | font | 700 16px/44px uppercase, letter-spacing 0.64px | sections-dark-default (#160) |
| title | font | 700 25px/34px | sections-dark-default _39RQh (#162) |
| status label | font | 700 15px/18px uppercase, letter-spacing 0.6px (locked: opacity 0.7) | sections-dark-default _1tBwZ (#165, #239) |
| progress % | font | 700 14px/18px uppercase, letter-spacing 0.56px | sections-dark-default (#199) |
| speech bubble | font | 20px/28px; furigana 16px/24px | sections-dark-default O93KC (#215), rt (#218) |
| title colour (completed, in progress) | colour | inherits body text (black-text #F1F7FB dark / #3C3C3C light); not recorded in the dump (estimated) | css:app-f2ef02f8.css body |

Contains: button: secondary, button: primary (macaw), progress bar, speech bubble
Desktop vs mobile: CSS only: below 700px the completed card gets 16px side margins (._2UWvP @media (max-width:699px)); no mobile dump of /sections.
Crops: [section-card-dark](crops/section-card-dark.png) · [section-card-light](crops/section-card-light.png)
Gaps: In-progress card is cut at the viewport bottom (797) in both screenshots; locked cards are off screen, so no crop shows them.; No mobile capture of /sections.; Hover states not captured.; Title colour on completed/in-progress cards is not recorded in the dump.
Notes: CEFR-tier colours for other courses (rookie, explorer, traveler, ... champion) exist in css:pathSections-c1a583d8.css but were not used here.

## Lesson screen

### Lesson top bar
Where: /lesson, header row (cl=wqSzE > _3v4ux > _18N2Q _1zcW8): dt=quit-button, settings button, role=progressbar, hearts

Anatomy:
- row: grid min-content | min-content | 1fr | min-content, gap 24px
- close X (dt=quit-button, 18x18 img)
- settings gear (22x22 background-image button)
- progress bar: track, fill (clip-path to value), secondary inner fill (bee), highlight stripe
- hearts: 32x32 heart img + count

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| header row | height | 100px (grid-template-rows 100px 1fr 140px) | css:1584-b289a3ce.css ._29gfw @media (min-width:700px) |
| header inner | padding / max-width | 50px 40px 0 / 1080px, centred | lesson-light-challenge-default cl=_3v4ux (#5); css:1584-b289a3ce.css ._3v4ux |
| row | width x height, gap | 1000 x 32px, column gap 24px | lesson-light-challenge-default cl=_18N2Q _1zcW8 (#6) |
| close X | size | 18 x 18px (img src images/df223d5b9feb8017b323ed21103eb5ac.svg) | lesson-dark-challenge-default dt=quit-button (#7, #8) |
| settings gear | size | 22 x 22px, background-size cover | lesson-light-challenge-default cl=_2VEsk (#9); css:1584-b289a3ce.css ._2VEsk |
| progress track | width x height, radius | 840 x 16px, radius 8px (height/2) | lesson-light-challenge-default cl=_3yKMC (#11) |
| progress fill | min width | 24px (1.5 x bar height); visible width = value, e.g. 98px at LCD | lesson-light-challenge-default cl=_27NV6 (#12), cl=_345XU (#15) |
| progress fill | mechanism | full-width layer clipped by clip-path inset(0 calc(100% - value) 0 0 round 8px); transition background, color, opacity, clip-path 0.4s | css:4779-c36ad395.css ._27NV6 |
| highlight stripe | size / offset | height 3px (30% of bar), top 25% (4px), left 4px (height/4), width = value - 8px, radius 9999px | lesson-light-challenge-default cl=_1EFTr (#14) r=[284,62,90,3]; css:4779-c36ad395.css ._1EFTr |
| hearts | layout | flex, gap 5px; img 32 x 32px; count 8 x 20px, margin-left 3px | lesson-light-challenge-default cl=_3ww7z (#16), _14S2e (#17), _28aeG _c4M- (#18) |

| State | What changes | Source |
| --- | --- | --- |
| progress 0 | fill and _345XU at opacity 0, min width 24px | captured:lesson-dark-challenge-default #12, #14 |
| combo streak | fill turns fox (dark #FFAB33, light #FF9600); colour set inline, 0.4s transition | captured:lesson-dark-listen-default #12 and lesson-light-match-default #12 |
| bee fill | fill bee (#FFC700 dark); the only CSS that sets it is ._1YnbS | captured:lesson-dark-match-default #12; css:4358-6896adab.css ._1YnbS |
| close X hover | filter brightness(1.1) | css:4779-c36ad395.css ._1gEmM:hover:not(._2wryV):not(.ypJiL) @media (hover:hover) |
| gear hover | filter brightness(1.1) | css:app-f2ef02f8.css ._1saKQ:hover:not(:disabled) @media (hover:hover) |
| heart lost | heart img and count pulse: scale 1 > 0.6 > 1 over 0.5s (_3EWlf) | captured:lesson-dark-choice-default cl=_14S2e _2eSg8 (#17, #18); css:2634-6b22725c.css ._2eSg8 |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| track | background | #37464F (swan, dark) | lesson-dark-choice-default cl=_3yKMC (#11) |
| fill (default) | background | #93D333 (owl, dark) | lesson-dark-choice-default cl=_27NV6 (#12) |
| fill (combo streak) | background | #FFAB33 (fox, dark) | lesson-dark-listen-default cl=_27NV6 (#12); also lesson-dark-dialogue-default, lesson-dark-previous-mistake |
| fill (bee) | background | #FFC700 (bee, dark) | lesson-dark-match-default cl=_27NV6 (#12); css:4358-6896adab.css ._1YnbS {--web-ui_progress-bar-color: bee} |
| secondary inner fill | background | #FFC700 (bee, dark), clipped to inner value (0 in every capture) | lesson-dark-challenge-default cl=_1qzJe _27NV6 (#13) |
| highlight stripe | background | #FFFFFF (snow-always-light) @ opacity 0.2 | lesson-dark-choice-default cl=_1EFTr (#14) |
| hearts count | color | #EE5555 (cardinal, dark) | lesson-dark-challenge-default cl=_28aeG (#25) |
| settings gear | image | images/bdab870a9c5acfc2e89f73316ce5ac06.svg | css:1584-b289a3ce.css html[data-duo-theme=dark] ._2VEsk |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| track | background | #E5E5E5 (swan, light) | lesson-light-challenge-default cl=_3yKMC (#11) |
| fill (default) | background | #58CC02 (owl, light) | lesson-light-challenge-default cl=_27NV6 (#12) |
| fill (combo streak) | background | #FF9600 (fox, light) | lesson-light-match-default cl=_27NV6 (#12) |
| secondary inner fill | background | #FFC800 (bee, light) | lesson-light-challenge-default cl=_1qzJe _27NV6 (#13) |
| highlight stripe | background | #FFFFFF (snow-always-light) @ opacity 0.2 | lesson-light-challenge-default cl=_1EFTr (#14) |
| hearts count | color | #FF4B4B (cardinal, light) | lesson-light-challenge-default cl=_28aeG (#18) |
| settings gear | image | images/4f9f726081167f96137117883812c434.svg | css:1584-b289a3ce.css ._2VEsk |

Type: hearts count: duolingo-sans 700 17px/20px (body size, inherited) (css:app-f2ef02f8.css body {font:500 17px/20px}; css:2634-6b22725c.css ._c4M- {font-weight:700}; css:app-f2ef02f8.css * {font-family:duolingo-sans,sans-serif})

Contains: none

Desktop vs mobile: Below 700px: row gap 20px instead of 24px (css:1584-b289a3ce.css ._1zcW8), the 50px 40px top padding is dropped (css:1584-b289a3ce.css ._3v4ux @media (min-width:700px)) and the lesson grid gets padding 24px 16px with rows min-content 1fr min-content (css:1584-b289a3ce.css ._2G9ED, ._29gfw). 700px+ with max-height 650px: top padding 40px, header row 90px. No mobile lesson dump exists.

Crops: [dark](crops/lesson-top-bar-dark.png) · [light](crops/lesson-top-bar-light.png) · [combo-light](crops/lesson-top-bar--combo-light.png) · [bee-dark](crops/lesson-top-bar--bee-dark.png)

Gaps: Progress bar height (16px) comes from an inline --__internal__progress-bar-height; no CSS rule sets it. What triggers bee versus fox fill is not recorded; both captured only as inline colours. Light bee fill not captured. Settings gear hover not captured, only CSS.

Notes: Dark captures at 1200px place the row at x=100; 1384px captures at x=192. Widths are identical.

### Challenge header and badges
Where: /lesson, cl=U41Ye: badge cl=w2K8w + h1 dt=challenge-header

Anatomy:
- badge (optional): 32x32 icon + uppercase label
- title h1 ("Write this in English")

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| stack | gap | 8px between badge and title | lesson-dark-tile-hover cl=U41Ye (#31); css:4358-6896adab.css .U41Ye |
| badge | width x height | 600 x 32px (inline-flex, align center) | lesson-dark-tile-hover cl=w2K8w (#32) |
| badge icon | box / glyph | 32 x 32px span, margin-inline-end 4px; svg path 24 x 24px | lesson-light-select-default cl=_1dTNB (#33), path (#35); css:4358-6896adab.css ._1dTNB |
| title | width x height | 600 x 40px, text-align left | lesson-dark-tile-hover dt=challenge-header (#36) |
| header to body | gap | 24px (16px below 700px, 8px when max-height 500px) | css:4358-6896adab.css .K3vbJ |
| challenge column | width / min-height | 600px / 450px (700px+) | css:4358-6896adab.css ._2n5fx @media (min-width:700px) |

| State | What changes | Source |
| --- | --- | --- |
| new word | beetle label + sparkle icon | captured:lesson-dark-tile-hover #32, lesson-light-select-default #32 |
| previous mistake | fox label + icon | captured:lesson-dark-previous-mistake #25 |
| hard exercise | not captured | not captured |
| no badge | title only, badge row absent | captured:lesson-light-challenge-default #24 |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| title | color | #F1F7FB (black-text, dark), body colour | lesson-dark-choice-default dt=challenge-header (#25) has no own colour; css:app-f2ef02f8.css body {color:black-text} |
| NEW WORD label + icon | color / fill | #CE82FF (beetle, dark) | lesson-dark-tile-hover cl=w2K8w (#32); lesson-dark-challenge-tiles-partial #32 |
| PREVIOUS MISTAKE label + icon | color / fill | #FFAB33 (fox, dark) | lesson-dark-previous-mistake cl=w2K8w (#25), path (#28) |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| title | color | #3C3C3C (black-text, light), body colour | lesson-light-challenge-default dt=challenge-header (#25); css:app-f2ef02f8.css body |
| NEW WORD label + icon | color / fill | #CE82FF (beetle, light) | lesson-light-select-default cl=w2K8w (#32), path (#35) |
| PREVIOUS MISTAKE label | color | #FF9600 (fox, light), derived, not captured: badge colour is inline, fox resolved in light | lesson-dark-previous-mistake #25 (dark only) |

Type: title: duolingo-sans 700 32px/40px (25px, line-height 1.25 below 700px) (lesson-dark-tile-hover #36; css:4358-6896adab.css ._3EOK0; css:app-f2ef02f8.css h1); badge label: duolingo-sans 700 16px/16px uppercase, letter-spacing 0.64px (0.04em) (lesson-dark-tile-hover #32; css:4358-6896adab.css .w2K8w (text-label-medium))

Contains: none

Desktop vs mobile: Title 25px below 700px, 32px at 700px+ (css:4358-6896adab.css ._3EOK0 @media (min-width:700px)). Header to body gap 16px below 700px.

Crops: [dark](crops/challenge-header-dark.png) · [light](crops/challenge-header-light.png)

Gaps: HARD EXERCISE badge: not in any dump; the badge colour is set inline, so no CSS rule names its colour. Badge icon SVGs are inline and not saved in any icons-*.json (no lesson icon capture). PREVIOUS MISTAKE captured in dark only.

Notes: Dark crop taken from lesson-dark-feedback-correct screenshot (1384 wide, dump 1200) with crop_offset [92,0].

### Character with speech bubble
Where: /lesson translate/assist challenges, cl=_31yjb (character cl=_2qg6J + bubble cl=_1tbN5 > _1lWtm > _20npu)

Anatomy:
- character (animated canvas, 118x175 max)
- bubble (snow face, 2px swan border)
- bubble tail (svg, two paths)
- speaker button (29x22)
- ruby text: furigana/romanisation (rt) above each word
- hint-token overlays with dashed underline
- new-word highlight (beetle, sparkles)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| row | layout | flex, align-items center, gap 0; wrapper padding-left 10px, margin-top -24px | lesson-light-challenge-default cl=_31yjb (#29), _2w0y3 _1dtTU (#28) |
| character | size | 118 x 175px max (width 30%, aspect 118/175), align-self flex-end | lesson-light-challenge-default cl=_2qg6J (#30); css:4358-6896adab.css ._2qg6J |
| bubble container | margin / gap | 12px 0 / 8px | lesson-light-challenge-default cl=_1tbN5 _44BHt (#33) |
| bubble | padding | 10px 14px 0 (bottom 0 when furigana, line-height 55.5px) | lesson-light-challenge-default cl=_1BU-- _20npu (#35); css:4358-6896adab.css ._1BU-- |
| bubble | size examples | 272 x 70px (light), 182 x 70px (dark), height fixed by 55.5px line | lesson-light-challenge-default #35; lesson-dark-challenge-default #42 |
| bubble | border / radius | 2px solid / 12px | lesson-light-challenge-default #35; css:4358-6896adab.css ._20npu |
| bubble, text-only | padding / line-height | 10px 14px / 32px (e.g. 69 x 56px) | lesson-dark-choice-default cl=_20npu (#35) |
| tail | size / position | 18 x 20px svg, left -16px, top = clamp(alignment - 18px, 12px, 100% - 32px) | lesson-light-challenge-default cl=_2PgN7 _3tTXW _3PLLp (#86); css:4358-6896adab.css ._3PLLp, ._3tTXW._3PLLp |
| speaker | size / gap | 29 x 22px, margin-inline-end 8px | lesson-light-challenge-default cl=_1GJVt _3DAip (#38); css:1327-4028784b.css ._3DAip ._1OCYa; css:4358-6896adab.css ._3Lwjs |
| rt (furigana) | height | 19px box above 28px glyph box | lesson-light-challenge-default rt cl=_271_n (#57) |
| hint token | underline | padding-bottom 4px; dashed-line background image repeat-x at 0 100% | lesson-light-challenge-default dt=hint-token (#81); css:1327-4028784b.css ._2IGwo, .XxgPa |
| new-word sparkle | size | 6px squares (8px for the larger one), radius 2px, 48x48 area rotated 45deg | lesson-dark-challenge-tiles-partial cl=_1kMJb P77qm (#76-#78); css:1327-4028784b.css .P77qm, ._1kMJb |

| State | What changes | Source |
| --- | --- | --- |
| new word in sentence | word turns beetle 700, beetle underline, 3 sparkles animate out (_2SiAC 1.8s ease-out) | captured:lesson-dark-challenge-tiles-partial #66, #75-#78 |
| speaker hover | filter brightness(1.1) | css:app-f2ef02f8.css ._1saKQ:hover @media (hover:hover) |
| speaker playing | lottie paths animate (opacity/transform on paths) | captured:lesson-dark-challenge-default #50 (opacity 0.9) |
| hint token hover / open | not captured (cursor pointer only) | css:app-f2ef02f8.css .tFegI {cursor:pointer} |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| bubble | background | #131F24 (snow, dark) | lesson-dark-challenge-default cl=_20npu (#42) |
| bubble | border | #37464F (swan, dark) | lesson-dark-challenge-default #42 |
| bubble text | color | #F1F7FB (eel, dark) | css:4358-6896adab.css ._20npu {color:eel} |
| tail | fill | #131F24 (snow) over #37464F (swan) | lesson-dark-challenge-default path cl=_3q-cX (#78), _1Ps8f (#79) |
| speaker | fill | #49C0F8 (macaw, dark) | lesson-dark-challenge-default path cl=animated-speaker-icon-lottie (#51) |
| rt | color | #52656D (hare, dark) | lesson-dark-challenge-default rt cl=_5qxJi (#64) |
| hint underline | image | images/5dcc0728f1bbbf031b0259a99d5a75a8.svg | css:1327-4028784b.css html[data-duo-theme=dark] ._2IGwo |
| new-word text + sparkles | color | #CE82FF (beetle), 700; underline images/af821b2d9d7e2fd3cbfce2ed8a0264da.svg | lesson-dark-challenge-tiles-partial cl=_1ELE3 (#66, #75); css:1327-4028784b.css ._1ELE3 |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| bubble | background | #FFFFFF (snow, light) | lesson-light-challenge-default cl=_20npu (#35) |
| bubble | border | #E5E5E5 (swan, light) | lesson-light-challenge-default #35 |
| bubble text | color | #4B4B4B (eel, light) | lesson-light-challenge-default #35 |
| tail | fill | #FFFFFF (snow) over #E5E5E5 (swan) | lesson-light-challenge-default path (#87, #88) |
| speaker | fill | #1CB0F6 (macaw, light) | lesson-light-challenge-default speaker paths under #40 |
| rt | color | #AFAFAF (hare, light) | lesson-light-challenge-default rt (#57) |
| hint underline | image | images/06f94a15de0c0937cce25dc5dc083e6e.svg | css:1327-4028784b.css ._2IGwo |
| new-word text + sparkles | color | #CE82FF (beetle), same rule both themes | css:1327-4028784b.css ._1ELE3, .P77qm:before |

Type: bubble text: duolingo-sans 500 20px (text-body-spacious 1.25rem), line-height 55.5px with ruby, 32px without (lesson-light-challenge-default #35; css:4358-6896adab.css ._20npu, ._1BU--; css:app-f2ef02f8.css * {font-family:duolingo-sans,sans-serif}); rt: duolingo-sans 500 16px/24px (text-caption) (lesson-light-challenge-default #57; css:1327-4028784b.css ._271_n)

Contains: popover shell (hint popover, not captured)

Desktop vs mobile: Below 700px the wrapper margin-top is -16px instead of -24px (css:4358-6896adab.css ._1dTNB @media (min-width:700px)). Character width 30%, capped at 118px (--juicy-character-max-width).

Crops: [dark](crops/character-speech-bubble-dark.png) · [light](crops/character-speech-bubble-light.png)

Gaps: Hint-token popover (word definitions) never opened. Character art is a canvas animation; not extractable. Dark crop is from lesson-dark-feedback-incorrect (different sentence than the dark challenge dumps) because the dark challenge-default screenshot shows a later moment.

### Answer lines
Where: /lesson word-bank challenges, cl=MvChQ v1KUv fUvcy > eWdJ5 > _1arte > _3gJ3o D0fy9 rows

Anatomy:
- top rule (2px)
- ruled rows (60px each, 2px bottom rule)
- answer tiles overlay (cl=_2-F7v, absolute, flex-wrap)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| area | width x height | 600 x 120px visible (2 rows); rows beyond are clipped (overflow hidden) | lesson-light-challenge-default cl=eWdJ5 (#92), _1arte (#95) |
| top rule | border-top | 2px solid | lesson-light-challenge-default cl=MvChQ v1KUv fUvcy (#91); css:4358-6896adab.css .fUvcy |
| row | height / rule | 60px, border-bottom 2px solid (74px when tokens carry furigana, +14px) | lesson-light-challenge-default cl=_3gJ3o D0fy9 (#96); lesson-dark-listen-default cl=D0fy9 C67H0 (#65); css:1008-b4d34396.css .D0fy9, .D0fy9.C67H0 |
| area to word bank | gap | 32px row gap | css:4358-6896adab.css .MvChQ |
| whole answer + bank block | min-height | 170px (87px below 700px) | css:4358-6896adab.css ._3hg-V |
| answer tiles | layout | absolute top 0, flex wrap, tile slots 60px tall with 4px side margins | lesson-dark-challenge-tiles-partial cl=_2-F7v (#95); css:1008-b4d34396.css ._2-F7v |

| State | What changes | Source |
| --- | --- | --- |
| empty | rules only | captured:lesson-light-challenge-default #92 |
| filled | in-answer tiles sit on the rows, same style as bank tiles | captured:lesson-dark-challenge-tiles-partial #98, lesson-light-challenge-tiles-partial #104 |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| rules | color | #37464F (swan, dark) | lesson-dark-challenge-default #82, #87 |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| rules | color | #E5E5E5 (swan, light) | lesson-light-challenge-default #91, #96 |

Contains: none

Desktop vs mobile: Block min-height 87px below 700px, 170px at 700px+ (css:4358-6896adab.css ._3hg-V).

Crops: [dark](crops/answer-lines-dark.png) · [light](crops/answer-lines-light.png)

Gaps: Dark crop comes from the feedback-incorrect screenshot (one row visible, a tile in it).

### Word bank tile
Where: /lesson, dt=word-bank > button dt=<word>-challenge-tap-token

Anatomy:
- slot (cl=_1uV0Q, 60px tall)
- button (transparent 2/2/4 border for the lip space)
- ::before face (2px border, radius 12, 2px lip as box-shadow)
- label span dt=challenge-tap-token-text

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| slot | height / margin | 60px (74px with furigana), margin 0 4px | lesson-light-challenge-default cl=_1uV0Q _DVHp (#103); css:1008-b4d34396.css ._1uV0Q |
| tile | height | 52px (68px with furigana); width hugs text, e.g. "movie" 84px, "is" 49px | lesson-light-challenge-default dt=is-challenge-tap-token (#120); lesson-dark-challenge-default #101; lesson-dark-listen-default #74 |
| tile | padding | 12px 16px | lesson-light-challenge-default #105; css:1008-b4d34396.css ._3ZtW_ {--web-ui_button-padding:12px 16px} |
| tile | border (layout) | 2px 2px 4px transparent | lesson-light-challenge-default #105; css:4779-c36ad395.css ._2V6ug |
| face (::before) | inset / border / radius | -2px all sides, 2px solid, radius 12px | lesson-light-challenge-default #105 ::before; css:4779-c36ad395.css ._2V6ug:before; css:1008-b4d34396.css ._2O7Ua {--web-ui_button-border-radius:12px} |
| lip | box-shadow | 0 2px 0 (border colour) | lesson-light-challenge-default #105 ::before |
| bank | layout | flex-wrap, justify-content center, 600px wide | lesson-light-challenge-default dt=word-bank (#102); css:1008-b4d34396.css .eSgkc |

| State | What changes | Source |
| --- | --- | --- |
| default | snow face, swan border and 2px lip | captured:lesson-dark-challenge-default #96, lesson-light-challenge-default #105 |
| hover | no visual change: hover filter is set to none for tiles | captured:lesson-dark-tile-hover (no tile differs); css:1008-b4d34396.css ._2O7Ua {--web-ui_button-filter-hover:none}; css:4779-c36ad395.css ._2V6ug:hover |
| active (press) | translateY(2px), lip box-shadow none | css:4779-c36ad395.css ._2V6ug:active:not(._2wryV), ._2V6ug:active:not(._2wryV):before |
| selected placeholder (left in bank) | face + border swan, label transparent, no lip, translateY(2px); aria-disabled=true | captured:lesson-dark-challenge-tiles-partial #105 vs lesson-dark-challenge-default #96; css:1008-b4d34396.css ._31wR2; css:4779-c36ad395.css ._2V6ug._2wryV:not(._3fmUm) |
| in answer | identical to default, placed on the answer rows | captured:lesson-dark-challenge-tiles-partial #98, lesson-light-challenge-tiles-partial #104 |
| locked after CHECK | aria-disabled but _3fmUm cancels the disabled look: unchanged | captured:lesson-dark-feedback-incorrect #103 |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| face | background | #131F24 (snow, dark) | lesson-dark-challenge-default #96 ::before |
| face border + lip | color | #37464F (swan, dark) | lesson-dark-challenge-default #96 ::before |
| label | color | #F1F7FB (eel, dark) | css:1008-b4d34396.css ._2O7Ua {--web-ui_button-color:eel} |
| placeholder face + border | background / border | #37464F (swan, dark), no lip | lesson-dark-challenge-tiles-partial #105 ::before |
| placeholder label | color | transparent | lesson-dark-challenge-tiles-partial #105; css:1008-b4d34396.css ._31wR2 |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| face | background | #FFFFFF (snow, light) | lesson-light-challenge-default #105 ::before |
| face border + lip | color | #E5E5E5 (swan, light) | lesson-light-challenge-default #105 ::before |
| label | color | #4B4B4B (eel, light) | lesson-light-challenge-default #105 |
| placeholder face + border | background / border | #E5E5E5 (swan, light), no lip | lesson-light-challenge-tiles-partial #121 ::before |
| placeholder label | color | transparent | lesson-light-challenge-tiles-partial #121 |

Type: label: duolingo-sans 500 19px, line-height 1.15 (21.85px), letter-spacing normal, no uppercase (lesson-light-challenge-default #105; css:1008-b4d34396.css ._3ZtW_ {--web-ui_button-font-size:19px}, ._2O7Ua (font-weight 500!important, text-transform none!important))

Contains: button: secondary (outline) shell, re-skinned

Desktop vs mobile: No tile-specific @media rule; size stays 19px. Slots grow 14px when tokens have furigana (C67H0).

Crops: [dark](crops/word-bank-tile-dark.png) · [light](crops/word-bank-tile-light.png) · [placeholder-dark](crops/word-bank-tile--placeholder-dark.png) · [placeholder-light](crops/word-bank-tile--placeholder-light.png) · [answer-and-bank-light](crops/word-bank-tile--answer-and-bank-light.png)

Gaps: Keyboard-focus ring for tiles not captured.

Notes: Dark crops come from lesson-dark-feedback-incorrect (the dark challenge screenshots do not match their dumps).

### Choice row
Where: /lesson select-meaning and dialogue challenges, role=radiogroup > div dt=challenge-choice cl=_8dMUn _1G3d-

Anatomy:
- card (2/2/4 transparent border, ::before face with 2px lip)
- number badge 30x30 (keyboard shortcut)
- label with ruby (dt=challenge-judge-text)
- decorative corner marks (cl=_2gbXD, svg)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| row | width x height | 600 x 70px with furigana (600 x 60px without) | lesson-dark-choice-default dt=challenge-choice (#40); lesson-dark-dialogue-default #90 |
| row | padding | 12px 16px | lesson-dark-choice-default #40; css:1327-4028784b.css ._1G3d- |
| row | radius / border | 12px; 2px 2px 4px transparent, face ::before inset -2px, 2px border, lip 0 2px 0 | lesson-dark-choice-default #40; css:4779-c36ad395.css ._8dMUn, ._8dMUn:before |
| list | gap | 8px | lesson-dark-choice-default cl=PaKCO _1vQbM (#39); css:1327-4028784b.css ._1vQbM |
| number badge | size / border / radius | 30 x 30px, 2px, radius 8px | lesson-dark-choice-default cl=_3zbIX _20AkF (#41) |
| label | margin | 0 14px 0 12px, centred, flex 1 | lesson-dark-choice-default cl=CwCwj _1FXPg (#42) |

| State | What changes | Source |
| --- | --- | --- |
| default | snow face, swan border | captured:lesson-dark-choice-default #40 |
| hover | face polar (light #F7F7F7, dark #202F36) | captured:lesson-light-choice-selected #40 (pointer on row 1); css:4779-c36ad395.css ._8dMUn:hover:not(:active):not(._1pRZ7):not(._3neHb):before @media (hover:hover) |
| active (press) | translateY(2px), lip none, blue-jay border, iguana face, whale text | css:4779-c36ad395.css ._8dMUn:active:not(._3neHb), :before |
| selected | class _1pRZ7: iguana face, blue-jay border + lip, whale label, badge class _3TbFR | captured:lesson-dark-choice-selected #59 vs lesson-dark-choice-default #59; lesson-light-choice-selected #72 |
| correct (after check) | sea-sponge face, turtle border, tree-frog text | css:1327-4028784b.css ._1drLQ |
| incorrect (after check) | 1.5s flash: walking-fish face, pig border, cardinal text, then back to snow/swan/hare | css:1327-4028784b.css ._2PPjz {animation:_2izty 1.5s}; keyframes _2izty, _1c-0z |
| disabled | text swan, translateY(2px), no lip | css:4779-c36ad395.css ._8dMUn._3neHb:not(._1pRZ7):not(._2cKzl) |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| face | background | #131F24 (snow, dark) | lesson-dark-choice-default #40 ::before |
| border + lip | color | #37464F (swan, dark) | lesson-dark-choice-default #40 ::before |
| label | color | #F1F7FB (eel, dark) | css:1327-4028784b.css ._1G3d- {color:eel} |
| badge | border / text | #37464F (swan) / #52656D (hare) | lesson-dark-choice-default #41 |
| selected face | background | #202F36 (iguana, dark) | lesson-dark-choice-selected #59 ::before |
| selected border + lip | color | #3F85A7 (blue-jay, dark) | lesson-dark-choice-selected #59 ::before |
| selected label + badge text | color | #1899D6 (whale) | lesson-dark-choice-selected #59, #60 |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| face | background | #FFFFFF (snow, light) | lesson-light-choice-selected #59 ::before |
| border + lip | color | #E5E5E5 (swan, light) | lesson-light-choice-selected #59 ::before |
| label | color | #4B4B4B (eel, light) | lesson-light-choice-selected #59 |
| badge | border / text | #E5E5E5 (swan) / #AFAFAF (hare) | lesson-light-choice-selected #60 |
| hover face | background | #F7F7F7 (polar, light) | lesson-light-choice-selected #40 ::before |
| selected face | background | #DDF4FF (iguana, light) | lesson-light-choice-selected #72 ::before |
| selected border + lip | color | #84D8FF (blue-jay, light) | lesson-light-choice-selected #72 ::before |
| selected label + badge text | color | #1899D6 (whale) | lesson-light-choice-selected #72, #73 |

Type: label: duolingo-sans 500 19px, line-height 1.4 (26.6px) (lesson-dark-choice-default #40; css:1327-4028784b.css ._1G3d-); number badge: duolingo-sans 700 15px (lesson-dark-choice-default #41; css:1327-4028784b.css ._20AkF); rt: duolingo-sans 500 16px/24px, hare (lesson-dark-choice-default #45)

Contains: card: selectable

Desktop vs mobile: Below 700px the number badge is hidden (css:1327-4028784b.css ._20AkF display none; inline-flex at 700px+) and the label side margins are dropped (css:1327-4028784b.css .CwCwj @media (min-width:700px)).

Crops: [dark](crops/choice-row-dark.png) · [selected-dark](crops/choice-row--selected-dark.png) · [hover-light](crops/choice-row--hover-light.png)

Gaps: lesson-light-choice-selected screenshot shows the moment before selection (row 3 unselected, CHECK disabled) although its dump has row 3 selected; the light selected crop was deleted. Light selected values come from the dump. No light choice-default dump. Correct/incorrect choice rows not captured (CSS only).

### Image select card
Where: /lesson "Which one of these is ...", role=radiogroup cl=HsVVL > div dt=challenge-choice cl=_8dMUn _2_Y8r

Anatomy:
- card (same shell as choice row, padding 24px)
- illustration 143x160 (background-image)
- footer: word with ruby (left) + number badge 30x30 (right)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| card | width x height | 195 x 261px, 3 across with 8px gap | lesson-light-select-default dt=challenge-choice (#40, #59, #78); cl=HsVVL (#39) |
| card | padding | 24px (12px below 700px) | lesson-light-select-default #40; css:1327-4028784b.css ._2_Y8r |
| card | radius / lip | 12px; 2px lip | lesson-light-select-default #40 ::before |
| illustration | size | 143 x 160px, margin-bottom 10px | lesson-light-select-selected cl=fRsqg (#43) |
| footer | height | 37px, word left, badge right (justify flex-end) | lesson-light-select-selected cl=_2Y0B7 (#44); css:1327-4028784b.css ._2Y0B7 |
| badge | size | 30 x 30px, radius 8px, 2px border | lesson-light-select-selected #53 |

| State | What changes | Source |
| --- | --- | --- |
| default | snow / swan | captured:lesson-light-select-default #40 |
| hover | face polar | captured:lesson-light-select-default #78 (pointer on card 3); css:4779-c36ad395.css ._8dMUn:hover...:before |
| selected | _1pRZ7: iguana, blue-jay, whale; badge _3TbFR | captured:lesson-light-select-selected #40 vs lesson-light-select-default #40 |
| correct | _3v-Hx: sea-sponge face, turtle border + lip, tree-frog text and badge | captured:lesson-light-feedback-correct #41; css:1327-4028784b.css ._3v-Hx, ._3v-Hx .Ufx5P |
| other cards after check | _3neHb _2TdWJ: unchanged look, cursor default | captured:lesson-light-feedback-correct #61 |
| incorrect | flash _1NjD6 1.5s: walking-fish / pig / cardinal | css:1327-4028784b.css ._3j8Jt |

Tokens (dark): not captured.

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| face | background | #FFFFFF (snow, light) | lesson-light-select-default #40 ::before |
| border + lip | color | #E5E5E5 (swan, light) | lesson-light-select-default #40 ::before |
| label | color | #4B4B4B (eel, light) | lesson-light-select-default #40 |
| hover face | background | #F7F7F7 (polar, light) | lesson-light-select-default #78 ::before |
| selected face / border / text | colours | #DDF4FF (iguana) / #84D8FF (blue-jay) / #1899D6 (whale) | lesson-light-select-selected #40, #53 |
| correct face / border / text | colours | #D7FFB8 (sea-sponge) / #A5ED6E (turtle) / #58A700 (tree-frog) | lesson-light-feedback-correct #41, #54 |

Type: word: duolingo-sans 500 19px, rt 16px/24px (css:1327-4028784b.css ._2_Y8r; lesson-light-select-selected #48)

Contains: card: selectable

Desktop vs mobile: Below 700px: 2 columns, a third card spans centred at 50% width (css:1327-4028784b.css .HsVVL, .HsVVL>:nth-child(3):last-child @media (max-width:699px)); padding 12px; footer centred.

Crops: [light](crops/image-select-card-light.png) · [selected-light](crops/image-select-card--selected-light.png) · [correct-light](crops/image-select-card--correct-light.png)

Gaps: No dark image-select dump: dark tokens would follow the choice-row values (same ._8dMUn rules) but were not captured.

### Match tile
Where: /lesson "Select the matching pairs", cl=_1bmNz grid > button dt=<word>-challenge-tap-token cl=... _1YHBP _3Ymqr

Anatomy:
- tile (tap-token shell, 255x68)
- number badge 30x30 at left 16px
- label (word or ruby)
- inner fill (cl=_12ozk, inset 2px, radius 10px) shown when selected or wrong

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| grid | columns / gap | 2 x 255px, gap 10px 30px, rows 1fr | lesson-dark-match-default cl=_1bmNz _3rat3 (#28); css:4358-6896adab.css ._1bmNz @media (min-width:700px) |
| tile | width x height | 255 x 68px | lesson-dark-match-default dt=tall-challenge-tap-token (#30) |
| tile | padding | 12px 30px 12px 58px | lesson-dark-match-default #30; css:1008-b4d34396.css ._3ZtW_._1YHBP |
| tile | radius / lip | 12px, 2px lip, lip transition 100ms linear | lesson-dark-match-default #30; css:1008-b4d34396.css ._2O7Ua._3Ymqr |
| badge | size / position | 30 x 30px, radius 8px, absolute left 16px | lesson-dark-match-default cl=_3zbIX _20AkF _2MhQB (#31); css:1008-b4d34396.css ._3ZtW_._1YHBP ._2MhQB |
| inner fill | inset / radius | 251 x 62px (2px inset), radius 10px | lesson-dark-match-selected cl=_12ozk (#31); css:1008-b4d34396.css ._12ozk |

| State | What changes | Source |
| --- | --- | --- |
| default | snow / swan / hare badge | captured:lesson-dark-match-default #30, lesson-light-match-default #30 |
| hover | none (tile hover filter is none) | css:1008-b4d34396.css ._2O7Ua |
| active | translateY(2px), lip none, 100ms linear | css:4779-c36ad395.css ._2V6ug:active; css:1008-b4d34396.css ._2O7Ua._3Ymqr |
| selected | blue-jay border, whale text, iguana inner fill (colours inline) | captured:lesson-dark-match-selected #30 vs lesson-dark-match-default #30; lesson-light-match-selected #30 |
| matched / disabled | _2wryV + aria-disabled: text and badge swan, face snow, lip kept (_3fmUm) | captured:lesson-dark-match-pair-matched #30, lesson-light-match-pair-matched #30 |
| wrong pair flash | first tile: flamingo border, fire-ant text and badge, inner fill #202F36; second tile mid-transition (fire-ant text, swan border) | captured:lesson-dark-match-pair-wrong #41, #82 (dump only) |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| face / border + lip | colours | #131F24 (snow) / #37464F (swan) | lesson-dark-match-default #30 ::before |
| label | color | #F1F7FB (eel, dark) | css:1008-b4d34396.css ._2O7Ua |
| badge | border / text | #37464F (swan) / #52656D (hare) | lesson-dark-match-default #31 |
| selected | border + lip / text + badge text / inner fill | #3F85A7 (blue-jay) / #1899D6 (whale) / #202F36 (iguana, dark) | lesson-dark-match-selected #30, #31, #32 |
| matched | label + badge | #37464F (swan), face and lip unchanged | lesson-dark-match-pair-matched #30 |
| wrong | border + lip / text / inner fill | #945151 (flamingo, dark) / #D84848 (fire-ant, dark) / #202F36 | lesson-dark-match-pair-wrong #41, #42, #43 |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| face / border + lip | colours | #FFFFFF (snow) / #E5E5E5 (swan) | lesson-light-match-default #30 ::before |
| label | color | #4B4B4B (eel, light) | lesson-light-match-default #30 |
| badge | border / text | #E5E5E5 (swan) / #AFAFAF (hare) | lesson-light-match-default #31 |
| selected | border + lip / text / inner fill | #84D8FF (blue-jay) / #1899D6 (whale) / #DDF4FF (iguana, light) | lesson-light-match-selected #30, #31 |
| matched | label + badge | #E5E5E5 (swan), face and lip unchanged | lesson-light-match-pair-matched #30 |

Type: label: duolingo-sans 500 19px/21.85px (lesson-dark-match-default #30); badge: duolingo-sans 700 15px, line-height 17.25px (lesson-dark-match-default #31)

Contains: button: secondary (outline) shell, re-skinned

Desktop vs mobile: Below 700px: columns minmax(0,1fr) x 2, rows fixed 76px, gap 16px 20px (css:4358-6896adab.css ._1bmNz).

Crops: [dark](crops/match-tile-dark.png) · [light](crops/match-tile-light.png) · [selected-dark](crops/match-tile--selected-dark.png) · [matched-dark](crops/match-tile--matched-dark.png) · [selected-light](crops/match-tile--selected-light.png)

Gaps: Wrong-pair flash: dark dump only, no screenshot, no light capture (the colours are inline, so no CSS rule gives the light values; by palette name flamingo light is #FFB2B2, fire-ant light #EA2B2B, unverified). Correct-pair flash (before the tiles go swan) not captured. lesson-light-match-pair-matched has no screenshot.

### Dialogue challenge
Where: /lesson "Complete the chat", dt=challenge challenge-dialogue

Anatomy:
- left message: 64px avatar + bubble with speaker and hint tokens
- right message: bubble with blank line + 64px avatar
- choice rows (see choice-row)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| messages | gap | 8px between messages; 24px to the choices | lesson-dark-dialogue-default cl=_3fGax (#28), _3wqGX f7WE2 (#27) |
| left message | width / margin | 480px, margin-right 120px (20%) | lesson-dark-dialogue-default cl=_1j5TQ (#29); css:4358-6896adab.css ._1j5TQ |
| right message | width / margin | 480px, margin-left 120px (20%), justify flex-end | lesson-dark-dialogue-default cl=hOemH (#78), _2c7Ih (#79) |
| avatar | size / gap | 64 x 67px, 16px to the bubble | lesson-dark-dialogue-default cl=_3L4wm _1etlE (#31), _2kufX (#87) |
| bubble | padding / radius / border | 10px 14px / 12px / 2px, line-height 32px, e.g. 307 x 56px | lesson-dark-dialogue-default cl=_20npu (#34) |
| tail | position | 18 x 20px, top 12px; left -16px (left bubble), right -16px mirrored (right bubble) | lesson-dark-dialogue-default cl=_2PgN7 _1v78f _3PLLp (#75), tyghN (#84); css:4358-6896adab.css ._1v78f._3PLLp, .tyghN |
| blank | size / rule | 70 x 2px, border-bottom 2px, margin 0 3px -2px | lesson-dark-dialogue-default cl=_3AISd (#83) |
| choice rows | size | 600 x 60px, gap 8px | lesson-dark-dialogue-default dt=challenge-choice (#90, #98) |

| State | What changes | Source |
| --- | --- | --- |
| default | as captured | captured:lesson-dark-dialogue-default |
| selected choice | see choice-row | css: see choice-row |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| bubble | background / border | #131F24 (snow) / #37464F (swan) | lesson-dark-dialogue-default #34 |
| blank | rule | #52656D (hare, dark) | lesson-dark-dialogue-default #83 |
| speaker | fill | #49C0F8 (macaw, dark) | lesson-dark-dialogue-default #37 subtree |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| blank | rule | #AFAFAF (hare, light), derived, not captured | css:4358-6896adab.css ._3AISd |

Type: bubble text: duolingo-sans 500 20px/32px (lesson-dark-dialogue-default #34); choice text: duolingo-sans 500 19px/26.6px (lesson-dark-dialogue-default #90)

Contains: card: selectable (choice rows)

Desktop vs mobile: No dialogue-specific @media rules found; choice rows follow choice-row mobile rules.

Crops: [dark](crops/dialogue-challenge-dark.png)

Gaps: No light dialogue capture. Avatars are external SVGs (simg-ssl.duolingo.com/world-characters/avatars/bea_avatar_icon.svg, eddy_avatar_icon.svg).

### Listen challenge
Where: /lesson "Tap what you hear", dt=challenge challenge-listenTap

Anatomy:
- large speaker button 100x100 (normal speed)
- small speaker button 70x70 with snow ring (slow)
- answer lines + word bank (74px rows, furigana tokens)
- footer: "Can't listen now" in the SKIP slot, "Use keyboard" toggle in the middle

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| large speaker | size / radius | 100 x 100px, radius 25%, bottom border 4px (lip) | lesson-dark-listen-default cl=yJbco _23274 _3TlAm (#31); css:1327-4028784b.css .yJbco, ._25RRr |
| large speaker icon | size | 50 x 39px (50% width) | lesson-dark-listen-default #32; css:1327-4028784b.css .yJbco ._1OCYa |
| small speaker | size / gap | 70 x 70px, margin-left 16px, icon 42 x 23px (60%) | lesson-dark-listen-default cl=rnwSx (#46), g8o0T (#44) |
| small speaker ring | ::before | 4px solid border, radius calc(25% + 4px), inset -4px (bottom -8px) | lesson-dark-listen-default #46 ::before; css:1327-4028784b.css ._37SfF:before |
| speakers row | layout | flex, align-items flex-end, centred | lesson-dark-listen-default cl=_3qAs- (#29), _3C4MQ (#28) |
| answer rows | height | 74px (60 + 14 furigana) | lesson-dark-listen-default cl=_3gJ3o D0fy9 C67H0 (#65) |
| tiles | height | 68px in 74px slots | lesson-dark-listen-default #74 |
| Can't listen now | size | 183 x 50px (player-skip button, width grows with text) | lesson-dark-listen-default dt=player-skip (#139, #140) |
| Use keyboard | size | 157 x 20px: 27 x 19px icon + 10px + label | lesson-dark-listen-default dt=player-toggle-keyboard (#142-#144) |

| State | What changes | Source |
| --- | --- | --- |
| speaker hover | brightness(1.1) | css:app-f2ef02f8.css ._1saKQ:hover:not(:disabled) |
| speaker active | border-width 4px 0 0, lip removed (face moves down) | css:app-f2ef02f8.css ._1Lt8-:active:not(:disabled):not(._1bjzW), :after |
| speaker disabled | face swan, text hare, no lip | css:app-f2ef02f8.css ._1Lt8-:disabled:not(.WHVbR), :after |
| small speaker active | ring bottom shrinks to -4px | css:1327-4028784b.css ._37SfF:active:before |
| after Can't listen now | neutral feedback bar "No listening exercises." (see feedback-bar) | captured:lesson-dark-cant-listen #144-#175 |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| speaker face (::after) | background | #49C0F8 (macaw, dark) | lesson-dark-listen-default #31 ::after; css:app-f2ef02f8.css ._3TlAm:after |
| speaker lip (button bg) | background | #1899D6 (whale) | lesson-dark-listen-default #31; css:app-f2ef02f8.css ._3TlAm |
| speaker icon | fill | #131F24 (snow, dark) | lesson-dark-listen-default #33 paths |
| small speaker ring | border | #131F24 (snow, dark) | lesson-dark-listen-default #46 ::before |
| Can't listen now label | color | #52656D (hare, dark), SKIP button styling | lesson-dark-listen-default #139 |
| Use keyboard label | color | #52656D (hare, dark) | lesson-dark-listen-default #144 |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| speaker face | background | #1CB0F6 (macaw, light), derived, not captured | css:app-f2ef02f8.css ._3TlAm:after |
| speaker lip | background | #1899D6 (whale), derived, not captured | css:app-f2ef02f8.css ._3TlAm |
| speaker icon / ring | fill / border | #FFFFFF (snow, light), derived, not captured | css:app-f2ef02f8.css ._3TlAm color; css:1327-4028784b.css ._37SfF:before |

Type: Can't listen now: duolingo-sans 700 17px/20.4px uppercase, letter-spacing 0.8px (lesson-dark-listen-default #139); Use keyboard: duolingo-sans 700 17px uppercase 0.8px (15px below 700px) (lesson-dark-listen-default #144; css:app-f2ef02f8.css ._2Rt1l; css:1008-b4d34396.css ._1Z76W)

Contains: button: secondary (SKIP slot)

Desktop vs mobile: Below 700px and max-height 500px: speakers 50x50 and 35x35, gap 8px (css:1327-4028784b.css .yJbco, .rnwSx; css:4358-6896adab.css .g8o0T).

Crops: none

Gaps: lesson-dark-listen-default and lesson-dark-cant-listen have no screenshots, so no crops. No light listen capture.

### Lesson footer
Where: /lesson bottom row, cl=_3rB4d _1VTif > U8jH3 jHbiF: dt=player-skip, dt=player-next

Anatomy:
- bar (140px, 2px top rule)
- inner 1000px grid of 5 columns
- SKIP (secondary button, column 1)
- CHECK (primary button, column 5)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| bar | height / top border | 140px (min-height, max-height 140px), border-top 2px solid | lesson-dark-challenge-default cl=_3rB4d _1VTif _2HXQ9 (#146); css:1008-b4d34396.css ._3rB4d @media (min-width:700px) |
| inner | max-width / padding | 1000px, padding 0 40px, margin-left calc(50% - 500px); grid repeat(5,1fr), gap 8px 16px | lesson-dark-challenge-default cl=U8jH3 jHbiF (#147); css:1008-b4d34396.css .jHbiF, .U8jH3 |
| buttons | vertical position | y = bar top + 47px (centred) | lesson-dark-challenge-default #149 r=[140,704,...] |
| SKIP | size / padding / radius | 150 x 50px min, padding 0 16px, radius 16px, border 2px 2px 4px | lesson-dark-challenge-default dt=player-skip (#149); css:app-f2ef02f8.css :root {--web-ui_button-border-radius:16px} |
| SKIP lip | box-shadow | 0 2px 0 (swan) | lesson-dark-challenge-default #149 ::before |
| CHECK | size / radius | 150 x 50px, radius 16px, border-bottom 4px (lip width) | lesson-dark-challenge-check-enabled dt=player-next (#178); css:4779-c36ad395.css ._1VYyp |
| CHECK lip | box-shadow | 0 4px 0 (tree-frog) | lesson-dark-challenge-check-enabled #178 ::before |
| CHECK disabled | offset | translateY(4px), no lip (y 708 vs 704) | lesson-dark-challenge-default #152 |

| State | What changes | Source |
| --- | --- | --- |
| CHECK disabled | swan face, hare label, pushed down 4px, no lip | captured:lesson-dark-challenge-default #152, lesson-light-challenge-default #156 |
| CHECK enabled | owl face, tree-frog 4px lip, snow label | captured:lesson-dark-challenge-check-enabled #178, lesson-light-choice-selected #95 |
| CHECK hover | filter brightness(1.1) | captured:lesson-dark-check-hover #136 vs lesson-dark-challenge-tiles-partial; css:4779-c36ad395.css ._1VYyp:hover:not(._2wryV):not(.ypJiL) @media (hover:hover) |
| CHECK active | translateY(4px), lip none | css:4779-c36ad395.css ._1VYyp:active:not(._2wryV), :before |
| SKIP hover | filter brightness(0.9) | css:4779-c36ad395.css ._2V6ug {--__internal__filter-hover:brightness(0.9)}, ._2V6ug:hover |
| SKIP active | translateY(2px), lip none | css:4779-c36ad395.css ._2V6ug:active:not(._2wryV) |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| bar | background / top rule | #131F24 (snow) / #37464F (swan) | lesson-dark-challenge-default #146 |
| SKIP | face / border + lip / label | #131F24 (snow) / #37464F (swan) / #52656D (hare) | lesson-dark-challenge-default #149 |
| CHECK disabled | face / label | #37464F (swan) / #52656D (hare) | lesson-dark-challenge-default #152 |
| CHECK enabled | face / lip / label | #93D333 (owl) / #79B933 (tree-frog) / #131F24 (snow) | lesson-dark-challenge-check-enabled #178 |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| bar | background / top rule | #FFFFFF (snow) / #E5E5E5 (swan) | lesson-light-challenge-default #150 |
| SKIP | face / border + lip / label | #FFFFFF (snow) / #E5E5E5 (swan) / #AFAFAF (hare) | lesson-light-challenge-default #153 |
| CHECK disabled | face / label | #E5E5E5 (swan) / #AFAFAF (hare) | lesson-light-challenge-default #156 |
| CHECK enabled | face / lip / label | #58CC02 (owl) / #58A700 (tree-frog) / #FFFFFF (snow) | lesson-light-choice-selected #95 |

Type: SKIP / CHECK label: duolingo-sans 700 17px, line-height 1.2 (20.4px), uppercase, letter-spacing 0.8px (lesson-dark-challenge-default #149, #152; css:1008-b4d34396.css ._3DbUj, ._3fo6Q {--web-ui_button-font-size:17px} @media (min-width:700px); css:4779-c36ad395.css ._1ursp)

Contains: button: primary (owl), button: secondary (outline)

Desktop vs mobile: Below 700px the bar has no background or top rule (those rules are inside @media (min-width:700px)), the grid is one column with 1fr rows, buttons are width 100% (min 150px) at the 15px default size (css:1008-b4d34396.css ._3rB4d, .U8jH3, ._3DbUj, ._2x7Co). CHECK moves above SKIP only in some layouts (._2GNO7/._2YpiP .MYehf order -1).

Crops: [dark](crops/lesson-footer-dark.png) · [light](crops/lesson-footer-light.png) · [check-enabled-dark](crops/lesson-footer--check-enabled-dark.png)

Gaps: CHECK hover screenshot (lesson-dark-check-hover) does not match its dump; no hover crop. lesson-dark-challenge-check-enabled has no screenshot; enabled dark crop taken from lesson-dark-choice-selected. Light enabled crop deleted: lesson-light-choice-selected screenshot shows CHECK still disabled.

### Feedback bar
Where: /lesson after CHECK, footer switches to cl=_3FB5S + _3yMvO (correct) / _2cfV0 (incorrect) / _2mseZ (neutral); dt=blame blame-correct|blame-incorrect

Anatomy:
- bar (140px, tinted, no top rule)
- icon circle 80x80 with check / cross image
- title h2 ("Great job!", "Correct solution:")
- solution text (incorrect only)
- TOO EASY, TOO DIFFICULT, REPORT text buttons (20px icon + label)
- CONTINUE (dt=player-next, primary button in state colour)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| bar | height | 140px min, full width, no border-top | lesson-dark-feedback-correct cl=_3FB5S _1VTif _3yMvO _2HXQ9 (#139) |
| content | padding / columns | 16px 0; spans grid columns 1-4 (733px wide at 1000px inner) | lesson-dark-feedback-correct cl=AXBVw _2Ycbe _8wIx- (#141); css:1008-b4d34396.css ._8wIx- @media (min-width:700px) |
| blame | layout | grid min-content \| 1fr, gap 16px; 80px tall (93px with solution) | lesson-dark-feedback-correct dt=blame blame-correct (#142); lesson-dark-feedback-incorrect #126 |
| icon circle | size / radius | 80 x 80px, radius 98px, float left | lesson-dark-feedback-correct cl=_31ixh HJdJI fwpkb (#143); css:1008-b4d34396.css .fwpkb |
| check image | size / margin | 41 x 31px, margin 27px 0 0 20px | lesson-dark-feedback-correct cl=_3oCTd (#144) |
| cross image | size / margin | 31 x 31px, margin 26px 0 0 25px | lesson-dark-feedback-incorrect cl=_1gpzD (#128) |
| text column | max / min width | 400px / 320px (350px rendered), gap 16px to the actions row | lesson-dark-feedback-correct cl=_3LKiy (#146) |
| title | height | 30px | lesson-dark-feedback-correct h2 (#148) |
| solution | height | 26px | lesson-dark-feedback-incorrect cl=_2jz5U (#133) |
| actions row | gap / height | 24px between items, 21px tall; icon 20 x 20px + 5px + label | lesson-dark-feedback-correct cl=_2yBiG (#149), _2YKKH (#152), _2-7I9 (#153) |
| CONTINUE | size / radius / lip | 150 x 50px, radius 16px, lip 4px (box-shadow 0 4px 0) | lesson-dark-feedback-correct dt=player-next (#168) |
| entry | animation | slide up translateY(100%) > 0 in 0.2s cubic-bezier(.35,1.8,.35,.83) | css:app-f2ef02f8.css ._2Ycbe, @keyframes gTkFz |

Feedback colours (required record):

| Theme | State | Element | Value | Source | Status |
| --- | --- | --- | --- | --- | --- |
| dark | correct | bar background | #202F36 (sea-sponge, dark) | lesson-dark-feedback-correct cl=_3FB5S _3yMvO (#139) | captured |
| dark | correct | title colour | #79B933 (tree-frog, dark) | lesson-dark-feedback-correct h2 cl=_2U7Gm WXwlk (#148) | captured |
| dark | correct | icon circle | #131F24 (snow, dark) | lesson-dark-feedback-correct cl=fwpkb (#143) | captured |
| dark | correct | CONTINUE face (::before bg) | #93D333 (owl, dark) | lesson-dark-feedback-correct dt=player-next cl=_2oGJR (#168) ::before | captured |
| dark | correct | CONTINUE lip (::before box-shadow 0 4px 0) | #79B933 (tree-frog, dark) | lesson-dark-feedback-correct #168 ::before | captured |
| dark | correct | CONTINUE label | #131F24 (snow, dark) | lesson-dark-feedback-correct #168 | captured |
| dark | incorrect | bar background | #202F36 (walking-fish, dark) | lesson-dark-feedback-incorrect cl=_3FB5S _2cfV0 (#123) | captured |
| dark | incorrect | title colour | #D84848 (fire-ant, dark) | lesson-dark-feedback-incorrect h2 cl=_2U7Gm o-3Ru (#132) | captured |
| dark | incorrect | solution text | #D84848 (fire-ant, dark) | lesson-dark-feedback-incorrect cl=_2jz5U o-3Ru (#133) | captured |
| dark | incorrect | icon circle | #131F24 (snow, dark) | lesson-dark-feedback-incorrect cl=fwpkb (#127) | captured |
| dark | incorrect | CONTINUE face (::before bg) | #EE5555 (cardinal, dark) | lesson-dark-feedback-incorrect dt=player-next cl=_3S8jJ (#153) ::before | captured |
| dark | incorrect | CONTINUE lip (::before box-shadow 0 4px 0) | #D84848 (fire-ant, dark) | lesson-dark-feedback-incorrect #153 ::before | captured |
| dark | incorrect | CONTINUE label | #131F24 (snow, dark) | lesson-dark-feedback-incorrect #153 | captured |
| light | correct | bar background | #D7FFB8 (sea-sponge, light) | lesson-light-feedback-correct cl=_3FB5S _3yMvO (#103) | captured |
| light | correct | title colour | #58A700 (tree-frog, light) | lesson-light-feedback-correct h2 cl=_2U7Gm WXwlk (#112) | captured |
| light | correct | icon circle | #FFFFFF (snow, light) | lesson-light-feedback-correct cl=fwpkb (#107) | captured |
| light | correct | CONTINUE face (::before bg) | #58CC02 (owl, light) | lesson-light-feedback-correct dt=player-next cl=_2oGJR (#132) ::before | captured |
| light | correct | CONTINUE lip (::before box-shadow 0 4px 0) | #58A700 (tree-frog, light) | lesson-light-feedback-correct #132 ::before | captured |
| light | correct | CONTINUE label | #FFFFFF (snow, light) | lesson-light-feedback-correct #132 | captured |
| light | incorrect | bar background | #FFDFE0 (walking-fish, light) | css:1008-b4d34396.css ._3FB5S._2cfV0 @media (min-width:700px) {background-color: rgb(var(--color-walking-fish))} | derived, not captured |
| light | incorrect | title colour | #EA2B2B (fire-ant, light) | css:1008-b4d34396.css .o-3Ru {color: rgb(var(--color-fire-ant))} | derived, not captured |
| light | incorrect | solution text | #EA2B2B (fire-ant, light) | css:1008-b4d34396.css .o-3Ru (on ._2jz5U) | derived, not captured |
| light | incorrect | icon circle | #FFFFFF (snow, light) | css:1008-b4d34396.css .fwpkb @media (min-width:700px) {background: rgb(var(--color-snow))} | derived, not captured |
| light | incorrect | CONTINUE face (::before bg) | #FF4B4B (cardinal, light) | css:app-f2ef02f8.css ._3S8jJ {--web-ui_button-background-color: rgb(var(--color-cardinal))} via css:4779-c36ad395.css ._1VYyp:before | derived, not captured |
| light | incorrect | CONTINUE lip (::before box-shadow 0 4px 0) | #EA2B2B (fire-ant, light) | css:app-f2ef02f8.css ._3S8jJ {--web-ui_button-border-color: rgb(var(--color-fire-ant))} via css:4779-c36ad395.css ._1VYyp:before {box-shadow:0 var(--__internal__lip-width) 0; color: border-color} | derived, not captured |
| light | incorrect | CONTINUE label | #FFFFFF (snow, light) | css:app-f2ef02f8.css ._3S8jJ {--web-ui_button-color: rgb(var(--color-snow))} | derived, not captured |
| light | incorrect | TOO EASY / TOO DIFFICULT / REPORT colour | #EA2B2B (fire-ant, light) | css:1008-b4d34396.css ._1CCAE, ._3Q4Uw | derived, not captured |

| State | What changes | Source |
| --- | --- | --- |
| correct | sea-sponge bar, tree-frog title, owl CONTINUE | captured:lesson-dark-feedback-correct #139-#169, lesson-light-feedback-correct #103-#133 |
| incorrect | walking-fish bar, fire-ant title + solution, cardinal CONTINUE | captured:lesson-dark-feedback-incorrect #123-#154 |
| neutral (can't listen) | canary bar, guinea-pig text, bee CONTINUE | captured:lesson-dark-cant-listen #144-#175; css:1008-b4d34396.css ._3FB5S._2mseZ; css:app-f2ef02f8.css ._1lyVV |
| action hover | opacity 0.7 > 1 | css:1008-b4d34396.css ._1rbbG:hover, ._2jCpE:hover @media (hover:hover) |
| action pressed | aria-pressed=true: opacity 1, label underlined | css:1008-b4d34396.css ._1rbbG[aria-pressed=true], ._2J0K5 |
| CONTINUE hover / active | brightness(1.1) / translateY(4px), lip none | css:4779-c36ad395.css ._1VYyp:hover, ._1VYyp:active |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| correct bar | background | #202F36 (sea-sponge, dark) | lesson-dark-feedback-correct #139; css:1008-b4d34396.css ._3FB5S._3yMvO |
| correct title + actions | color | #79B933 (tree-frog, dark) | lesson-dark-feedback-correct #148, #151 |
| incorrect bar | background | #202F36 (walking-fish, dark) | lesson-dark-feedback-incorrect #123; css:1008-b4d34396.css ._3FB5S._2cfV0 |
| incorrect title, solution, actions | color | #D84848 (fire-ant, dark) | lesson-dark-feedback-incorrect #132, #133, #136 |
| icon circle | background | #131F24 (snow, dark) | lesson-dark-feedback-correct #143, lesson-dark-feedback-incorrect #127 |
| neutral bar / title / CONTINUE | colours | #202F36 (canary, dark) / #D79433 (guinea-pig, dark) / face #FFC700 (bee), lip #E7A601 (camel) | lesson-dark-cant-listen #144, #153, #174 |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| correct bar | background | #D7FFB8 (sea-sponge, light) | lesson-light-feedback-correct #103 |
| correct title + actions | color | #58A700 (tree-frog, light) | lesson-light-feedback-correct #112, #115 |
| incorrect bar | background | #FFDFE0 (walking-fish, light), derived, not captured | css:1008-b4d34396.css ._3FB5S._2cfV0 @media (min-width:700px) |
| incorrect title, solution, actions | color | #EA2B2B (fire-ant, light), derived, not captured | css:1008-b4d34396.css .o-3Ru, ._1CCAE, ._3Q4Uw |
| icon circle | background | #FFFFFF (snow, light) | lesson-light-feedback-correct #107 |

Type: title: duolingo-sans 700 24px/30px (lesson-dark-feedback-correct #148; css:app-f2ef02f8.css h2; css:1008-b4d34396.css ._2U7Gm @media (min-width:700px)); solution: duolingo-sans 500 17px/26px (15px/22px below 700px) (lesson-dark-feedback-incorrect #133; css:1008-b4d34396.css ._2jz5U, ._1D3fo); action labels: duolingo-sans 700 15px uppercase, letter-spacing 0.8px (lesson-dark-feedback-correct #156; css:app-f2ef02f8.css ._2Rt1l); CONTINUE: duolingo-sans 700 17px/20.4px uppercase, letter-spacing 0.8px (lesson-dark-feedback-correct #168)

Contains: button: primary (owl), button: primary (cardinal / danger), button: primary (bee)

Desktop vs mobile: Below 700px: the icon circle and images are hidden (display none), action labels hidden (icons only, css:1008-b4d34396.css ._2J0K5, ._2_snL), the message block becomes absolute at the bottom with padding 24px 16px 72px and the tint moves onto it (._3yMvO ._8wIx-, ._2cfV0 ._8wIx-); title/solution gap 5px, line-height 22px, solution 15px.

Crops: [correct-dark](crops/feedback-bar--correct-dark.png) · [incorrect-dark](crops/feedback-bar--incorrect-dark.png) · [correct-light](crops/feedback-bar--correct-light.png)

Gaps: Light incorrect not captured: every light incorrect value is derived from the CSS rules the dark incorrect nodes use. Light incorrect icon image and report icon not captured; REPORT icon class for light incorrect is probably .o8H6C (images/0f625e0c64ba72c0cd96755abcc4bcdf.svg), inferred only from the order of the report-icon rules in css:1008-b4d34396.css (light correct _26G6u, dark correct Htiq_, then o8H6C, dark incorrect _2M-GA). TOO EASY / TOO DIFFICULT icons are inline stroke SVGs (stroke = state colour, 2px).

Notes: Dark correct crop taken from a 1384px screenshot of a 1200px dump, crop_offset [92,0].

### Review mistakes interstitial
Where: /lesson, between the last new challenge and the replay of missed ones; dt=session-duo + speech bubble, footer dt=player-next

Anatomy:
- lesson top bar (quit, settings, progress bar, hearts; documented by the challenge-screen part)
- Duo character (dt=session-duo, 200x123, mirrored with scaleX(-1), anchored to the bottom of the content area)
- speech bubble (popover shell, caret on the left pointing at Duo)
- footer: CONTINUE (primary, owl) right-aligned

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| content area | height | 557px (y 100 to 657) | lesson-dark-review-interstitial cl=RMEuZ _1GVfY (#27) |
| duo wrapper | width x height, position | 600px max-width row, absolute bottom 0, centred with translateX(-50%) | lesson-dark-review-interstitial cl=_2GMvD En_6d _2OFAQ (#30); css:4358-6896adab.css .En_6d { bottom:0; left:50%; max-width:600px; transform:translateX(-50%) } |
| Duo | width x height | 200 x 123px (--duo-width:200px, --duo-height:123px, --popover-offset:-25px) | lesson-dark-review-interstitial dt=session-duo cl=_1UGd5 _1JaQ9 (#31); css:4358-6896adab.css ._2GMvD |
| bubble | width x height | 343 x 55px (content width, max-width 400px) | lesson-dark-review-interstitial cl=_36bu_ _2GMvD _2ka0w _1K3po (#129) |
| bubble | padding | 12px 24px | lesson-dark-review-interstitial #129; css:4358-6896adab.css ._1K3po { padding:12px 24px } |
| bubble | border / radius | 2px solid / 15px (--web-ui_popover-border-radius) | lesson-dark-review-interstitial #129; css:4779-c36ad395.css ._36bu_ |
| bubble | gap to Duo | 8px margin-left on the popover wrapper (D0iFS); the bubble starts 32px inside the Duo box (bubble x=560, Duo box right edge x=592); _2GMvD also sets --popover-offset:-25px | lesson-dark-review-interstitial cl=_3zpnU D0iFS (#128); css:4779-c36ad395.css .D0iFS { margin-left:8px } |
| caret | box | 20 x 10px clip box rotated -90deg at left:-13px, inner square 14.14px rotated 45deg, 2px border, radius 2px | lesson-dark-review-interstitial cl=_3T97b (#130), cl=_1TMn5 (#131); css:4779-c36ad395.css .D0iFS>._3T97b, ._1TMn5 |
| caret | vertical offset | margin: 15px 0 (border radius) from the bubble top | css:4779-c36ad395.css .D0iFS>._3T97b { margin:var(--web-ui_popover-border-radius,15px) 0 } |
| footer | height / top border | 140px / 2px solid | lesson-dark-review-interstitial cl=_3rB4d _1VTif _2HXQ9 (#134) |
| CONTINUE | width x height | 150 x 50px (min-width 150px), radius 16px, lip 4px | lesson-dark-review-interstitial dt=player-next (#137) |

| State | What changes | Source |
| --- | --- | --- |
| hover (primary lip button) | filter: var(--__internal__filter-hover) (brightness(1.1) default), only when (hover:hover) | css:4779-c36ad395.css ._1VYyp:hover:not(._2wryV):not(.ypJiL) @media (hover:hover) |
| active (primary lip button) | transform: translateY(lip width 4px); ::before box-shadow none (lip disappears) | css:4779-c36ad395.css ._1VYyp:active:not(._2wryV), ._1VYyp:active:not(._2wryV):before |
| screen enter | slide wrapper goes from opacity 0 + translateX(50px) to opacity 1 + translateX(0) | captured entering state in lesson-light-combo-interstitial cl=_1XNQX _3V6my (#32); end state css:4358-6896adab.css ._1cTBC ._3V6my { opacity:1; transform:translateX(0) } |

Tokens (dark):
- bubble, background: #131F24 (snow, dark) (lesson-dark-review-interstitial #129)
- bubble, border: #37464F (swan, dark) (lesson-dark-review-interstitial #129)
- bubble, text: #F1F7FB (black-text, dark), inherited body colour so not recorded on the node (css:app-f2ef02f8.css body { color:rgb(var(--color-black-text)) })
- caret, fill / border: #131F24 (snow, dark) / #37464F (swan, dark) (lesson-dark-review-interstitial #131)
- footer, background / top border: #131F24 (snow, dark) / #37464F (swan, dark) (lesson-dark-review-interstitial #134)
- CONTINUE, face / lip / text: #93D333 (owl, dark) / #79B933 (tree-frog, dark) / #131F24 (snow, dark) (lesson-dark-review-interstitial dt=player-next (#137) ::before)
- Duo art, fills: #77C800, #78C800, #8EDF00, #F49000, #FFC100, #FFDD00 (NO PALETTE MATCH, illustration colours), #FFFFFF, #4B4B4B (lesson-dark-review-interstitial svg (#33) descendants)

Tokens (light):
- bubble, background: #FFFFFF (snow, light), derived, not captured (css:4779-c36ad395.css ._36bu_ (palette:snow))
- bubble, border: #E5E5E5 (swan, light), derived, not captured (css:4779-c36ad395.css ._36bu_ (palette:swan))
- bubble, text: #3C3C3C (black-text, light), derived, not captured (css:app-f2ef02f8.css body (palette:black-text))
- CONTINUE, face / lip / text: #58CC02 (owl, light) / #58A700 (tree-frog, light) / #FFFFFF (snow, light) (captured on the same footer button in lesson-light-combo-interstitial dt=player-next (#43) ::before)

Type:
- bubble text: inherited family, weight 500 (body), 19px / 26.6px (line-height 1.4) (lesson-dark-review-interstitial #129; css:4358-6896adab.css ._1K3po { font-size:19px; line-height:1.4 })
- CONTINUE: 700, 17px / 20.4px, letter-spacing 0.8px, uppercase (lesson-dark-review-interstitial #138 span._9lHjd)

Contains: popover shell (speech bubble variant, caret left), button: primary (owl), lesson footer size 150x50

Desktop vs mobile: No @media rules on the bubble or Duo classes (_1K3po, _2ka0w, En_6d, _2GMvD, D0iFS). No mobile lesson capture exists.

Crops: [dark](crops/review-interstitial-dark.png)

Gaps: light theme not captured: light values derived from CSS variables and palette; mobile layout not captured; the body text of the bubble has no own colour on the node, so its colour comes from the body rule

### Combo interstitial ("5 in a row!")
Where: /lesson, after 5 correct answers in a row; full content area canvas animation plus caption

Anatomy:
- full-width canvas animation (content area 1384 x 557)
- caption "5 IN A ROW!" centred at 27% from the top
- footer: CONTINUE (primary, owl)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| animation stage | width x height | 100% x 100% of the content area (1384 x 557), overflow hidden | lesson-light-combo-interstitial cl=lhIpf (#33), canvas (#35); css:4358-6896adab.css .lhIpf |
| caption row | position | absolute, top:27%, translateY(-50%), flex centred, full width | lesson-light-combo-interstitial cl=_2cZ22 (#36); css:4358-6896adab.css ._2cZ22 |
| caption | size | font-size 40px scaled by scale:.54 (computed 35.142px mid-animation), line-height 1.2, max-width 300px | css:4358-6896adab.css ._1xB7m; lesson-light-combo-interstitial cl=_1xB7m (#37) |
| caption | letter-spacing | .03em (1.054px at the captured size) | lesson-light-combo-interstitial #37 |

| State | What changes | Source |
| --- | --- | --- |
| hover (primary lip button) | filter: var(--__internal__filter-hover) (brightness(1.1) default), only when (hover:hover) | css:4779-c36ad395.css ._1VYyp:hover:not(._2wryV):not(.ypJiL) @media (hover:hover) |
| active (primary lip button) | transform: translateY(lip width 4px); ::before box-shadow none (lip disappears) | css:4779-c36ad395.css ._1VYyp:active:not(._2wryV), ._1VYyp:active:not(._2wryV):before |
| enter | caption starts opacity 0 and scale .54; the dump caught the slide at opacity 0, translateX(50px) | css:4358-6896adab.css ._1xB7m { opacity:0; scale:.54 }; captured: lesson-light-combo-interstitial #32, #37 |

Tokens (dark):
- caption, colour: #FFAB33 (fox, dark), derived, not captured (css:4358-6896adab.css ._1xB7m (palette:fox))
- CONTINUE, face / lip / text: #93D333 (owl, dark) / #79B933 (tree-frog, dark) / #131F24 (snow, dark) (captured on the same button in lesson-dark-review-interstitial (#137))

Tokens (light):
- caption, colour: #FF9600 (fox, light) (lesson-light-combo-interstitial cl=_1xB7m (#37))
- CONTINUE, face / lip / text: #58CC02 (owl, light) / #58A700 (tree-frog, light) / #FFFFFF (snow, light) (lesson-light-combo-interstitial dt=player-next (#43) ::before)
- footer, background: #FFFFFF (snow, light) (lesson-light-combo-interstitial #40)

Type:
- caption: inherited family, 700, 40px base (animated scale .54 to 1), line-height 1.2, letter-spacing .03em, uppercase, text-wrap balance (css:4358-6896adab.css ._1xB7m)

Contains: button: primary (owl)

Desktop vs mobile: No @media rules for lhIpf, _2cZ22 or _1xB7m. Mobile not captured.

Crops: none (see gaps)

Gaps: screenshot lesson-light-combo-interstitial shows the previous challenge (transition not yet painted), so no crop and no visual of the canvas animation; the canvas artwork (flame or Duo animation) is not inspectable from the dump; final (fully animated) caption size and opacity not captured; only CSS start values and a mid-animation computed size

### Make-it-harder interstitial
Where: /lesson, captured only behind the quit modal in lesson-light-quit-modal (Duo lottie + speech bubble "Great work! Let's make this a bit harder...")

Anatomy:
- Duo lottie (320 x 418) centred in the content area
- speech bubble above Duo (popover shell, caret at the bottom pointing down), pops in with a scale animation

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| stage | layout | absolute flex column centred; >=700px: height 75%, max-height 600px, top 50%, translateY(-50%) | lesson-light-quit-modal cl=flbyJ (#30); css:4358-6896adab.css .flbyJ |
| Duo lottie | width x height | 320 x 418px (var(--lottie-width) x var(--lottie-height)) | lesson-light-quit-modal cl=_1Oj8V (#31), svg (#32); css:4358-6896adab.css ._1Oj8V |
| bubble anchor | position | absolute, centred on Duo (left 50%, translateX(-50%)), max-width 75% | lesson-light-quit-modal cl=_2B4y0 _382wv (#130); css:4358-6896adab.css ._2B4y0, ._382wv |
| bubble | width x height | 240 x 76px (width max-content) | lesson-light-quit-modal cl=_36bu_ _1TmO0 (#132); css:4358-6896adab.css ._3k7HD |
| bubble | padding / border / radius | 16px / 2px solid / 15px | lesson-light-quit-modal #132; css:4358-6896adab.css ._1TmO0 { padding:16px } |
| bubble | gap below | 8px (caret sits in it) | lesson-light-quit-modal cl=_3zpnU _37pE2 (#131); css:4779-c36ad395.css ._37pE2 { margin-bottom:8px } |
| caret | box | 20 x 10px, top: calc(100% - 2px), rotated 180deg, 15px from the bubble edge | lesson-light-quit-modal cl=_3T97b (#133); css:4779-c36ad395.css ._37pE2>._3T97b |

| State | What changes | Source |
| --- | --- | --- |
| bubble enter | scale 0 to 1 over .63s cubic-bezier(.22,1,.36,1), fill-mode both | css:4358-6896adab.css ._1Fcao + @keyframes _1Fcao |

Tokens (dark):
- bubble, background / border: #131F24 (snow, dark) / #37464F (swan, dark), derived, not captured (css:4779-c36ad395.css ._36bu_ (palette:snow, swan))

Tokens (light):
- bubble, background / border: #FFFFFF (snow, light) / #E5E5E5 (swan, light) (lesson-light-quit-modal #132)
- bubble, text: #3C3C3C (black-text, light), inherited (css:app-f2ef02f8.css body)
- Duo lottie, fills: #58CC02 (owl), #89E219 (mask-green), #FF4B4B (cardinal), #4B4B4B (eel), #FFFFFF plus illustration colours #14C3FB, #4AAE00, #A15803, #F49000, #FFB0E4, #FFC200 (NO PALETTE MATCH) (lesson-light-quit-modal svg (#32) descendants)

Type:
- bubble text: inherited body type: 500, 17px / 20px (no own font rules on _1TmO0) (css:app-f2ef02f8.css body { font:500 17px/20px })

Contains: popover shell (speech bubble, caret bottom)

Desktop vs mobile: flbyJ: below 700px the stage fills 100% height from the top; at >=700px it is 75% high (max 600px) and vertically centred (css:4358-6896adab.css .flbyJ @media (min-width:700px)).

Crops: none (see gaps)

Gaps: only present behind the quit modal: the screenshot shows the modal over it, so no crop; no standalone dump or dark capture; footer state during this interstitial unknown

### Quit lesson modal
Where: /lesson after clicking dt=quit-button; modal card inside cl=_3Mzt6 over dt=drawer-backdrop

Anatomy:
- backdrop (black 40%)
- card (384 wide, 16 radius, 24 padding)
- art: sad Duo image 120 x 120
- title "Wait, don't go! You'll lose your progress if you quit now"
- KEEP LEARNING (primary, macaw, full width)
- END SESSION (text button, cardinal, 32 high)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| card | width x height | 384 x 387px | lesson-dark-quit-modal cl=_1yFTM _3fFQQ FohH5 _3Dms8 (#132); lesson-light-quit-modal (#148) |
| card | padding / margin / radius | 24px / 24px / 16px | lesson-dark-quit-modal #132; css:app-f2ef02f8.css ._1yFTM, css:4243-a8d324a8.css ._3Dms8 { --modal-padding:24px; width:384px } |
| card | position | centred both axes in a flex wrapper, min-height = viewport, z-index 310 | lesson-dark-quit-modal cl=_3Mzt6 (#131); css:app-f2ef02f8.css ._3Mzt6 |
| content | width | 336px (card minus padding), flex column centred, text centred | lesson-dark-quit-modal cl=_2d-gN (#133) |
| art | width x height | 120 x 120px, margin-top 8px (wrapper 120 x 133) | lesson-dark-quit-modal cl=_2g5dx (#135), V9gXn (#134) |
| title | width x height | 336 x 64px (2 lines), margin-top 12px | lesson-dark-quit-modal cl=_3r1YP (#136) |
| KEEP LEARNING | width x height | 336 x 50px (width 100%), margin-top 32px, radius 16px, lip 4px | lesson-dark-quit-modal dt=notification-button (#137); css ._1V1Gt, .vSCTx |
| END SESSION | width x height | 336 x 32px (--web-ui_button-height:32px), margin-top 16px, no face, no lip | lesson-dark-quit-modal dt=notification-drawer-no-thanks-button (#139); css ._2xxrg |
| backdrop | z-index | 300 (modal wrapper 310) | lesson-dark-quit-modal dt=drawer-backdrop (#127) |

| State | What changes | Source |
| --- | --- | --- |
| hover (primary lip button) | filter: var(--__internal__filter-hover) (brightness(1.1) default), only when (hover:hover) | css:4779-c36ad395.css ._1VYyp:hover:not(._2wryV):not(.ypJiL) @media (hover:hover) |
| active (primary lip button) | transform: translateY(lip width 4px); ::before box-shadow none (lip disappears) | css:4779-c36ad395.css ._1VYyp:active:not(._2wryV), ._1VYyp:active:not(._2wryV):before |
| END SESSION hover | filter: var(--__internal__filter-hover), brightness(1.1) by default | css:4779-c36ad395.css .c1Mv-:hover:not(._2wryV):not(.ypJiL) @media (hover:hover) |
| END SESSION disabled | opacity .4 | css:4779-c36ad395.css .c1Mv-._2wryV:not(._3fmUm) |
| open | drawer-backdrop opacity 1 (it is 0 in every non-modal lesson dump) | captured: lesson-dark-quit-modal #127 vs lesson-dark-complete #52 |

Tokens (dark):
- backdrop, background: #000000 @0.40 (black) (lesson-dark-quit-modal dt=drawer-backdrop (#127))
- card, background: #131F24 (snow, dark) (lesson-dark-quit-modal #132)
- title, colour: #F1F7FB (eel, dark); equals body colour so not on the node (css:1060-a4cddb41.css ._3r1YP { color:rgb(var(--color-eel)) })
- KEEP LEARNING, face / lip / text: #49C0F8 (macaw, dark) / #1899D6 (whale) / #131F24 (snow, dark) (lesson-dark-quit-modal dt=notification-button (#137) ::before)
- END SESSION, text: #EE5555 (cardinal, dark) (lesson-dark-quit-modal #139; css:app-f2ef02f8.css ._27kss { --web-ui_button-color:cardinal })

Tokens (light):
- backdrop, background: #000000 @0.40 (black) (lesson-light-quit-modal dt=drawer-backdrop (#143))
- card, background: #FFFFFF (snow, light) (lesson-light-quit-modal #148)
- title, colour: #4B4B4B (eel, light) (lesson-light-quit-modal cl=_3r1YP (#152))
- KEEP LEARNING, face / lip / text: #1CB0F6 (macaw, light) / #1899D6 (whale) / #FFFFFF (snow, light) (lesson-light-quit-modal dt=notification-button (#153) ::before)
- END SESSION, text: #FF4B4B (cardinal, light) (lesson-light-quit-modal #155)

Type:
- title: duolingo-sans 700, 24px / 32px (heading-medium: 1.5rem / 2rem), no casing (lesson-dark-quit-modal #136; css:1060-a4cddb41.css ._3r1YP font:var(--text-heading-*-medium))
- buttons: duolingo-sans 700, 15px / 18px, letter-spacing 0.8px, uppercase (lesson-dark-quit-modal #137, #139)

Contains: modal, button: primary (macaw), button: text/ghost (cardinal)

Desktop vs mobile: No @media rules on _1yFTM, _3fFQQ, FohH5 or _3Dms8: the card keeps width 384px and 24px margins. Mobile not captured.

Crops: [dark](crops/quit-modal-dark.png) · [light](crops/quit-modal-light.png)

Gaps: art image URL not recorded in the dump (img src not captured); card box-shadow: none present in dump or CSS

Notes: Stacking: backdrop z-index 300, modal wrapper 310, so the card is not dimmed.

### Lesson complete screen
Where: /lesson end screen: title cl=_3z6AH, stat cards cl=_23WOw, footer Review lesson + dt=player-next

Anatomy:
- illustration (Duo + character, lottie; not in the dump)
- title "Lesson Complete!"
- stat cards row (2 cards, gap 16): each card = outer coloured frame (strip) + label strip text + inner value box (icon + animated counter)
- footer: REVIEW LESSON (outline, left) and CONTINUE (primary owl, right)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| title | height / margins | line box 20px (inherits body line-height 20px), margin 44px top and bottom when viewport height >=750px (20px otherwise) | lesson-dark-complete cl=_3z6AH (#11), _3dwfW (#10); css:1008-b4d34396.css ._3dwfW |
| cards row | gap | 16px (10px below 350px) | lesson-dark-complete cl=_21KAg (#12); css:1008-b4d34396.css ._21KAg |
| card | width x height | 163 x 94px (118px base, 130px >=300px, 163px >=380px) | lesson-dark-complete cl=_23WOw (#13); css:1008-b4d34396.css ._23WOw |
| card | radius / overflow | 16px / hidden | lesson-dark-complete #13 |
| outer frame (strip) | size | absolute, 100% x 100% of the card, radius 16px, z-index -1 | lesson-dark-complete cl=_3IRrf (#14); css:1008-b4d34396.css ._3IRrf |
| label strip | height / padding | 24px (4px + 16px line + 4px) | lesson-dark-complete cl=d8ITn (#15) |
| value box | width x height | 163 x 70px (height:70px), border 2px, radius 16px | lesson-dark-complete cl=_5KPRI (#16); css:1008-b4d34396.css ._5KPRI |
| value icon | width x height, gap | 18 x 23px, margin-right 8px | lesson-dark-complete cl=_35hcT _3DJ9E (#17) |
| counter digit | width x height | 11 x 20px per digit column (--counter-digit-height 20px, 4px vertical padding) | lesson-dark-complete cl=_3lEig (#19); css:2634-6b22725c.css ._3lEig |
| footer buttons | width x height | REVIEW LESSON 163 x 50 (min 150), CONTINUE 150 x 50 | lesson-dark-complete #46, dt=player-next (#49) |

| State | What changes | Source |
| --- | --- | --- |
| hover (primary lip button) | filter: var(--__internal__filter-hover) (brightness(1.1) default), only when (hover:hover) | css:4779-c36ad395.css ._1VYyp:hover:not(._2wryV):not(.ypJiL) @media (hover:hover) |
| active (primary lip button) | transform: translateY(lip width 4px); ::before box-shadow none (lip disappears) | css:4779-c36ad395.css ._1VYyp:active:not(._2wryV), ._1VYyp:active:not(._2wryV):before |
| hover (Review lesson, outline button) | filter: var(--__internal__filter-hover) | css:4779-c36ad395.css ._2V6ug:hover:not(._2wryV):not(.ypJiL) @media (hover:hover) |
| active (Review lesson, outline button) | transform: translateY(2px); ::before box-shadow none | css:4779-c36ad395.css ._2V6ug:active:not(._2wryV), ._2V6ug:active:not(._2wryV):before |
| card enter | frame: starts snow + translateY(30px), holds to 50%, lands at translateY(0) over .2s | css:1008-b4d34396.css @keyframes _1XPDD |
| value box enter | scale 0 + opacity 0 + border swan, to scale 1 at 50%, border to bee at 100% (.1s) | css:1008-b4d34396.css @keyframes _21BxP |
| label enter | translateY(30px) to 0 over .2s | css:1008-b4d34396.css @keyframes _3WCjQ |
| counter roll | each digit column translates by --counter-digit-offset (captured at -24px and -104px) | css:2634-6b22725c.css ._1xrp_; captured: lesson-dark-complete #20 to #40 |
| second card hidden | opacity 0 until revealed | css:1008-b4d34396.css ._3p1TI { opacity:0 }; captured: lesson-dark-complete cl=_3p1TI _23WOw (#41) |

Tokens (dark):
- title, colour: #FFC700 (bee, dark) (lesson-dark-complete #11)
- card, background: #131F24 (snow, dark) (lesson-dark-complete #13)
- card: bee variant, frame / label text / value border / value text: #FFC700 (bee, dark) / #131F24 (snow, dark) / #FFC700 / #FFC700 (lesson-dark-complete #14, #15, #16)
- value box, background: #131F24 (snow, dark) (lesson-dark-complete #16)
- card: owl variant (accuracy, "GREAT!"), frame / border / value text: #93D333 (owl, dark), derived from CSS, not captured in the dump (css:1008-b4d34396.css ._52uc9, .uiOhM (palette:owl))
- card: macaw variant, frame / border / value text: #49C0F8 (macaw, dark), derived (css:1008-b4d34396.css ._27CoB/._2f4A8, ._36aXx/._2c6u3)
- card: beetle variant, frame / border / value text: #CE82FF (beetle), derived (css:1008-b4d34396.css ._2IhSJ, ._2_GKE)
- card: teal variant, frame / border / value text: #00C495 (NO PALETTE MATCH, literal in CSS) (css:1008-b4d34396.css ._33C3y, ._2O_yN)
- REVIEW LESSON, face / border+lip / text: #131F24 (snow, dark) / #37464F (swan, dark) / #52656D (hare, dark) (lesson-dark-complete #46 ::before)
- CONTINUE, face / lip / text: #93D333 (owl, dark) / #79B933 (tree-frog, dark) / #131F24 (snow, dark) (lesson-dark-complete dt=player-next (#49) ::before)

Tokens (light):
- title, colour: #FFC800 (bee, light), derived, not captured (css:1008-b4d34396.css ._3z6AH (palette:bee))
- card / value box, background: #FFFFFF (snow, light), derived (css:1008-b4d34396.css ._23WOw, ._5KPRI)
- card: bee variant, frame / border / value text: #FFC800 (bee, light); label text #FFFFFF (snow, light), derived (css:1008-b4d34396.css ._3IRrf, ._5KPRI, .d8ITn)
- card: owl variant, frame / border / value text: #58CC02 (owl, light), derived (css:1008-b4d34396.css ._52uc9, .uiOhM)
- REVIEW LESSON, face / border+lip / text: #FFFFFF (snow) / #E5E5E5 (swan) / #AFAFAF (hare) (captured on the same end-screen footer in lesson-light-video-ad (#9) ::before)
- CONTINUE, face / lip / text: #58CC02 (owl) / #58A700 (tree-frog) / #FFFFFF (snow) (lesson-light-video-ad dt=player-next (#12) ::before)

Type:
- title: inherited family, 700, 32px (25px below 700px wide), line-height 20px inherited (lesson-dark-complete #11; css:1008-b4d34396.css ._3z6AH)
- label strip: 700, 13px / 16px, uppercase (lesson-dark-complete #15; css:1008-b4d34396.css .d8ITn)
- value: 700, 20px (16px below 300px), digits line-height 20px (lesson-dark-complete #16; css:1008-b4d34396.css ._5KPRI)
- footer buttons: 700, 17px (>=700px via --web-ui_button-font-size) / 20.4px, letter-spacing 0.8px, uppercase (lesson-dark-complete #47, #50; css:1008-b4d34396.css ._3fo6Q, ._3DbUj)

Contains: button: primary (owl), button: secondary/outline (Review lesson)

Desktop vs mobile: Title 25px below 700px, 32px at >=700px; card width 118 / 130 (>=300px) / 163 (>=380px); cards gap 10 / 16 (>=350px); value 16px / 20px (>=300px); title margins 20px / 44px (min-height:750px); whole stack scale(.7) when max-height:500px; footer buttons full width below 700px and grid-placed at >=700px (css:1008-b4d34396.css ._3SXFk, ._3dwfW, ._3z6AH, ._21KAg, ._23WOw, ._5KPRI, ._3h0lA, .MYehf). Mobile not captured.

Crops: [dark](crops/lesson-complete-dark.png)

Gaps: dump captured mid-animation: first card label reads "combo" and the second card is opacity 0 with no children; the screenshot (later moment) shows "TOTAL XP 15" (bee) and "GREAT! 94%" (owl). Label texts and accuracy card colour are estimated from screenshot; illustration is a lottie not present in the dump; crop top 160px above the title is included only to show it (estimated from screenshot); light theme lesson-complete body not captured (footer light values come from lesson-light-video-ad, which sits on the same end-screen footer); stat icon images (bolt, target) URLs not captured

### Post-lesson streak screen
Where: /lesson after the lesson complete screen: dt=streak-slide (celebration: flame + count + week card) and the calendar variant ("Can you make it to a 2 day streak?")

Anatomy:
- celebration: flame animation (canvas, max 340 square)
- count number (canvas, 340 square)
- "day streak" label
- week card: top section (day columns: label + 34px circle) with a 2px divider, bottom message section
- calendar variant: heading h2, illustration 294 x 160, week card (7 days) with a caret under the next day, tip box
- footer: REVIEW LESSON + CONTINUE (owl) or CONTINUE (macaw) on the celebration

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| flame canvas | size / margins | max-width 340px square (width calc(100vw - 32px)), margin -140px auto 14px | lesson-dark-streak-celebration cl=_3XxHw _2Ylex (#11); css:1008-b4d34396.css ._3XxHw |
| count canvas | size / margins | 340 x 340px, margin -124px auto -44px | lesson-dark-streak-celebration cl=_1PSwR zWgl3 (#13); css:1008-b4d34396.css ._1PSwR |
| "day streak" | width x height, offset | 340 x 28px box, margin-top -110px (overlaps the count canvas) | lesson-dark-streak-celebration cl=Ikkcc _33hhf (#16) |
| week card | width x height | 340 x 168px, radius 12px | lesson-dark-streak-celebration cl=_3kddW tuVG5 _36i3u (#17) |
| week card top | padding / border | 12px / 2px on top and sides, radius 12 12 0 0; a 2px divider (::after, bottom -4px) | lesson-dark-streak-celebration cl=_2k21Q (#18); css:1008-b4d34396.css ._2k21Q, ._2k21Q:after |
| day row | max-width | 280px (5 days) / 392px (7 days, calendar) | lesson-dark-streak-celebration cl=_3Ja2a (#19); lesson-dark-streak-calendar cl=_3LUJ9 (#14) |
| day column | width x height, spacing | 34 x 63px, margin 0 6px (first/last 0) | lesson-dark-streak-celebration cl=_3ahcA (#20); css:1008-b4d34396.css ._3ahcA |
| day label | height / gap | 25px line, 4px below | lesson-dark-streak-celebration cl=_2z97y (#21) |
| day circle | width x height / radius | 34 x 34px / 18px | lesson-dark-streak-celebration cl=Rewuq OfNk6 (#22); css:1008-b4d34396.css .OfNk6 |
| completed-day icon | size | flame/check svg 49 x 64 at margin -29px 0 0 -9px (celebration); 45 x 110 at margin -79px -5px 0, scale 1.05 (calendar) | lesson-dark-streak-celebration cl=_3pSE6 (#23); lesson-dark-streak-calendar cl=_2sjiM (#18) |
| message box | width x height / padding | 340 x 79px / 12px, border 0 2px 2px, radius 0 0 12px 12px | lesson-dark-streak-celebration cl=_36njd uxKQj (#37); css:2634-6b22725c.css .uxKQj |
| calendar heading | max-width / margin | 500px / 0 auto 40px | lesson-dark-streak-calendar cl=SAnU5 (#11) |
| calendar illustration | width x height | 294 x 160px (250 x 136 below 700px) | lesson-dark-streak-calendar cl=_2WyQU (#12); css:1008-b4d34396.css ._2WyQU |
| calendar week card | width x height / padding / margin-top | 340 x 95px / 12px 12px 16px / 40px, border 2px, radius 12 12 0 0 | lesson-dark-streak-calendar cl=_1FNhm (#13); css:1008-b4d34396.css ._1FNhm |
| next-day target circle | border | 2px dashed | lesson-dark-streak-calendar cl=_3g_6k OfNk6 (#39) |
| caret under target | size | 38 x 26px box rotated 45deg (rect 45 x 45), 2px border, radius 2px, margin-top 6px, top 100% | lesson-dark-streak-calendar cl=_2OXpp _2CoFd (#40); css:1008-b4d34396.css ._2OXpp |
| tip box | width x height | 340 x 79px, same uxKQj box as the message | lesson-dark-streak-calendar cl=uZOTl _2CoFd uxKQj (#56) |

| State | What changes | Source |
| --- | --- | --- |
| hover (primary lip button) | filter: var(--__internal__filter-hover) (brightness(1.1) default), only when (hover:hover) | css:4779-c36ad395.css ._1VYyp:hover:not(._2wryV):not(.ypJiL) @media (hover:hover) |
| active (primary lip button) | transform: translateY(lip width 4px); ::before box-shadow none (lip disappears) | css:4779-c36ad395.css ._1VYyp:active:not(._2wryV), ._1VYyp:active:not(._2wryV):before |
| day: completed | circle filled fox with snow check (svg overlay) | captured: lesson-dark-streak-calendar #17 to #36 |
| day: today label | label turns fox (K2FC_) | captured: lesson-dark-streak-celebration #21 |
| day: next-day target | snow fill, 2px dashed fox border, pulse animation _1YWYX .6s; none under html[reduced-motion] | captured: lesson-dark-streak-calendar #39; css:1008-b4d34396.css ._3g_6k, html[reduced-motion] ._3g_6k |
| day: future | swan circle, hare label | captured: lesson-dark-streak-calendar #43 |
| enter | label and card start opacity 0 (card translateY(54px)); flame scale 1.316 + translateY(78px) and count translateY(112px) settle to identity over 1s cubic-bezier(.74,0,.11,.96) | css:1008-b4d34396.css .Ikkcc, ._3kddW, ._3XxHw, ._1PSwR; mid-transition captured: lesson-dark-streak-celebration #16 opacity .28, #17 opacity .63 |
| tip / caret enter | fade in (_3Y2NM .3s) after .3s delay | css:1008-b4d34396.css .uZOTl, ._2OXpp; css:app-f2ef02f8.css ._2CoFd |

Tokens (dark):
- "day streak", colour: #FFAB33 (fox, dark) (lesson-dark-streak-celebration #16)
- week card, background: #131F24 (snow, dark) (lesson-dark-streak-celebration #17)
- week card, border: #37464F (swan, dark) (lesson-dark-streak-celebration #18, #37)
- divider, background: #202F36 (polar, dark) (lesson-dark-streak-celebration #18 ::after)
- day label (today), colour: #FFAB33 (fox, dark) (lesson-dark-streak-celebration cl=K2FC_ (#21))
- day label (other), colour: #52656D (hare, dark) (lesson-dark-streak-celebration #26)
- day circle (future), background: #37464F (swan, dark) (lesson-dark-streak-celebration cl=Rewuq (#27))
- day circle (completed), fill / check stroke: #FFAB33 (fox, dark) / #131F24 (snow, dark) (lesson-dark-streak-calendar svg paths (#23, #27, #30, #33) and check (#36))
- day circle (next-day target), background / dashed border: #131F24 (snow, dark) / #FFAB33 (fox, dark) (lesson-dark-streak-calendar cl=_3g_6k (#39))
- caret, background / border: #131F24 (snow, dark) / #37464F (swan, dark) (lesson-dark-streak-calendar #40)
- message / tip text, colour: #DCE6EC (wolf, dark); highlighted spans fox (lesson-dark-streak-celebration #37; css:1008-b4d34396.css ._36njd>span>span)
- calendar heading, colour: #F1F7FB (black-text, dark), inherited (css:app-f2ef02f8.css body)
- CONTINUE (celebration), face / lip / text: #49C0F8 (macaw, dark) / #1899D6 (whale) / #131F24 (snow, dark) (lesson-dark-streak-celebration dt=player-next (#45) ::before)
- CONTINUE (calendar), face / lip / text: #93D333 (owl, dark) / #79B933 (tree-frog, dark) / #131F24 (lesson-dark-streak-calendar dt=player-next (#64))

Tokens (light):
- "day streak", today label, completed day, target dashed border, colour: #FF9600 (fox, light), derived, not captured (css:1008-b4d34396.css .Ikkcc, .K2FC_, ._3g_6k (palette:fox))
- week card / message border, future circle, colour: #E5E5E5 (swan, light), derived (css:1008-b4d34396.css ._2k21Q, .Rewuq; css:2634-6b22725c.css .uxKQj)
- divider, background: #F7F7F7 (polar, light), derived (css:1008-b4d34396.css ._2k21Q:after)
- day labels, colour: #AFAFAF (hare, light), derived (css:1008-b4d34396.css ._2z97y)
- message text, colour: #777777 (wolf, light), derived (css:2634-6b22725c.css .uxKQj)
- card / target circle background, colour: #FFFFFF (snow, light), derived (css:1008-b4d34396.css ._3kddW, ._3g_6k)

Type:
- "day streak": duolingo-sans 700, 28px / 32px (heading-large 1.75rem / 2rem) (lesson-dark-streak-celebration #16; css:1008-b4d34396.css .Ikkcc)
- day label: 700, 17px / 25px (css:1008-b4d34396.css ._2z97y)
- message / tip: inherited family, 500, 19px / 26.6px (1.4) (css:2634-6b22725c.css .uxKQj)
- calendar heading: 700, 25px, line-height 26px (lesson-dark-streak-calendar cl=SAnU5 (#11))

Contains: button: primary (owl, macaw), button: secondary/outline (Review lesson)

Desktop vs mobile: Day columns margin 0 2px and scale(.9) below 360px, 0 6px at >=360px; caret hidden below 340px; calendar illustration 250 x 136 below 700px; flame and count canvases width calc(100vw - 32px) capped at 340px (css:1008-b4d34396.css). Mobile not captured.

Crops: [dark](crops/streak-screen-dark.png) · [calendar-dark](crops/streak-screen--calendar-dark.png) (crop offset [-37, -5])

Gaps: the streak count ("1") and flame are canvas animations: no type style or colour recorded for the number (it looks fox in the screenshot, estimated); celebration screenshot is a later moment than the dump (layout shifted about 37px left; footer button reads "I CAN DO IT!"); crop uses dx=-37, dy=-5; light theme not captured: all light values derived; streak freeze or perfect-week day states not present

### Streak goal picker
Where: /lesson after the streak screen: speech bubble + illustration, then role=radiogroup aria-label=goal with 4 role=radio rows (dt=streak-goal-option on the right-hand label)

Anatomy:
- speech bubble (254 wide) with caret image, text revealed letter by letter
- illustration (calendar flame + Duo svg, 254 x 204) with a "7" numeral overlay
- radio list: 4 rows (label left, grade right)
- footer: I CAN DO IT! (primary, disabled until a row is picked)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| column | max-width | 640px centred, grid rows 1fr auto 1fr | lesson-dark-streak-goal-default cl=_3pl7T (#9); css:1008-b4d34396.css ._3pl7T |
| bubble block | width / margin | 254px / 0 auto 32px | lesson-dark-streak-goal-default cl=_2VMB2 (#11) |
| bubble | width x height / padding / border / radius | 254 x 76px / 12px 16px / 2px / 12px | lesson-dark-streak-goal-default cl=_10CrR (#15); css:app-f2ef02f8.css ._10CrR |
| bubble caret | size / offset | 31 x 20px image, 40px right of centre (--duo-speech-bubble-caret-offset), bottom 5.5px | lesson-dark-streak-goal-default cl=_1D9cQ (#16); css:app-f2ef02f8.css ._1D9cQ; css:1008-b4d34396.css ._2VMB2 |
| illustration | height | 204px (overlaps bubble by margin-bottom -32px on the bubble grid) | lesson-dark-streak-goal-default cl=_38xtY (#106); css:1008-b4d34396.css ._38xtY, .M6NLh |
| list | width / gap | 480px max / 12px | lesson-dark-streak-goal-default cl=_13-RH (#244) |
| row | width x height | 480 x 54px | lesson-dark-streak-goal-default cl=_8dMUn a3yOs (#245) |
| row | padding | 8px 16px, space-between | lesson-dark-streak-goal-default #245; css:1008-b4d34396.css .a3yOs |
| row | border / lip / radius | transparent 2px 2px 4px on the element; visible 2px border + 2px lip (box-shadow 0 2px) on ::before inset -2px; radius 12px | lesson-dark-streak-goal-default #245 ::before; css:4779-c36ad395.css ._8dMUn, ._8dMUn:before |
| row label | width x height | 103 x 32px (auto) | lesson-dark-streak-goal-default cl=WMgCJ (#246) |
| grade | height | 24px | lesson-dark-streak-goal-default dt=streak-goal-option cl=g4E00 (#247) |
| numeral overlay | position | absolute, left 38%, bottom 18%, translate(-50%,-50%) | lesson-dark-streak-goal-default cl=G8vvg (#243); css:1008-b4d34396.css .G8vvg |
| CTA | width x height | 150 x 50px | lesson-dark-streak-goal-default dt=player-next (#261) |

| State | What changes | Source |
| --- | --- | --- |
| row hover | ::before background #131F24 to #202F36 (polar, dark); border and lip unchanged | captured: lesson-dark-streak-goal-row-hover cl=_8dMUn (#242) diff vs lesson-dark-streak-goal-default (#245); css:4779-c36ad395.css ._8dMUn:hover:not(:active):not(._1pRZ7):not(._3neHb):before @media (hover:hover) |
| row active | translateY(2px), ::before lip removed, border blue-jay (#84D8FF L / #3F85A7 D), face iguana (#DDF4FF L / #202F36 D), text whale #1899D6 | css:4779-c36ad395.css ._8dMUn:active:not(._3neHb), ...:before |
| row selected (._1pRZ7) | same colours as active (blue-jay border, iguana face, whale text), lip kept | css:4779-c36ad395.css ._8dMUn._1pRZ7, ._8dMUn._1pRZ7:before |
| row disabled (._3neHb) | text swan, cursor default, translateY(2px) and no lip | css:4779-c36ad395.css ._8dMUn._3neHb... |
| CTA disabled | face swan, text hare, lip removed, translateY(4px) | captured: lesson-dark-streak-goal-default dt=player-next cl=_2wryV (#261); css:4779-c36ad395.css ._1VYyp._2wryV:not(._3fmUm) |
| list reveal | list opacity calc(1 - --streak-goal-before-slide-up) and content translateY(140px * var) over .35s | css:1008-b4d34396.css ._13-RH, ._36XSq |

Tokens (dark):
- row face, background: #131F24 (snow, dark) (lesson-dark-streak-goal-default #245 ::before)
- row border + lip, colour: #37464F (swan, dark) (lesson-dark-streak-goal-default #245 ::before)
- row text, colour: #F1F7FB (black-text, dark), inherited (css:app-f2ef02f8.css body)
- bubble, background / border: #131F24 (snow, dark) / #37464F (swan, dark) (lesson-dark-streak-goal-default #15)
- numeral, colour: #FF4B4B (cardinal-always-light) (lesson-dark-streak-goal-default cl=G8vvg (#243))
- CTA disabled, face / text: #37464F (swan, dark) / #52656D (hare, dark), no lip (lesson-dark-streak-goal-default dt=player-next (#261) ::before)

Tokens (light):
- row face, background: #FFFFFF (snow, light), derived, not captured (css:4779-c36ad395.css ._8dMUn:before (--web-ui_card-background-color default snow))
- row border + lip, colour: #E5E5E5 (swan, light), derived (css:4779-c36ad395.css ._8dMUn (--web-ui_card-border-color default swan))
- row hover face, background: #F7F7F7 (polar, light), derived (css:4779-c36ad395.css ._8dMUn:hover...:before)
- bubble, background / border: #FFFFFF / #E5E5E5, derived (css:app-f2ef02f8.css ._10CrR)

Type:
- row label: duolingo-sans 700, 20px / 32px (text-body-spacious-bold: 1.25rem / 2rem) (lesson-dark-streak-goal-default #246; css:1008-b4d34396.css .WMgCJ)
- grade: duolingo-sans 500, 16px / 24px (text-caption: 1rem / 1.5rem) (lesson-dark-streak-goal-default #247; css:1008-b4d34396.css .g4E00)
- bubble: inherited family, 20px / 24px (lesson-dark-streak-goal-default #15)
- numeral: 700, 40px (css:1008-b4d34396.css .G8vvg)

Contains: card/radio row (web-ui card, _8dMUn), button: primary (disabled), speech bubble

Desktop vs mobile: _36XSq gets padding 16px 0 at >=700px; _3pl7T becomes height 100% with its own scroll at >=700px (css:1008-b4d34396.css). Mobile not captured.

Crops: [dark](crops/streak-goal-list-dark.png) · [hover-dark](crops/streak-goal-list--hover-dark.png) (crop offset [0, 4])

Gaps: selected row not captured (only CSS); light theme not captured; bubble text is split into per-letter spans (typing reveal); final typography only

### Friend streak invite list
Where: /lesson after the streak screens: sticky header (illustration, h2, remaining count) + bordered friend table with INVITE buttons

Anatomy:
- sticky header: illustration 214 x 199, heading, "5 invites remaining", hidden divider shown on scroll
- table: 2px bordered box, radius 16
- row: avatar 40 round, name, INVITE small primary (macaw)
- footer: REVIEW LESSON + CONTINUE (owl)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| scroll area | margin | 32px (16px below 700px) | lesson-dark-friend-streak-invite cl=QuvtB _2Yntw (#9); css:1008-b4d34396.css .QuvtB |
| column | max-width | 400px | lesson-dark-friend-streak-invite cl=_1oVn_ (#10) |
| header | position | sticky, top 0, z-index 1 | lesson-dark-friend-streak-invite cl=_3-LZT (#11); css:1008-b4d34396.css ._3-LZT |
| illustration | width x height | 214 x 199px (height 213px >=700px, max-height calc(50vh - 200px)), margin-bottom 16px | lesson-dark-friend-streak-invite cl=_3-dw5 (#13); css:1008-b4d34396.css ._3-dw5 |
| heading | width / margin | 368px / 0 16px 8px | lesson-dark-friend-streak-invite cl=_3-rnE (#14) |
| count | margin | 0 16px 16px | lesson-dark-friend-streak-invite cl=_1k4BL (#15) |
| header divider | size | 2px bottom border, margin 0 -16px (432 wide), opacity 0 | lesson-dark-friend-streak-invite cl=TzE33 (#16) |
| table | border / radius | 2px / 16px | lesson-dark-friend-streak-invite cl=_1pa14 (#17) |
| row | width x height | 396 x 76px (min-height 76px) | lesson-dark-friend-streak-invite cl=_2OBb8 (#18) |
| row | padding / gap / columns | 12px 16px / 12px / min-content 1fr max-content | lesson-dark-friend-streak-invite #18; css:2634-6b22725c.css ._2OBb8 |
| row divider | border | 2px bottom on every row but the last | css:2634-6b22725c.css ._2OBb8:not(:last-child) |
| avatar | size / radius | 40 x 40px / 50% | lesson-dark-friend-streak-invite cl=_1yM9n (#19) |
| name | width x height | 240 x 28px, single line with ellipsis | lesson-dark-friend-streak-invite cl=_3FnZP (#20) |
| INVITE | width x height | 60 x 32px (min-width 60px), padding 0 8px, radius 8px, lip 4px | lesson-dark-friend-streak-invite cl=_3q--f _20olS _1W_p8 _38OE1 (#22); css:4779-c36ad395.css ._20olS._1W_p8 |

| State | What changes | Source |
| --- | --- | --- |
| hover (primary lip button) | filter: var(--__internal__filter-hover) (brightness(1.1) default), only when (hover:hover) | css:4779-c36ad395.css ._1VYyp:hover:not(._2wryV):not(.ypJiL) @media (hover:hover) |
| active (primary lip button) | transform: translateY(lip width 4px); ::before box-shadow none (lip disappears) | css:4779-c36ad395.css ._1VYyp:active:not(._2wryV), ._1VYyp:active:not(._2wryV):before |
| header scrolled | divider TzE33 fades from opacity 0 (transition opacity .3s); the visible state is toggled by script | css:1008-b4d34396.css .TzE33; not captured |
| table border change | border-color transition .3s via --friend-streak-table-border-color | css:2634-6b22725c.css ._1pa14, ._2OBb8; not captured |
| invited (after click) | not captured | not captured |

Tokens (dark):
- header, background: #131F24 (snow, dark) (lesson-dark-friend-streak-invite #11)
- heading, colour: #F1F7FB (black-text, dark), inherited (css:app-f2ef02f8.css body)
- count, colour: #52656D (hare, dark) (lesson-dark-friend-streak-invite #15)
- table border, row dividers, header divider, colour: #37464F (swan, dark) (lesson-dark-friend-streak-invite #17, #18, #16)
- INVITE, face / lip / text: #49C0F8 (macaw, dark) / #1899D6 (whale) / #131F24 (snow, dark) (lesson-dark-friend-streak-invite #22 ::before)
- CONTINUE / REVIEW LESSON, colours: owl #93D333 + tree-frog #79B933 / snow + swan + hare, as on lesson complete (lesson-dark-friend-streak-invite dt=player-next (#73), #70)

Tokens (light):
- header, background: #FFFFFF (snow, light), derived, not captured (css:1008-b4d34396.css ._3-LZT)
- count, colour: #AFAFAF (hare, light), derived (css:1008-b4d34396.css ._1k4BL)
- table border, dividers, colour: #E5E5E5 (swan, light), derived (overridable by --friend-streak-table-border-color) (css:2634-6b22725c.css ._1pa14, ._2OBb8)
- INVITE, face / lip / text: #1CB0F6 (macaw, light) / #1899D6 (whale) / #FFFFFF, derived (palette:macaw, whale, snow)

Type:
- heading: duolingo-sans 700, 24px / 32px (heading-medium) (lesson-dark-friend-streak-invite #14; css:1008-b4d34396.css ._3-rnE)
- count: duolingo-sans 500, 20px / 28px (text-body in this context) (lesson-dark-friend-streak-invite #15; css:1008-b4d34396.css ._1k4BL)
- name: duolingo-sans 700, 20px / 28px (text-body-weight-bold) (lesson-dark-friend-streak-invite #20; css:2634-6b22725c.css ._3FnZP)
- INVITE: 700, 14px / 28px, letter-spacing 0.56px (.04em), uppercase (lesson-dark-friend-streak-invite #23)

Contains: button: primary small (macaw, 32px), avatar, list

Desktop vs mobile: Outer margin 16px below 700px and 32px at >=700px; illustration 148px high below 700px and 213px at >=700px (css:1008-b4d34396.css .QuvtB, ._3-dw5). Mobile not captured.

Crops: [dark](crops/friend-streak-invite-dark.png)

Gaps: light theme not captured; INVITE pressed / invited state not captured; list continues below the footer (rows to y=975), only 4 rows visible

### Super upsell screens
Where: /lesson end flow: practice-hub ad (dt=practice-hub-ad-*), trial reminder picker (dt=trial-reminder, dt=plus-continue, dt=plus-no-thanks), and a full-screen video ad

Anatomy:
- practice-hub ad (dark capture): eclipse background, SUPER logo top right, hero image 400 x 428, h1, footer with NO THANKS (outline white) and GET STARTED (white)
- trial reminder (light capture): gradient sky, close X top left, SUPER logo top right, h1, lottie over a cloud band, #FAFAFA lower panel with option rows, disclaimer, START MY FREE WEEK (cosmos, disabled until a row is picked), NO THANKS (cosmos text)
- video ad (light capture): black full screen, video object-fit contain, close X top left and mute toggle top right

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| ad: logo | width x height / position | 87 x 23px / top 40px, right 40px (10px below 700px) | lesson-dark-super-upsell dt=plus-offer-logo cl=UhDGm (#9); css:4358-6896adab.css .UhDGm |
| ad: hero | width x height | 400 x 428px (250px wide below 700px) | lesson-dark-super-upsell cl=_3ZLZ_ (#10); css:4358-6896adab.css ._3ZLZ_ |
| ad: text block | width / margin-top | 350px max (300px below 700px) / -24px | lesson-dark-super-upsell cl=_3TDCm (#11) |
| ad: footer | height / top border | 140px / 1px | lesson-dark-super-upsell cl=_2iHAQ (#13), _3KWA6 (#14) |
| ad: buttons | width x height | 250 x 50px each (min-width 250px, width 100% at >=700px), radius 16px | lesson-dark-super-upsell dt=practice-hub-ad-no-thanks-button (#15), dt=practice-hub-ad-continue-button (#17) |
| trial: close / logo | position / size | top 24px left 24px (19 x 19 X) / top 24px right 34px (103 x 27 logo) | lesson-light-trial-upsell dt=plus-close-x (#21), dt=plus-offer-logo cl=_1OBpI (#25) |
| trial: h1 | width x height / padding / margin | 500 x 76px / 0 16px / 16px auto | lesson-light-trial-upsell dt=trial-reminder cl=_3ifZ6 (#29) |
| trial: art band | height | 239px (30vh, min 200, max 250); lottie canvas 800 x 800 centred; cloud svg repeat-x at bottom, background-size 1800px | lesson-light-trial-upsell cl=JPT4U (#30), _2KpHg (#31), _3KggR (#33); css:3406-0039e405.css .JPT4U, ._3KggR |
| trial: options | width / gap / padding | 500px max / 12px / 8px 16px 0 | lesson-light-trial-upsell role=radiogroup cl=_3tMdg (#35) |
| trial: option row | width x height / padding / border / radius | 468 x 58px / 12px 16px / 2px 2px 4px / 12px | lesson-light-trial-upsell role=radio cl=_2u2n_ (#36) |
| trial: CTA | width x height | 600 x 50px (max-width 600px), radius 16px | lesson-light-trial-upsell dt=plus-continue (#47) |
| trial: NO THANKS | width x height | 112 x 48px (text button) | lesson-light-trial-upsell dt=plus-no-thanks (#49) |
| video: close / mute | size | 68 x 68 (20px icon + 24px padding) / 78 x 71 (30 x 23 icon + 24px padding) | lesson-light-video-ad cl=_1Udkq (#19), _32yet (#21) |

| State | What changes | Source |
| --- | --- | --- |
| hover (primary lip button) | filter: var(--__internal__filter-hover) (brightness(1.1) default), only when (hover:hover) | css:4779-c36ad395.css ._1VYyp:hover:not(._2wryV):not(.ypJiL) @media (hover:hover) |
| active (primary lip button) | transform: translateY(lip width 4px); ::before box-shadow none (lip disappears) | css:4779-c36ad395.css ._1VYyp:active:not(._2wryV), ._1VYyp:active:not(._2wryV):before |
| ad: NO THANKS hover | filter opacity(0.8) | css:app-f2ef02f8.css ._1S2uf { --web-ui_button-filter-hover:opacity(0.8) } |
| ad: NO THANKS disabled | border #FFFFFF @0.20, text #FFFFFF @0.50 | css:app-f2ef02f8.css ._1S2uf |
| ad: GET STARTED disabled | face #FFFFFF @0.30, text eclipse @0.60 | css:app-f2ef02f8.css ._19taU |
| trial: CTA disabled | face swan-always-light, text hare-always-light, lip removed, translateY(4px) | captured: lesson-light-trial-upsell dt=plus-continue cl=_2wryV (#47) |
| trial: option selected / hover | not captured; no stateful rule found on _2u2n_ | not captured |
| screen enter | fade in (_3Y2NM .3s) | css:app-f2ef02f8.css ._2CoFd; captured animation-name on lesson-dark-super-upsell #5 and lesson-light-trial-upsell #17 |

Tokens (dark):
- ad: background (screen and footer), colour: #000437 (eclipse, same both themes) (lesson-dark-super-upsell cl=_2hhqt (#6), _3KWA6 (#14))
- ad: text, colour: #FFFFFF (snow-always-light) (lesson-dark-super-upsell #12; css:4358-6896adab.css ._2hhqt)
- ad: footer top border, colour: #FFFFFF @0.40 (snow-always-light) (lesson-dark-super-upsell #13)
- ad: NO THANKS, face / border+lip / text: transparent / #FFFFFF @0.50 / #FFFFFF (lesson-dark-super-upsell #15 ::before; css:app-f2ef02f8.css ._1S2uf)
- ad: GET STARTED, face / lip / text: #FFFFFF / #FFFFFF @0.50 / #000437 (eclipse) (lesson-dark-super-upsell #17 ::before; css:app-f2ef02f8.css ._19taU)

Tokens (light):
- trial: background, gradient: linear-gradient(172deg, #000437 (unknown-000437/eclipse) 0, #061B4B (half-branded-background-blue-middle) 38.31%, #16378C (half-branded-background-blue-end) 69.3%, #8C3DBA (half-branded-background-purple-end) 100%) (lesson-light-trial-upsell cl=_3YO3u (#18); css:3406-0039e405.css ._3YO3u)
- trial: h1 / top text, colour: #FFFFFF (snow-always-light); highlighted spans #26F663 (gamma) (lesson-light-trial-upsell #29; css:3406-0039e405.css ._3ifZ6>span>span)
- trial: lower panel, background / text: #FAFAFA (unknown-fafafa) / #4B4B4B (eel, light) (lesson-light-trial-upsell cl=_3XsPC (#34))
- trial: option row, background / border / text: #FFFFFF (snow-always-light) / #E5E5E5 (swan, light) / #4B4B4B (eel, light) (lesson-light-trial-upsell #36)
- trial: disclaimer, colour: #777777 (wolf, light) (lesson-light-trial-upsell cl=_1-Pul (#43))
- trial: CTA enabled, face / lip / text: #3C4DFF (cosmos) / #3F22EC (nebula) / #FFFFFF, from CSS vars (css:app-f2ef02f8.css ._3b8r8)
- trial: CTA disabled, face / text: #E5E5E5 (swan-always-light) / #AFAFAF (hare-always-light) (lesson-light-trial-upsell dt=plus-continue (#47) ::before)
- trial: NO THANKS, text: #3C4DFF (cosmos) (lesson-light-trial-upsell dt=plus-no-thanks (#49); css:app-f2ef02f8.css ._2h7HV)
- video: background, colour: #000000 (black) (lesson-light-video-ad cl=_3BWKN (#18))

Type:
- ad: h1: 700, 25px / 34px (21px below 700px) (lesson-dark-super-upsell cl=_1jGvf (#12); css:4358-6896adab.css ._1jGvf)
- ad: buttons: 700, 15px / 18px, letter-spacing 0.8px, uppercase (lesson-dark-super-upsell #16, #18)
- trial: h1: 700, 28px / 1.35 (24px below 530px), text-wrap balance (lesson-light-trial-upsell #29; css:3406-0039e405.css ._3ifZ6)
- trial: option label / date: 700 20px / 28px ; 400 16px / 18.4px (lesson-light-trial-upsell cl=_1En-_ (#37), cl=_1UP1a (#38))
- trial: disclaimer: 500, 16px / 21.6px (1.35) (lesson-light-trial-upsell #43)

Contains: button: primary (white on eclipse, cosmos), button: outline (white 50%), button: text (cosmos), icon button (close, mute)

Desktop vs mobile: Ad: content padding-bottom 100px below 700px and height calc(100% - 140px) at >=700px; logo inset 10px vs 40px; hero 250px vs 400px; h1 21px vs 25px; footer top border only at >=700px; NO THANKS order 1 (below GET STARTED) below 700px; buttons margin 0 16px below 700px (css:4358-6896adab.css ._3AYrR, .UhDGm, ._3ZLZ_, ._1jGvf, ._2iHAQ, ._76ebC, .cnGdv). Trial: h1 28px at >=530px, button stack gaps 8/4 vs 16/8 (css:3406-0039e405.css ._3ifZ6, .OvpzU). Mobile not captured.

Crops: [dark](crops/super-upsell-dark.png) · [trial-light](crops/super-upsell--trial-light.png) · [video-ad-light](crops/super-upsell--video-ad-light.png)

Gaps: each upsell captured in one theme only; these screens use always-light/always-dark and branded colours (eclipse, cosmos, gradient) so theme differences are limited to the lower trial panel (eel, swan); hero and lottie artwork, logo and video URLs not recorded; trial option selected state not captured; the video ad is a house ad; the dump shows the lesson-complete footer (light) under it, reused for lesson-complete light tokens

## Gamification

### Streak dropdown
Where: /learn (any page with the top stat bar), hover dt=streak-menu; panel dt=streak-panel

Anatomy:
- popover shell (generic), background swapped per streak state by a modifier class on dt=streak-panel
- header: title "N day streak" (dt=streak-panel-header), subtitle, flame illustration right (64x77)
- week calendar card: 7 day letters (M..S, today in fox), 7 day circles (future/missed = swan, done = fox disc with white check)
- friend streaks card: orange card, illustration left, title, count caption, VIEW LIST white button
- streak society card: bordered card, lock illustration 60x60, title, body
- VIEW MORE full-width primary button (macaw)
- caret (popover shell)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| panel | width x height | 388 x 651px (incl. 2px border); inner column 384px wide | learn-dark-streak-dropdown dt=streak-panel (#79); css:5275-8898b509.css ._1n_9- {width:384px} |
| panel | offset below trigger | margin-top 8px | learn-dark-streak-dropdown dt=streak-panel (#79) |
| panel | border / radius | 2px / 15px | learn-dark-streak-dropdown cl=_36bu_ (#80) |
| header section | padding | 24px 20px 20px | learn-dark-streak-dropdown cl=FmvNo (#82) |
| header grid | columns / gap / margin-bottom | 248px 1fr / 22px / 24px | css:5275-8898b509.css ._2yWjv; learn-dark-streak-dropdown cl=_2yWjv (#83) |
| title block | min-height | 85px | learn-dark-streak-dropdown cl=_2gGD_ (#84) |
| title | margin-bottom | 8px | learn-dark-streak-dropdown dt=streak-panel-header (#85) |
| flame illustration | size / top | 64 x 77px / 12px | learn-dark-streak-dropdown cl=_4YzW2 (#88) |
| calendar card | width x height / padding / radius | 344 x 87px / 12px 16px / 12px | learn-dark-streak-dropdown cl=_8ECdA (#89) |
| day letter | cell width / margin-bottom | 45px / 4px | learn-dark-streak-dropdown cl=_3u3Eq (#92) |
| day circle | size / radius | 34 x 34px / 18px | learn-dark-streak-dropdown cl=_1DNjG _2pdFv _2LCuE (#101) |
| day circle cell | horizontal margin | 4px each side (2px under 360px) | learn-dark-streak-dropdown cl=_1asXw (#100); css:5275-8898b509.css ._1asXw @media (min-width:360px) |
| done-day check svg | box | 46 x 116px, margin -79px -5px 0, scale 1.05 (animated svg) | learn-light-streak-dropdown cl=u_TP- i9nlH (#111) |
| friend section | padding | 20px 20px 0 | learn-dark-streak-dropdown cl=yFj8x (#114) |
| friend card | width x height / radius / min-height | 344 x 136px / 16px / 50px | learn-dark-streak-dropdown cl=_3TU61 (#115) |
| friend illustration | size / position | 142 x 136px, absolute left 2px bottom 0 | learn-dark-streak-dropdown cl=_3UmsK (#116) |
| friend content | padding | 20px 20px 20px 128px | learn-dark-streak-dropdown cl=_3btoA (#117) |
| friend title | margin-bottom | 4px | learn-dark-streak-dropdown cl=_1Rhg2 (#118) |
| friend caption | margin-bottom | 12px | learn-dark-streak-dropdown cl=_3Ymcg (#119) |
| VIEW LIST button | width x height / radius / lip | 196 x 36px / 8px / border-bottom 4px, lip box-shadow 0 4px | learn-dark-streak-dropdown cl=_2loTO (#120); css:5275-8898b509.css ._2loTO {--web-ui_button-height:36px; --web-ui_button-border-radius:8px} |
| society section | padding / gap | 20px / 16px | learn-dark-streak-dropdown cl=K9wl2 (#122) |
| society card | width x height / padding / border / radius | 344 x 140px / 16px 18px / 2px / 16px | learn-dark-streak-dropdown cl=_1l3c4 _13qJ6 _1T_BQ (#123) |
| society lock image | size / margin-top | 60 x 60px / 8px | learn-light-streak-dropdown cl=_2TgZn (#144); css:458-86426c1c.css ._2TgZn |
| society text column | margin-left / gap | 24px / 8px | learn-dark-streak-dropdown cl=_2QLYz (#125) |
| VIEW MORE button | width x height / radius / lip | 344 x 50px / 12px / border-bottom 4px, lip box-shadow 0 4px | learn-dark-streak-dropdown cl=_1i82L ... oXbqr (#128) |
| caret | size | 20 x 10px box, 14.14px rotated square, 2px border | learn-dark-streak-dropdown cl=_3T97b (#130), cl=_1TMn5 (#131) |

| State | What changes | Source |
| --- | --- | --- |
| header: unextended (no lesson today) | popover bg #202F36 dark (light #FFF5D3 from css), title streak-panel-unextended-heading-text (#52656D dark, #EBC37F light) | captured:learn-dark-streak-dropdown cl=_37-_J (#79) |
| header: extended (lesson done today) | popover bg streak-panel-extended-background #FF9600 light (#CD7900 dark from css), title/subtitle white | captured:learn-light-streak-dropdown cl=_28-a0 (#80) |
| header: frozen | popover bg streak-panel-frozen-background (L #DDF4FF, D #2B70C9); text streak-panel-frozen-text (L #84D8FF, D #FFFFFF); subtitle streak-panel-frozen-subtitle (L #1CB0F6, D #FFFFFF) | css:5275-8898b509.css ._1HflL, ._2v3Mh, ._2wr8Y |
| header: streak society | popover bg streak-panel-streak-society-background (L #FFC800, D #D79433); text streak-panel-streak-society-text (L #CD7900, D #FFFFFF) | css:5275-8898b509.css ._1ShRd, ._2A7RF |
| header: milestone | background linear-gradient(133deg, streak-panel-milestone-gradient-start #FF933A, fox-always-light #FF9600 51.31%, ...); dark: solid #CD7900 (guinea-pig-always-light) | css:5275-8898b509.css ._5caAA, html[data-duo-theme=dark] ._5caAA |
| day: today label | letter colour fox | captured:learn-dark-streak-dropdown cl=_1tnkE (#96); learn-light-streak-dropdown cl=_374yM (#97) |
| day: done | fox disc with white check, animated svg over the swan circle (class _1R024 hides ._20s-Y) | captured:learn-light-streak-dropdown cl=_1R024 (#110) |
| day: consecutive-days connector | bar behind circles, fox, radius 18px, height 34px, width transition .18s; gradient variants fox to duck (#FBE56D) | css:5275-8898b509.css ._3H2QG, .X4r5V, ._3ayqn (not captured, 1-day streak only) |
| VIEW LIST / VIEW MORE hover | filter brightness(1.1) | css:4779-c36ad395.css ._1VYyp:hover:not(._2wryV) @media (hover:hover) |
| VIEW LIST / VIEW MORE active | transform translateY(4px) (lip width), ::before box-shadow none | css:4779-c36ad395.css ._1VYyp:active:not(._2wryV) |

Tokens (dark): panel (unextended, 0 day) background #202F36 (streak-panel-unextended-heading-background, dark); panel border #37464F (swan, dark); title (unextended) color #52656D (streak-panel-unextended-heading-text, dark); subtitle color #DCE6EC (wolf, dark); calendar card background #131F24 (snow, dark); day letter color #52656D (hare, dark); day letter, today color #FFAB33 (fox, dark); day circle (not done) background #37464F (swan, dark); lower sections background #131F24 (snow, dark); friend card background / text #FF5F00 (streak-panel-friend-background, dark) / #FFFFFF (snow-always-light); VIEW LIST face / lip / text #FFFFFF (snow-always-light) / #FFFFFF @0.60 / #FF5F00 (streak-panel-friend-background); society card background / border #131F24 (snow, dark) / #37464F (swan, dark); society title color #F1F7FB (eel, dark); society body color #DCE6EC (wolf, dark); VIEW MORE face / lip / text #49C0F8 (macaw, dark) / #1899D6 (whale, dark) / #131F24 (snow, dark)

Tokens (light): panel (extended, streak done today) background #FF9600 (streak-panel-extended-background, light); panel border #E5E5E5 (swan, light); title and subtitle (extended) color #FFFFFF (snow-always-light); calendar card background #FFFFFF (snow, light); day letter color #AFAFAF (hare, light); day letter, today color #FF9600 (fox, light); day circle (not done) background #E5E5E5 (swan, light); day circle (done) fill / check stroke #FF9600 (fox, light) / #FFFFFF (snow), stroke-width 8 in svg units; lower sections background #FFFFFF (snow, light); friend card background / text #FF5F00 (streak-panel-friend-background, light) / #FFFFFF; VIEW LIST face / lip / text #FFFFFF / #FFFFFF @0.60 / #FF5F00; society card background / border #FFFFFF (snow, light) / #E5E5E5 (swan, light); society title color #4B4B4B (eel, light); society body color #777777 (wolf, light); VIEW MORE face / lip / text #1CB0F6 (macaw, light) / #1899D6 (whale, light) / #FFFFFF (snow, light)

Type: all text duolingo-sans, sans-serif; title 700 25px/34px; subtitle 500 17px/24px; day letter 700 17px/25px, centred; friend title 700 16px (--text-heading-xsmall), line box 20px; friend caption 500 16px/24px (--text-caption); society title / body 700 17px/24px / 500 17px/24px; buttons 700 15px/18px, letter-spacing 0.8px, uppercase

Contains: popover shell, button: primary (macaw), button: white on colour (custom --web-ui_button-* vars, 36px, radius 8), card (_1T_BQ bordered)

Desktop vs mobile: Only desktop captured. css: under 360px the calendar and its rows scale(.9) and day cells use 2px side margins (css:5275-8898b509.css ._2Kk12, ._2wWMC, .TlXYj, ._1asXw @media (min-width:360px)).

Crops: [streak-dropdown-dark](crops/streak-dropdown-dark.png) · [streak-dropdown-light](crops/streak-dropdown-light.png)

Gaps: dark theme shows the unextended header and light the extended one; the opposite pairings are from CSS only; frozen, streak society and milestone header variants not captured; multi-day streak connector bar not captured (streak was 0 or 1 day); mobile streak dropdown/page not captured

### Gems dropdown
Where: /learn top stat bar, hover dt=lingot-menu; content dt=lingots-menu-content

Anatomy:
- popover shell (generic)
- gem chest illustration (100px tall)
- text column: title "Gems", balance line "You have N gems", GO TO SHOP text button (dt=shop-nav)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| panel | width x height | 384 x 152px (incl. 2px border) | learn-dark-gems-dropdown cl=_36bu_ (#84) |
| content | width / padding / layout | 380px / 24px 12px / flex row, align-items center | learn-dark-gems-dropdown dt=lingots-menu-content (#85); css:5275-8898b509.css ._3cG-N |
| chest image | height / offset | 100px (100 x 100 rendered) / translateY(-5px) | learn-dark-gems-dropdown cl=_3m2qa (#86) |
| text column | margin-left | 12px | learn-dark-gems-dropdown cl=_2UqMT (#87) |
| balance line | margin-top | 10px | learn-dark-gems-dropdown p (#89) |
| GO TO SHOP | margin-top / height | 12px / 18px (text button, no padding) | learn-dark-gems-dropdown dt=shop-nav cl=_1PQJw (#90) |

| State | What changes | Source |
| --- | --- | --- |
| GO TO SHOP hover | filter brightness(1.1) | css:4779-c36ad395.css .c1Mv-:hover:not(._2wryV) @media (hover:hover) |
| GO TO SHOP disabled | opacity .4 | css:4779-c36ad395.css .c1Mv-._2wryV:not(._3fmUm) |

Tokens (dark): panel background / border #131F24 (snow, dark) / #37464F (swan, dark); title color #F1F7FB (eel, dark); balance color #DCE6EC (wolf, dark); GO TO SHOP color #49C0F8 (macaw, dark)

Tokens (light): panel background / border #FFFFFF (snow, light) / #E5E5E5 (swan, light); title color #4B4B4B (eel, light); balance color #777777 (wolf, light); GO TO SHOP color #1CB0F6 (macaw, light)

Type: title 700 24px/26px; balance 500 17px/20px; GO TO SHOP 700 15px/18px, 0.8px, uppercase

Contains: popover shell, button: text (c1Mv-, macaw)

Desktop vs mobile: Only desktop captured.

Crops: [gems-dropdown-dark](crops/gems-dropdown-dark.png) · [gems-dropdown-light](crops/gems-dropdown-light.png)

Gaps: mobile not captured

### Hearts dropdown
Where: /learn top stat bar, hover dt=hearts-menu

Anatomy:
- popover shell (generic)
- title "Hearts"
- heart row: 5 hearts (full / refilling animated / empty)
- status line: "You have full hearts" or "Next heart in <time>" (time in cardinal)
- subtext
- three option rows (secondary buttons): UNLIMITED HEARTS + FREE TRIAL label; REFILL HEARTS + gem price; PRACTICE TO EARN HEARTS

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| panel | width x height | 404 x 399px (full) / 404 x 403px (refilling) | learn-dark-hearts-dropdown cl=_36bu_ (#88); learn-light-hearts-dropdown (#89) |
| content | padding / min-width / layout | 26px 20px / 380px / column, centred | learn-dark-hearts-dropdown cl=_2wpqL (#89) |
| title | margin-bottom | 16px | learn-dark-hearts-dropdown cl=_1XkbC (#90) |
| heart | size / gap | 32 x 32px (--heart-size) / 8px | learn-dark-hearts-dropdown cl=_1mypE (#93), cl=QZL78 (#92) |
| refilling heart | size | 36 x 36px animated svg (heart-size + 4px) | learn-light-hearts-dropdown cl=_1YXWQ (#96) |
| status line | margin | 12px 0 | learn-dark-hearts-dropdown cl=_2u5pt (#102) |
| option list | margin-top / row gap | 16px / 8px | learn-dark-hearts-dropdown cl=_2uJd1 (#104); css:4769-628e48ee.css ._2uJd1>:not(:last-child) |
| option row | width x height / padding / border / radius | 360 x 54px / 6px 16px / 2px 2px 4px (2px lip) / 16px | learn-dark-hearts-dropdown cl=_2V6ug ... uapW2 (#105) |
| row icon | size | 36 x 36px (practice icon padding 7px) | learn-dark-hearts-dropdown img (#108), cl=QrCkl (#127) |
| row label | margin-left / min-width | 8px / 180px (150px under 530, 130px under 360) | learn-dark-hearts-dropdown cl=_2uCBj (#109); css:4769-628e48ee.css ._2uCBj |
| FREE TRIAL label | width | 100px (80px under 530), right aligned | learn-dark-hearts-dropdown cl=zfGJk (#112) |
| gem price | icon / text | gem 24 x 24px + "350" 15px | learn-dark-hearts-dropdown img (#122), cl=_1xgBw (#123) |

| State | What changes | Source |
| --- | --- | --- |
| full hearts | status "You have full hearts"; REFILL and PRACTICE rows disabled | captured:learn-dark-hearts-dropdown (#102) |
| row disabled | translateY(2px), lip removed, face transparent (uapW2 empties the disabled bg), label wolf, gem icon grayscale(1) | captured:learn-dark-hearts-dropdown cl=_2wryV (#113, #124); css:4779-c36ad395.css ._2V6ug._2wryV:not(._3fmUm) |
| refilling | status "Next heart in" + time in cardinal; 1 full heart, 1 animated refilling heart (36px svg, #FFDFE0 walking-fish tones), 3 empty grey hearts | captured:learn-light-hearts-dropdown (#119, #96) |
| row hover | filter brightness(0.9) | css:4779-c36ad395.css ._2V6ug:hover:not(._2wryV) @media (hover:hover) |
| row active | translateY(2px), ::before box-shadow none | css:4779-c36ad395.css ._2V6ug:active:not(._2wryV) |

Tokens (dark): panel background / border #131F24 (snow, dark) / #37464F (swan, dark); title / status color #F1F7FB (eel, dark); subtext color #DCE6EC (wolf, dark); row (enabled) face / border+lip #131F24 (snow, dark) / #37464F (swan, dark), lip box-shadow 0 2px; row label (enabled) color #F1F7FB (eel, dark); row label (disabled) color #DCE6EC (wolf, dark); FREE TRIAL color #CF17C8 (nova); gem price color #49C0F8 (macaw, dark), shown grayscale(1) when disabled

Tokens (light): panel background / border #FFFFFF (snow, light) / #E5E5E5 (swan, light); title / status color #4B4B4B (eel, light); status time color #FF4B4B (cardinal, light); subtext color #777777 (wolf, light); row face / border+lip #FFFFFF (snow, light) / #E5E5E5 (swan, light); row label color #4B4B4B (eel, light); FREE TRIAL color #CF17C8 (nova); gem price color #1CB0F6 (macaw, light)

Type: title 700 25px/28px; status line 700 19px, line box 20px; subtext 500 17px/24px; row label / FREE TRIAL / price 700 15px/18px uppercase, letter-spacing 0 (uapW2 override)

Contains: popover shell, button: secondary (_2V6ug, snow face, swan lip)

Desktop vs mobile: Only desktop captured. css: label min-width drops to 150px under 530px and 130px under 360px; FREE TRIAL width 80px under 530px.

Crops: [hearts-dropdown-dark](crops/hearts-dropdown-dark.png) · [hearts-dropdown-light](crops/hearts-dropdown-light.png)

Gaps: out-of-hearts (0 hearts) state not captured; mobile not captured; svg fill #FFE7E7 in the refilling heart matches no palette name (NO PALETTE MATCH)

### Courses dropdown
Where: /learn top stat bar, hover dt=courses-menu; content dt=courses-menu-content (role=menu)

Anatomy:
- popover shell (generic, _2xxCs modifier)
- header "MY COURSES" with bottom rule
- scrolling list of course rows (flag + name), current course highlighted
- add row (dt=add-new-course): plus tile + "Add a new course", top rule

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| panel | width x height | 244 x 364px (incl. 2px border) | learn-dark-courses-dropdown cl=_36bu_ _2xxCs (#75) |
| header | height / padding / bottom border | 48px / 13px 20px / 2px | learn-dark-courses-dropdown cl=_34_P_ (#77) |
| list | width / max-height | 240px / 256px, overflow-y auto | learn-dark-courses-dropdown cl=_3BhSk (#78); css:5275-8898b509.css ._2xxCs ._3BhSk |
| course row | height / padding | 55px / 10px 12px 10px 20px | learn-dark-courses-dropdown cl=_1aVVk (#79) |
| flag | size / radius / outline / scale | 32 x 25px / 18% / 2px white outline / scale(.8) from center-left | learn-dark-courses-dropdown cl=_1ZBbO (#81) |
| flag wrapper | width | 52px (name starts 52px after row padding) | learn-dark-courses-dropdown cl=_17UWM (#80) |
| add row | height / padding / top border | 56px / 12px 12px 12px 14px / 2px | learn-dark-courses-dropdown dt=add-new-course (#94) |
| add icon | size | 44 x 30px | learn-dark-courses-dropdown cl=_3zsrC (#95) |
| add label | margin-left | 15px | learn-dark-courses-dropdown cl=_313qL (#96) |

| State | What changes | Source |
| --- | --- | --- |
| current course | background iguana, text whale | captured:learn-dark-courses-dropdown cl=_1WRXX (#79); learn-light-courses-dropdown (#80) |
| row hover / focus / focus-within (not current) | background polar (#F7F7F7 light, #202F36 dark) | css:5275-8898b509.css ._2xxCs ._1aVVk:hover:not(._3dQ3c):not(._1WRXX) @media (hover:hover), :focus, :focus-within |
| add row hover / focus | background polar | css:5275-8898b509.css ._2xxCs ._2jW-1:hover:not(._3dQ3c):not(._1WRXX) |

Tokens (dark): panel background / border #131F24 (snow, dark) / #37464F (swan, dark); header text / rule #52656D (hare, dark) / #37464F (swan, dark); course row text #F1F7FB (eel, dark); current course row background / text #202F36 (iguana, dark) / #1899D6 (whale); add row rule / text #37464F (swan, dark) / #F1F7FB (eel, dark); flag outline #FFFFFF (snow-always-light)

Tokens (light): panel background / border #FFFFFF (snow, light) / #E5E5E5 (swan, light); header text / rule #AFAFAF (hare, light) / #E5E5E5 (swan, light); course row text #4B4B4B (eel, light); current course row background / text #DDF4FF (iguana, light) / #1899D6 (whale); add row rule / text #E5E5E5 (swan, light) / #4B4B4B (eel, light)

Type: header 700 15px uppercase, line box 20px; course name / add label 700 17px/20px

Contains: popover shell, menu (role=menu / menuitem)

Desktop vs mobile: Only desktop captured. css has a horizontal variant (._3wAnu): column items with 8px side margins, flag scaled 2x inside an 82 x 68px tile, current course tile gets a 3px macaw border radius 18px; not captured.

Crops: [courses-dropdown-dark](crops/courses-dropdown-dark.png) · [courses-dropdown-light](crops/courses-dropdown-light.png)

Gaps: row hover not captured (css only); in dark, hover (polar) and current (iguana) resolve to the same #202F36; horizontal ._3wAnu variant not captured

### Leaderboard
Where: /leaderboard main column; list dt=leaderboard

Anatomy:
- league badge row: current league badge 80x91, locked badges 52x58, 28px gap, grid of 11 shifted by --offset
- header (sticky, snow bg): league name, subtitle ("Top 11 advance..." or join prompt), time left (bee), 2px swan rule
- row: rank (medal image 41x42 for 1 to 3, else number 41px wide), avatar 48 with online dot and optional status bubble, name (ellipsis), XP right
- row variants: default, hover (polar), current user (swan), current user in promotion zone (sea-sponge + tree-frog text)
- promotion zone divider: green arrows + "PROMOTION ZONE"
- not-joined state: START A LESSON secondary button, skeleton rows (three SVG columns) fading out, sticky current-user bar (polar)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| column | width | 480px at 1200 viewport, 592px at 1384 (max-width 592px) | leaderboard-dark-top cl=_2A6iC (#143); leaderboard-light-default (#145) |
| header | padding-top / height | 24px / 248px (joined), 315px (not joined) | leaderboard-dark-top cl=_15B39 (#144); leaderboard-dark-default (#144) |
| badge row | height / gap | 91px / 28px | leaderboard-dark-top cl=_38ZPp (#145), cl=_3Utw2 (#146) |
| current league badge | size | 80 x 91px | leaderboard-dark-top cl=_3UJ8x (#147) |
| locked league badge | size | 52 x 58px | leaderboard-dark-top cl=MJoIS (#149) |
| league name | margin | 24px top, 20px bottom | leaderboard-dark-top cl=_2V2Er (#158) |
| subtitle | padding / margin-bottom | 0 12px / 5px | leaderboard-dark-top cl=_1Zr5T (#159) |
| time left row | height / margin-bottom | 26px / 16px | leaderboard-dark-top cl=_3S3VJ (#160) |
| rule | border-top | 2px | leaderboard-dark-top hr cl=_1c5Wu (#163); css:app-f2ef02f8.css hr |
| row | height / padding / radius | 64px / 8px 24px 8px 16px / 16px (only at min-width 700px) | leaderboard-dark-top cl=_3kvGS (#165); css:1008-b4d34396.css ._3kvGS |
| rank medal | size | 41 x 42px | leaderboard-dark-top cl=_33f2x (#166) |
| rank number | width | 41px, centred | leaderboard-dark-top cl=_1kz8P (#190) |
| avatar | size / margin | 48 x 48px / 0 28px 0 12px | leaderboard-dark-top cl=_2vxUc (#167) |
| online dot | size / border / position | 12 x 12px / 2px / right 3px bottom 1px | leaderboard-dark-top cl=_2NNBf (#169) |
| status bubble on avatar | size / radius / position | 28 x 28px, 2px border, radius 50% 50% 50% 16% / top -6px right -16px; icon 26px | leaderboard-dark-top cl=_2R_e4 (#194), cl=_m6h6 (#195) |
| letter avatar | font | 700 22.08px/25px | leaderboard-dark-top cl=_1a-Dv _1N32S (#184) |
| name column | margin-right | 10px, flex-grow 1 | leaderboard-dark-top cl=_3SKx_ (#170) |
| XP | margin-right | 10px | leaderboard-dark-top cl=_1OKd4 (#172) |
| promotion divider | height / padding / margin-bottom | 54px / 15px 0 / 10px | leaderboard-dark-top cl=KWJR3 EXnGF (#255) |
| promotion arrows | size / margin | 24 x 24px / 0 15px | leaderboard-dark-top cl=W8zCX (#256) |
| not joined: START A LESSON | width x height / margin | 256 x 48px / 15px top, 48px bottom | leaderboard-dark-default cl=_3FuEB (#160) |
| skeleton area | grid / padding | min-content 1fr min-content / 0 24px 0 28px | leaderboard-dark-default cl=_3Z6WZ (#162) |
| skeleton columns | size | rank dots 16 x 464 (padding-top 16, margin-right 24); avatars+names 208 x 480; XP bars 48 x 462 (padding-top 18) | leaderboard-dark-default cl=_2Tlkh (#163), cl=_1jPFl (#164), cl=_1NQzo (#165) |
| skeleton fade | overlay | linear-gradient(0deg, snow, snow @0), height 360px | leaderboard-dark-default cl=_2kacL ::after (#161); css:7607-21dedb14.css ._2kacL:after |
| current-user bar (not joined) | size / padding / radius | 480 x 72px / 12px 24px 12px 30px / 16px | leaderboard-dark-default cl=_11XmH (#166) |

| State | What changes | Source |
| --- | --- | --- |
| row hover | background polar | captured:leaderboard-dark-row-hover diff vs leaderboard-dark-top (#165 bg none -> #202F36); captured:leaderboard-light-default (#192); css:1008-b4d34396.css ._5W_8K:hover @media (hover:hover) |
| row in promotion zone | rank number tree-frog | captured:leaderboard-dark-top cl=_27HUw (#189) |
| current user | row background swan, online dot ring swan | captured:leaderboard-dark-populated (#259); leaderboard-light-default (#272) |
| current user in promotion zone | background sea-sponge, rank/name/XP tree-frog, dot ring sea-sponge | captured:leaderboard-dark-mobile (#125), leaderboard-light-mobile (#137); css:1008-b4d34396.css .MytTp._27HUw |
| rank 1 to 3 | gold / silver / bronze medal images instead of numbers | captured:leaderboard-dark-top cl=_33f2x (#166, #174, #182) |
| demotion zone row | current user: background walking-fish (L #FFDFE0; dark uses polar #202F36), text fire-ant (L #EA2B2B, D #D84848); rank colour fire-ant | css:1008-b4d34396.css .MytTp._1XTsS, ._1XTsS ._1kz8P, html[data-duo-theme=dark] .MytTp._1XTsS (not captured) |
| demotion divider | fire-ant text; class .PshIT sits beside .KWJR3 in the stylesheet, its use as the demotion divider is inferred | css:1008-b4d34396.css .PshIT (not captured) |
| diamond / top league current user | background diamond-highlight #E7FBFB (dark polar), text diamond #38D0D0; another variant uses a background image with betta #9069CD text | css:1008-b4d34396.css .MytTp._7trGg, .MytTp.zGzKm (not captured) |
| not joined (before first lesson of the week) | join prompt + START A LESSON, skeleton rows, sticky current-user bar with "-" rank and 0 XP in hare | captured:leaderboard-dark-default (#159 to #175) |

Tokens (dark): header background #131F24 (snow, dark); league name / names / rank outside zone color #F1F7FB (black-text, dark); subtitle color #DCE6EC (wolf, dark); time left color #FFC700 (bee, dark); rule color #37464F (swan, dark); rank in promotion zone color #79B933 (tree-frog, dark); XP color #DCE6EC (wolf, dark); online dot fill / ring #93D333 (owl, dark) / #131F24 (snow, dark); status bubble fill / ring #FFFFFF (snow-always-light) / #37464F (swan, dark); letter avatar fill / letter fox #FFAB33, beetle #CE82FF / #131F24 (snow, dark); row hover background #202F36 (polar, dark); current user row background / dot ring #37464F (swan, dark) / #37464F; current user in promotion zone background / text #202F36 (sea-sponge, dark) / #79B933 (tree-frog, dark); promotion divider color #79B933 (tree-frog, dark); not joined: START A LESSON face / lip / text #131F24 (snow, dark) / #37464F (swan, dark) / #49C0F8 (macaw, dark); not joined: user bar background / text #202F36 (polar, dark) / #52656D (hare, dark)

Tokens (light): header background #FFFFFF (snow, light); league name / names / rank outside zone color #3C3C3C (black-text, light); subtitle color #777777 (wolf, light); time left color #FFC800 (bee, light); rule color #E5E5E5 (swan, light); rank in promotion zone color #58A700 (tree-frog, light); XP color #777777 (wolf, light); online dot fill / ring #58CC02 (owl, light) / #FFFFFF (snow, light); letter avatar fill / letter beetle #CE82FF, fox #FF9600, cardinal #FF4B4B / #FFFFFF (snow, light); row hover background #F7F7F7 (polar, light); current user row background #E5E5E5 (swan, light); current user in promotion zone background / text #D7FFB8 (sea-sponge, light) / #58A700 (tree-frog, light); promotion divider color #58A700 (tree-frog, light)

Type: league name 700 25px, line box 20px; subtitle 500 19px; time left 700 17px; rank number / name 700 17px/20px; XP 500 17px/20px, right aligned; promotion divider 700 15px, letter-spacing 0.8px, uppercase

Contains: avatar (48px, online dot), button: secondary (START A LESSON, macaw text)

Desktop vs mobile: 570px (leaderboard-dark-mobile, leaderboard-light-mobile): column is full width 570, rows full-bleed with no radius (radius only at min-width 700px), header has no 24px padding-top and the badge row gets margin-top 24px, status picker and right rail are absent, bottom tab bar appears. css: not-joined user bar becomes position fixed, bottom 82px, full width (css:7607-21dedb14.css ._11XmH).

Crops: [leaderboard-dark](crops/leaderboard-dark.png) · [leaderboard-light](crops/leaderboard-light.png) · [leaderboard--not-joined-dark](crops/leaderboard--not-joined-dark.png) · [leaderboard--row-hover-dark](crops/leaderboard--row-hover-dark.png) · [leaderboard--row-hover-light](crops/leaderboard--row-hover-light.png) · [leaderboard--current-user-dark](crops/leaderboard--current-user-dark.png) · [leaderboard--mobile-dark](crops/leaderboard--mobile-dark.png) · [leaderboard--mobile-light](crops/leaderboard--mobile-light.png)

Gaps: leaderboard-dark-top/-row-hover/-populated screenshots are 1200x800 against a 797 dump; crops use dy=+3 (verified visually); demotion zone rows and divider not present (Bronze league, 15 rows, nobody demoted); not-joined state captured in dark only; light-default hover on row 4 was incidental (pointer rested there), not a deliberate state capture; leaderboard-dark-mobile screenshot does not match its dump: the shot is scrolled with the user at rank 13 (swan row), the dump has the user at rank 10 in the promotion zone; crop kept only as a layout reference, values come from the dump

### Status picker
Where: /leaderboard right rail card "Set your status"

Anatomy:
- bordered card
- header: title + CLEAR text button
- preview: 80px avatar, 46px status bubble top-right, 17px online dot
- grid: 2 rows x 6 tiles (48px secondary buttons with emoji art 44x42; a flag tile uses the course flag 32x25)
- selected tile: blue-jay border and lip

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| card | width x height / padding / gap / border / radius | 368 x 320px / 20px / 10px / 2px / 16px | leaderboard-dark-default cl=_1Queb _2cnFr _1T_BQ (#86) |
| header | margin-bottom | 15px | leaderboard-dark-default cl=_1_rLa (#87) |
| preview | size / margin-bottom | 80 x 85px, centred (left calc(50% - 40px)) / 22px | leaderboard-dark-default cl=ZgBN6 (#92) |
| preview avatar | size | 80 x 80px, radius 50% | leaderboard-dark-default cl=_1yM9n (#93) |
| status bubble | size / offset / radius / border | 46 x 46px / left 66px top -12px / 50% 50% 50% 16% / 2px | leaderboard-dark-default cl=_3mRSn _2R_e4 (#94) |
| bubble art | size | 36 x 36px (owl status 40 x 40px) | leaderboard-dark-default cl=_1ZPDZ (#95), cl=_2XrTN (#97) |
| preview online dot | size / border | 17 x 17px / 2px | leaderboard-dark-default cl=_2yc73 (#98) |
| grid | row gap / tile gap | 10px / 8px | leaderboard-dark-default cl=_2LvZa (#91), cl=_2LYFC (#99) |
| tile | size / border / radius | 48 x 48px / 2px 2px 4px (2px lip) / 12px, padding 0 | leaderboard-dark-default cl=_2FxcQ (#100); css:app-f2ef02f8.css ._2FxcQ |
| tile art | size | 44 x 42px (flag tile 32 x 25px, radius 18%, 2px white outline, right 6px top 9px) | leaderboard-dark-default cl=_3-Vxu (#101), cl=_2hLBo (#111) |

| State | What changes | Source |
| --- | --- | --- |
| selected | --web-ui_button-border-color blue-jay (border and lip) | captured:leaderboard-dark-default cl=_333Yq (#100); css:app-f2ef02f8.css ._333Yq |
| tile hover | filter brightness(0.9) | css:4779-c36ad395.css ._2V6ug:hover:not(._2wryV) @media (hover:hover) |
| tile active | translateY(2px), ::before box-shadow none | css:4779-c36ad395.css ._2V6ug:active:not(._2wryV) |
| CLEAR hover | filter brightness(1.1) | css:4779-c36ad395.css .c1Mv-:hover |
| no status set | bubble hidden | not captured |

Tokens (dark): card background / border #131F24 (snow, dark) / #37464F (swan, dark); title color #F1F7FB (eel, dark); CLEAR color #49C0F8 (macaw, dark); tile face / border+lip #131F24 (snow, dark) / #37464F (swan, dark); owl tiles face #93D333 (owl, dark); selected tile border+lip #3F85A7 (blue-jay, dark); bubble fill / ring #FFFFFF (snow-always-light), owl status #93D333 (owl) / #37464F (swan, dark); online dot fill / ring #93D333 (owl, dark) / #131F24 (snow, dark)

Tokens (light): card background / border #FFFFFF (snow, light) / #E5E5E5 (swan, light); title color #4B4B4B (eel, light); CLEAR color #1CB0F6 (macaw, light); tile face / border+lip #FFFFFF (snow, light) / #E5E5E5 (swan, light); owl tiles face #58CC02 (owl, light); selected tile border+lip #84D8FF (blue-jay, light)

Type: title 700 19px/28px; CLEAR 700 15px/18px, 0.8px, uppercase

Contains: card (_1T_BQ), button: secondary (_2V6ug, 48px square), button: text (CLEAR), avatar (80px)

Desktop vs mobile: Not present at 570px: no status tiles in leaderboard-dark-mobile or leaderboard-light-mobile.

Crops: [status-picker-dark](crops/status-picker-dark.png) · [status-picker-light](crops/status-picker-light.png)

Gaps: hover/active on tiles not captured (css only); empty status (after CLEAR) not captured; mobile location of the picker not captured

### Daily quest card
Where: /quests "Daily Quests" section (page variant) and /learn right rail (rail variant)

Anatomy:
- section header: "Daily Quests" + timer (16px clock icon + "N HOURS")  [page]; or card header with VIEW ALL [rail]
- quest card: quest icon 60x60, title, progress row (bar + chest 35x35)
- progress bar: track, fill (clip-path to value, min width 1.5 x height), shine strip, centred label "x / y" drawn twice (on track and on fill)
- locked card "More quests unlock soon" with lock 60x60 [page]

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| page header | margin-bottom | 12px | quests-dark-default cl=_1owP7 (#148) |
| timer icon | size / gap | 16 x 16px / margin-right 5px | quests-dark-default cl=_1kZ3q (#151) |
| page card | width x height / padding / gap / border / radius | 480 x 113px at 1200 (592 at 1384) / 20px 25px / 20px / 2px / 16px | quests-dark-default cl=_1RuTi _1T_BQ (#158) |
| quest icon | size / margin-right | 60 x 60px / 22px | quests-dark-default cl=_3d6BP (#161) |
| title-to-bar | gap | 8px (page), 4px (rail) | quests-dark-default cl=H8Z2d (#162); learn-dark-default cl=_3KsFs (#111) |
| progress row | height / margin-right | 35px / 4px | quests-dark-default cl=_1XsWM (#164) |
| bar (page) | height / radius / margin-bottom | 20px / 10px / -4px | quests-dark-default cl=_3yKMC (#166), cl=_2nasW (#165) |
| bar (rail) | height / radius | 18px / 9px | learn-dark-default cl=_3yKMC (#115) |
| fill | min-width | 30px page / 27px rail (1.5 x height) | quests-dark-default cl=_27NV6 (#168); learn-dark-default (#117) |
| shine | height / inset / radius / opacity | 3px (30% of bar) / top 25%, left height/4, width value - height/2 / 9999px / 0.2 | quests-light-default cl=wg2yg _1EFTr (#171); css:4779-c36ad395.css ._1EFTr |
| chest | size / padding-left | 35 x 35px / 2px | quests-dark-default cl=_3_MbI (#172) |
| locked card | height / padding / margin-top / border / radius | 100px / 18px / 16px / 2px / 16px | quests-dark-default cl=_3nvey _2cnFr _1T_BQ (#173) |
| rail card | width x height / padding / border / radius | 368 x 165px / 18px 18px 8px / 2px / 16px | learn-dark-default cl=OT1WS _2cnFr _1T_BQ (#104) |
| rail header | margin-bottom | 4px | learn-dark-default cl=afnnb (#105) |
| rail quest row | padding | 20px 0 | learn-dark-default cl=_1VUBr (#109) |

| State | What changes | Source |
| --- | --- | --- |
| empty (0 / 10) | fill opacity 0, value bar at min width with opacity 0, only the on-track label shows; closed chest | captured:quests-dark-default (#168, #171); learn-dark-default (#117) |
| complete (10 / 10) | fill full width bee with shine strip; chest image swaps to the opened asset | captured:quests-light-default (#169 to #174); quests-dark-mobile (#61 to #66); learn-light-default (#125) |
| fill animation | background, color, opacity, clip-path .4s; value width .4s | quests-dark-default cl=_27NV6 transition (#168); css:4779-c36ad395.css ._27NV6, ._345XU |
| partial progress | fill clipped to --__internal__progress-bar-value; label split between track and fill colours | css:4779-c36ad395.css ._1jSC8, ._3jkB9 (not captured) |
| VIEW ALL hover | filter brightness(1.1) | css:4779-c36ad395.css .c1Mv-:hover |

Tokens (dark): card background / border #131F24 (snow, dark) / #37464F (swan, dark); section title / quest title color #F1F7FB (eel, dark); timer color #FFAB33 (fox, dark); #FFC700 (bee, dark) on mobile; bar track background #37464F (swan, dark); bar fill background #FFC700 (bee, dark); shine fill #FFFFFF (snow-always-light) @0.2; label on track color #AFAFAF (hare-always-light); label on fill color #CD7900 (guinea-pig-always-light); locked card background / text / border #202F36 (polar, dark) / #52656D (hare, dark) / #37464F (swan, dark); VIEW ALL (rail) color #49C0F8 (macaw, dark)

Tokens (light): card background / border #FFFFFF (snow, light) / #E5E5E5 (swan, light); section title / quest title color #4B4B4B (eel, light); timer color #FF9600 (fox, light); bar track background #E5E5E5 (swan, light); bar fill background #FFC800 (bee, light); shine fill #FFFFFF @0.2; label on track color #AFAFAF (hare-always-light); label on fill color #CD7900 (guinea-pig-always-light); locked card background / text / border #F7F7F7 (polar, light) / #AFAFAF (hare, light) / #E5E5E5 (swan, light); VIEW ALL (rail) color #1CB0F6 (macaw, light)

Type: page section title 700 25px/28px; rail card title 700 19px/28px; timer 700 17px uppercase; quest title 700 19px/26px page, 700 17px/24px rail; progress label 700 14px, letter-spacing 0.56px (.04em), uppercase, line-height = bar height, centred; locked card 700 19px/28px

Contains: card (_1T_BQ), progress bar (generic web-ui progress bar, bee colour via _2nasW), button: text (VIEW ALL)

Desktop vs mobile: 570px (quests-dark-mobile, quests-light-mobile): page gets a Quests / Badges tab bar on a beetle header, card is 538px wide with the same 20px 25px padding and 20px bar; rail variant absent. Timer rendered in bee (_3nMro) in the mobile capture.

Crops: [daily-quest-card-dark](crops/daily-quest-card-dark.png) · [daily-quest-card-light](crops/daily-quest-card-light.png) · [daily-quest-card--rail-dark](crops/daily-quest-card--rail-dark.png) · [daily-quest-card--rail-light](crops/daily-quest-card--rail-light.png) · [daily-quest-card--mobile-dark](crops/daily-quest-card--mobile-dark.png)

Gaps: partial progress (between 0 and max) not captured; multiple unlocked quests not captured (only one quest plus the locked card); why the mobile timer uses bee rather than fox is not determined

### Monthly badges list
Where: /quests right rail card "Monthly Badges"

Anatomy:
- bordered card (transparent fill)
- header: title + VIEW ALL text button
- rows: badge image 45x45, name, month/year

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| card | width x height / padding / border / radius | 368 x 524px / 20px 20px 8px / 2px / 16px | quests-dark-default cl=_3Ek2T (#86) |
| header | margin-bottom | 4px | quests-dark-default cl=_2r4xI (#87) |
| row | padding / gap | 20px 0 / 26px, align-items center (88px tall for one-line names, 108px for two) | quests-dark-default cl=s0T0f (#94, #112) |
| badge image | size | 45 x 45px | quests-dark-default cl=_1CieF (#95) |
| name | margin-bottom | 8px | quests-dark-default cl=_2zTBh (#97) |

| State | What changes | Source |
| --- | --- | --- |
| VIEW ALL hover | filter brightness(1.1) | css:4779-c36ad395.css .c1Mv-:hover |
| row | rows are static (no interactive element) | quests-dark-default s0T0f has no role/href |

Tokens (dark): card background / border none (page #131F24 shows through) / #37464F (swan, dark); title / badge name color #F1F7FB (eel, dark); date color #52656D (hare, dark); VIEW ALL color #49C0F8 (macaw, dark)

Tokens (light): card border #E5E5E5 (swan, light); title color #4B4B4B (eel, light); badge name color #4B4B4B (eel, light); date color #AFAFAF (hare, light); VIEW ALL color #1CB0F6 (macaw, light)

Type: title 700 19px/28px; badge name 700 17px, line box 20px; date 500 17px/20px; VIEW ALL 700 15px/18px, 0.8px, uppercase

Contains: card (bordered), button: text (VIEW ALL)

Desktop vs mobile: Not on the 570px /quests page (quests-dark-mobile, quests-light-mobile); badges move behind a "Badges" tab (#32) that was not opened.

Crops: [monthly-badges-dark](crops/monthly-badges-dark.png) · [monthly-badges-light](crops/monthly-badges-light.png)

Gaps: mobile Badges tab not captured; earned vs unearned badge styling not distinguishable (all shown badges are past months)

### Achievement row
Where: /profile/<user>, Achievements section: ul.cl=_1dDcV > li.cl=m_b-V _27zqm (no data-test)

Anatomy:
- list container (2px swan border, radius 16, rows separated by 2px swan rule; last row has no rule)
- level badge tile (77 x 96 SVG background image per achievement, contain, no-repeat)
- level label ("LEVEL 9") absolutely positioned inside the tile near its bottom
- 30px spacer column
- title (h3) + x/y counter right-aligned on the same line
- progress bar (14px, bee fill, swan track, white 20% shine), only on tiered achievements still in progress
- description line

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| list | width x border / radius | 480px wide (desktop column), 2px border, radius 16px | profile-dark-default ul cl=_1dDcV (#309); css:5515-e83f96c1.css ._1dDcV |
| row | padding / height | 20px all sides; 138px tall with bar (136 last row, no bottom rule); flex row, align-items stretch | profile-dark-default li cl=m_b-V _27zqm (#310, #338); css:5515-e83f96c1.css ._27zqm, .m_b-V |
| row | divider | 2px solid bottom border, removed on :last-child | css:5515-e83f96c1.css .m_b-V / .m_b-V:last-child |
| badge tile | width x height | 77 x 96px (padding-bottom 124.5% of width, min-width 77px) | profile-dark-default cl=_1hfyC bvEQe (#312); css:4243-a8d324a8.css ._1hfyC; css:5515 ._2ymEQ |
| level label | position / size | absolute, bottom 10% of tile (9.6px), centred; 36 x 20px ("LEVEL 9"), 41 x 20px ("LEVEL 10") | profile-dark-default cl=_1sF2c _36H8N (#313, #332); css:4243 ._36H8N |
| spacer | width | 30px (flex-shrink 0) | profile-dark-default cl=_1h4Du (#314); css:5515 ._1h4Du |
| text column | width | 329px at 480 column (441px light at 592 column); flex column, justify center | profile-dark-default cl=_2xtgD (#315); profile-light-default (#326) |
| title | height / margin | 29px line box, margin-bottom 6px, ellipsis | profile-dark-default h3 cl=-Zgv1 (#317); css:5515 .-Zgv1 |
| counter | gap from title | margin-left 12px, right-aligned | profile-dark-default cl=_8oTbo (#318) |
| progress block | margin | margin-top 10px; bar wrapper margin-bottom 15px | profile-dark-default cl=jX2vW (#319), cl=_3H4Dc (#320) |
| progress bar | height / radius | 14px tall, radius 7px (height/2); fill min-width 21px (1.5 x height) | profile-dark-default cl=_3yKMC (#323), cl=_27NV6 (#324), cl=_345XU (#327); css:4779-c36ad395.css ._27NV6 |
| progress shine | geometry | absolute, top 3.5px left 3.5px, 3px tall (30% of height), radius 9999px, opacity 0.2 | profile-dark-default cl=_1EFTr (#326); css:4779 ._1EFTr |
| description | height | 20px line | profile-dark-default cl=_7Cbsk (#328) |

| State | What changes | Source |
| --- | --- | --- |
| in progress (tiered) | shows x/y counter and progress bar; fill width = value% via clip-path inset | captured:profile-dark-default Wildfire #310, Champion #338 |
| maxed / no bar | no counter, no progress bar; description centred vertically in the text column | captured:profile-dark-default Sage #329 |
| hover | none: no stateful rules on the row classes | css: none found for m_b-V/_27zqm/_1dDcV |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| list border + row rule | border-color | #37464F (swan, dark) | profile-dark-default #309, #310 |
| title | color | #F1F7FB (black-text, dark) | baseline (property absent from dump = inherited body default: css:app-f2ef02f8.css body { color: rgb(var(--color-black-text)); font: 500 17px/20px } and css * { font-family: duolingo-sans }); profile-dark-default #317 |
| counter "238/250" | color | #52656D (hare, dark) | profile-dark-default #318; css:5515 ._8oTbo |
| description | color | #DCE6EC (wolf, dark) | profile-dark-default #328; css:5515 ._7Cbsk |
| progress track | background | #37464F (swan, dark) | profile-dark-default #323; css:4779 ._3yKMC |
| progress fill | background | #FFC700 (bee, dark) | profile-dark-default #324, #325 |
| progress shine | background | #FFFFFF (snow-always-light) @0.2 opacity | profile-dark-default #326; css:4779 ._1EFTr |
| level label (red/purple tiles) | color | #131F24 (snow, dark) | profile-dark-default #313, #341; css:4243 ._1sF2c |
| level label (gold tile, Sage) | color | #D79433 (guinea-pig, dark) | profile-dark-default #332; css:4243 ._1K2bC |
| badge tile art | background-image | achievements/217492e7...svg (Wildfire), ee0cbd16...svg (Sage), a7018d3f...svg (Champion); same art in both themes | profile-dark-default #312, #331, #340; css:4243 .bvEQe/._1U6RL/._3rkbr |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| list border + row rule | border-color | #E5E5E5 (swan, light) | profile-light-default ul cl=_1dDcV (#320), li (#321) |
| title | color | #3C3C3C (black-text, light) | baseline (property absent from dump = inherited body default: css:app-f2ef02f8.css body { color: rgb(var(--color-black-text)); font: 500 17px/20px } and css * { font-family: duolingo-sans }); profile-light-default #328 |
| counter | color | #AFAFAF (hare, light) | profile-light-default cl=_8oTbo (#329) |
| description | color | #777777 (wolf, light) | profile-light-default cl=_7Cbsk (#339) |
| progress track | background | #E5E5E5 (swan, light) | profile-light-default cl=_3yKMC (#334) |
| progress fill | background | #FFC800 (bee, light) | profile-light-default cl=_27NV6 (#335) |
| progress shine | background | #FFFFFF (snow-always-light) @0.2 opacity | profile-light-default cl=_1EFTr (#337) |
| level label (red/purple tiles) | color | #FFFFFF (snow, light) | profile-light-default #324, #352 |
| level label (gold tile) | color | #CD7900 (guinea-pig, light) | profile-light-default #343 |

Type:
- title: duolingo-sans 700 19px / 28.5px (line-height 1.5), ellipsis (profile-dark-default h3 cl=-Zgv1 (#317))
- counter: duolingo-sans 500 17px / 20px desktop (15px under 700px) (profile-dark-default #318; css:5515 ._8oTbo @media (min-width:700px))
- description: duolingo-sans 500 17px / 20px desktop (15px under 700px) (profile-dark-default #328; css:5515 ._7Cbsk)
- level label: duolingo-sans 700 11px, not uppercased by CSS (text is authored "LEVEL 9") (profile-dark-default #313; css:4243 ._36H8N)

Contains: progress bar (web-ui, recoloured bee, 14px), card/list shell (2px swan, radius 16)

Desktop vs mobile: mobile (570px): same row geometry (20px padding, 77x96 tile, 30px spacer); counter and description drop to 15px; the list gains a final "View all" row (a.cl=_2MpO3, padding 16px, 700 19px, eel) instead of the section-header link. Source: profile-dark-mobile ul (#193), #202, #212, #241; css:5515 ._2MpO3.

Crops: [achievement-row-dark](crops/achievement-row-dark.png) · [achievement-row-light](crops/achievement-row-light.png)

Gaps: light crop shows only the first two rows (third row is below the light scrolled viewport); completed/locked achievement tile variants beyond these three were not on the page; mobile rows not in any screenshot (below the fold); mobile values are from the dump only

### Profile header
Where: /profile/<user>: banner div.cl=eGQis + info block div.cl=_3byCv _2C8UD (name h1 dt=profile-username)

Anatomy:
- avatar banner (full column width x 224, radius 15, background = user avatar colour, avatar rendered in a <canvas>)
- edit-avatar icon button (48 x 48) top-right of banner
- clickable avatar hit area (220px wide, centred)
- display name (h1) + handle
- "Joined <month year>" line
- Following / Followers text buttons (macaw)
- course flags button (31x24 flags + "+N" chip)
- bottom rule (2px swan) closing the header block

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| banner | width x height / radius | 480 x 224px (100% of column), radius 15px, margin-bottom -12px, overflow hidden | profile-dark-default cl=eGQis (#205); css:5515-e83f96c1.css .eGQis |
| edit button | size / position | 48 x 48px, absolute top 16px right 16px, radius 16px, border 2px 2px 4px (lip) | profile-dark-default button cl=_2V6ug _3Y-wy (#206); css:5515 ._3Y-wy |
| edit icon | size | 18 x 18px svg pencil | profile-dark-default #208 |
| avatar hit area | width | 220px, full banner height, centred (translateX -50%), z-index 1 | profile-dark-default cl=_2Sqqq role=button (#210) |
| info block | margin / padding | margin-top 8px; padding-bottom 16px (._3byCv sets 0 0 32px at min-width 700px, ._2C8UD overrides to 0 0 16px); 150px tall total | profile-dark-default cl=_3byCv _2C8UD (#213); css:5515 ._3byCv, ._2C8UD |
| name block | height | h1 54px (name 34px line + handle 20px), margin-bottom 6px | profile-dark-default h1 dt=profile-username (#216) |
| joined row | margin | margin-bottom 12px | profile-dark-default cl=xk0If (#220) |
| follow links row | height / gap | 24px tall buttons, gap 16px, margin-bottom 16px, padding 0 | profile-dark-default cl=_7V_nj (#222); css:5515 ._7V_nj |
| flags button | size | 156 x 48px, padding 10px 0; flag img 31 x 24 with 4px side margins | profile-dark-default button cl=_36U8q (#228), img cl=_2WKNC (#229) |
| "+N" chip | size | 31 x 28px, border 2px, radius 5px, padding 2px 3px | profile-dark-default cl=_1ZEoN (#232); css:5515 ._1ZEoN |

| State | What changes | Source |
| --- | --- | --- |
| following / followers hover | filter: brightness(1.1) | css:4779-c36ad395.css .c1Mv-:hover:not(._2wryV):not(.ypJiL) @media (hover:hover) |
| edit button hover | filter: brightness(0.9) (web-ui default for _2V6ug) | css:4779-c36ad395.css ._2V6ug:hover:not(._2wryV):not(.ypJiL) |
| edit button active | translateY(2px); ::before box-shadow none (lip collapses) | css:4779-c36ad395.css ._2V6ug:active:not(._2wryV) |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| banner | background | #8CE31B (NO PALETTE MATCH: user avatar colour from --avatars-background-color; fallback snow #131F24) | profile-dark-default #205; css:5515 .eGQis |
| edit button face | background | #8CE31B (same avatar colour) with border #000000 @0.30 (black) and 2px lip shadow black @0.30 | profile-dark-default #206 ::before; css:5515 ._3Y-wy |
| edit icon | fill | #4B4B4B (eel-always-light, dark) | profile-dark-default #209 |
| name | color | #F1F7FB (black-text, dark) | baseline (property absent from dump = inherited body default: css:app-f2ef02f8.css body { color: rgb(var(--color-black-text)); font: 500 17px/20px } and css * { font-family: duolingo-sans }); profile-dark-default #217 |
| handle | color | #52656D (hare, dark) | profile-dark-default #218; css:5515 ._1Fdxc |
| joined | color | #DCE6EC (wolf, dark) | profile-dark-default #221; css:5515 ._3QM8N |
| following / followers | color | #49C0F8 (macaw, dark) | profile-dark-default #224, #226; css:5515 ._7V_nj |
| "+N" chip | border / text | border #37464F (swan, dark), text #52656D (hare, dark) | profile-dark-default #232 |
| bottom rule | border-color | #37464F (swan, dark) | profile-dark-default #213 |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| banner | background | #8CE31B (NO PALETTE MATCH, avatar colour; fallback snow #FFFFFF) | profile-light-default cl=eGQis (#206) |
| edit button face | background | #8CE31B with border #000000 @0.30 (black) | profile-light-default #207 |
| edit icon | fill | #4B4B4B (eel, light) | profile-light-default #210 |
| name | color | #3C3C3C (black-text, light) | baseline (property absent from dump = inherited body default: css:app-f2ef02f8.css body { color: rgb(var(--color-black-text)); font: 500 17px/20px } and css * { font-family: duolingo-sans }); profile-light-default #218 |
| handle | color | #AFAFAF (hare, light) | profile-light-default #219 |
| joined | color | #777777 (wolf, light) | profile-light-default #222 |
| following / followers | color | #1CB0F6 (macaw, light) | profile-light-default #225, #227 |
| "+N" chip | border / text | border #E5E5E5 (swan, light), text #AFAFAF (hare, light) | profile-light-default #233 |
| bottom rule | border-color | #E5E5E5 (swan, light) | profile-light-default #214 |

Type:
- name: duolingo-sans 700 28px / 34px (25px under 700px) (profile-dark-default #216; css:5515 ._2eRPO)
- handle: duolingo-sans 500 17px / 20px (profile-dark-default #218; css:5515 ._1Fdxc)
- joined: duolingo-sans 500 17px / 20px (15px under 700px) (profile-dark-default #221; css:5515 ._3KQMU)
- following / followers: duolingo-sans 700 16px / 19.2px, letter-spacing 0.8px, text-transform none on the label span (profile-dark-default #223-#226; css:5515 ._7V_nj, ._3KQMU)
- "+N" chip: duolingo-sans 700 17px / 19.55px (profile-dark-default #232)

Contains: button: icon (web-ui _2V6ug, recoloured to avatar colour), button: text link (web-ui c1Mv-, macaw), avatar

Desktop vs mobile: mobile (570px): page title bar "Profile" with settings gear above; banner 538 x 224 at 16px gutters; name 25px; "Joined" 15px; Following/Followers collapse into one "25 Friends" link (a.cl=_2rQ98 _1GQxS, 16px 700, label 15px); flags become an <a> (156 x 48) on the right. Source: profile-dark-mobile #32, #43, #48, #50, #53; css:5515 ._2eRPO @media (max-width:699px).

Crops: [profile-header-dark](crops/profile-header-dark.png) · [profile-header-light](crops/profile-header-light.png) · [profile-header--mobile-light](crops/profile-header--mobile-light.png)

Gaps: avatar art is drawn in a <canvas>, so its layers are not in the dump; no hover/active state dump for the header; states are from CSS only; another user's profile (Follow button instead of edit) was not captured

### Profile statistics tile
Where: /profile/<user>, Statistics: div.cl=_37tLJ grid > div.cl=_2Hzv5 > div.cl=_2uSOC

Anatomy:
- 2-column grid, 12px gap
- tile (2px swan border, radius 16)
- icon (21px wide, top-aligned)
- value (h4)
- label
- optional corner badge ("WEEK 1") on the league tile

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| grid | columns / gap | repeat(2, 1fr), gap 12px | profile-dark-default cl=_37tLJ (#237); css:5515 ._37tLJ |
| tile | width x height | 234 x 78px at 480 column (290 x 78 light at 592) | profile-dark-default cl=_2uSOC (#239); profile-light-default (#249) |
| tile | padding / border / radius | 15px 24px; 2px; 16px | css:5515 ._2uSOC |
| icon | size / gap | width 21px (heights 25 to 29 by art; league icon 24 x 27), margin-right 15px (14px league), align-self start | profile-dark-default #240, #246, #252; css:5515 .-AVDu, ._2aR6Z |
| value | margin | margin-bottom 4px; 20px line | profile-dark-default h4 cl=-TMd4 (#242) |
| section title | size / gap | "Statistics" h2 24px/26px, 12px below | profile-dark-default h2 cl=_347iz (#235), cl=_2Nu7i (#234) |
| week badge | size / position | 53 x 24px, absolute top -8px right -6px, radius 7px, 2px border, padding 3px 5px 3px 6px | profile-light-default cl=_1eerR _3qbFZ (#261); css:5515 ._3qbFZ |

| State | What changes | Source |
| --- | --- | --- |
| streak inactive (0 days) | tile gets class _1kcT_: value and label hare; grey flame icon | captured:profile-dark-default #239 (cl=_2uSOC _1kcT_); css:5515 ._1kcT_ |
| streak active | value black-text, orange flame icon profile/8a6dca76...svg | captured:profile-light-default #249, profile-dark-mobile #80 |
| league tile with week badge | "WEEK 1" badge overlaps top-right corner | captured:profile-light-default #261, profile-dark-mobile #92 (absent in profile-dark-default) |
| hover | none (tiles are not interactive) | css: none found for _2uSOC/_2Hzv5 |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| tile | border-color | #37464F (swan, dark) | profile-dark-default #239 |
| value (active) | color | #F1F7FB (black-text, dark) | baseline (property absent from dump = inherited body default: css:app-f2ef02f8.css body { color: rgb(var(--color-black-text)); font: 500 17px/20px } and css * { font-family: duolingo-sans }); profile-dark-default #248 |
| value (inactive streak) | color | #52656D (hare, dark) | profile-dark-default #242; css:5515 ._1kcT_ h4 |
| label | color | #52656D (hare, dark) | profile-dark-default #243; css:5515 ._3oUUc |
| week badge | background / text / border | bg #CD7900 (guinea-pig-always-light), text + border #131F24 (snow, dark) | profile-dark-mobile #92; css:5515 ._1eerR, ._3qbFZ |
| icons | image | streak inactive icons/65b8a029...svg (grey flame); XP profile/01ce3a81...svg; league leagues/19218167...svg (Bronze); top-3 profile/3f97ae33...svg | profile-dark-default #240, #246, #252, #258 |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| tile | border-color | #E5E5E5 (swan, light) | profile-light-default #249 |
| value | color | #3C3C3C (black-text, light) | baseline (property absent from dump = inherited body default: css:app-f2ef02f8.css body { color: rgb(var(--color-black-text)); font: 500 17px/20px } and css * { font-family: duolingo-sans }); profile-light-default #252 |
| label | color | #AFAFAF (hare, light) | profile-light-default #253 |
| week badge | background / text / border | bg #CD7900 (guinea-pig-always-light), text + border #FFFFFF (snow, light) | profile-light-default #261 |
| streak icon (active) | image | profile/8a6dca76...svg (orange flame) | profile-light-default #250 |

Type:
- value: duolingo-sans 700 20px / 20px (19px under 700px) (profile-dark-default #242; css:5515 .-TMd4)
- label: duolingo-sans 500 16px / 20px (15px under 700px) (profile-dark-default #243; css:5515 ._3oUUc)
- week badge: duolingo-sans 700 12px / 14px uppercase (profile-light-default #261; css:5515 ._3qbFZ)

Contains: badge (corner pill)

Desktop vs mobile: mobile: tile 263 x 70px, padding 12px 14px 10px; icon 15px wide with 7.5px gap; value 19px; label 15px and "Current league" shortens to "League". Source: profile-dark-mobile #80, #81, #83, #84, #97; css:5515 ._2uSOC/.-AVDu/.-TMd4/._3oUUc @media (max-width:699px).

Crops: [profile-stat-tile-dark](crops/profile-stat-tile-dark.png) · [profile-stat-tile-light](crops/profile-stat-tile-light.png)

Gaps: light crop shows only the first row plus the WEEK badge (second row is below the fold)

### Friend suggestion card
Where: /profile/<user>, Friend suggestions: div.cl=_3tDH0 > div.cl=_18ikm (a dt=friend-entry, button dt=friend-add-button)

Anatomy:
- card (2px swan border, radius 16, flex column, equal flex 1 1 0)
- dismiss X (12 x 12) top-right
- avatar (48, circle)
- name
- reason ("Followed by N friends")
- FOLLOW button (legacy lip button, full width)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| row | gap | 16px between cards (3 cards at 149px in a 480 column; 187px at 592) | profile-dark-default cl=_3tDH0 (#268); profile-light-default cl=_18ikm (#280) |
| card | width x height / padding | 149 x 239px (dark, text wraps) / 187 x 217 (light); padding 20px 16px | profile-dark-default cl=_18ikm (#269); css:1081-5a510dac.css ._18ikm |
| avatar | size | 48 x 48px, radius 50% | profile-dark-default img cl=_1yM9n (#272) |
| name | margin / line | margin-top 8px, 24px line | profile-dark-default h3 cl=WDFdx _2jQO8 (#274) |
| reason | line | 22px line, wraps to 2 lines at 113px text width | profile-dark-default cl=_142Ad LH3xS (#275) |
| entry block | margin | margin-bottom 30px above the button | profile-dark-default a dt=friend-entry cl=-rEIl (#270) |
| FOLLOW button | size / padding / radius | 113 x 36px (100% width), padding 6px 18px, radius 8px, bottom border 4px transparent + ::after face extending 4px below | profile-dark-default dt=friend-add-button (#276); css:1081 .eiTQu, .DCN49; css:app-f2ef02f8.css ._3XEA0 |
| dismiss | size / position | 12 x 12px icon, absolute top 18px right 16px | profile-dark-default button cl=_2FpYw (#278); css:1081 ._2FpYw, ._2B7Zf |

| State | What changes | Source |
| --- | --- | --- |
| FOLLOW hover | filter: brightness(1.1) | css:app-f2ef02f8.css ._1saKQ:hover:not(:disabled):not(._1bjzW):not(._1hIFd) @media (hover:hover) |
| FOLLOW active | border-width flips to 4px 0 0 (content drops 4px), background none, ::after bottom 0 (lip hidden) | css:app-f2ef02f8.css ._3XEA0:active:not(:disabled):not(._1bjzW) and :after |
| FOLLOW disabled | text hare, ::after face swan, pressed geometry | css:app-f2ef02f8.css ._3XEA0:disabled:not(.WHVbR), :after |
| dismiss hover | filter brightness (web-ui default for _1gEmM) | css:4779-c36ad395.css ._1gEmM:hover:not(._2wryV):not(.ypJiL) |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| card | border-color | #37464F (swan, dark) | profile-dark-default #269 |
| name | color | #F1F7FB (eel, dark) | profile-dark-default #274; css:1081 .Euydo |
| reason | color | #52656D (hare, dark) | profile-dark-default #275; css:1081 .LH3xS |
| FOLLOW face (::after) | background | #49C0F8 (macaw, dark) | profile-dark-default #276 ::after; css:app ._11FQZ:after |
| FOLLOW lip (host bg) | background | #1899D6 (whale, dark) | profile-dark-default #276; css:app ._11FQZ |
| FOLLOW label | color | #131F24 (snow, dark) | profile-dark-default #277 |
| dismiss icon | image | images/df223d5b...svg (dark variant) | profile-dark-default #279 |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| card | border-color | #E5E5E5 (swan, light) | profile-light-default #280 |
| name | color | #4B4B4B (eel, light) | profile-light-default #285 |
| reason | color | #AFAFAF (hare, light) | profile-light-default #286 |
| FOLLOW face (::after) | background | #1CB0F6 (macaw, light) | profile-light-default #287 ::after |
| FOLLOW lip (host bg) | background | #1899D6 (whale, light) | profile-light-default #287 |
| FOLLOW label | color | #FFFFFF (snow, light) | profile-light-default #288 |
| dismiss icon | image | images/4af31393...svg (light variant) | profile-light-default #290 |

Type:
- name: duolingo-sans 700 17px / 24px, centred, ellipsis (profile-dark-default #274; css:1081 .WDFdx)
- reason: duolingo-sans 500 15px / 22px, centred (profile-dark-default #275; css:1081 ._142Ad)
- FOLLOW: duolingo-sans 700 15px / 20px uppercase, letter-spacing 0.8px (profile-dark-default #276; css:app ._3wPHf, ._2Rt1l)

Contains: button: primary (legacy lip button, macaw/whale, 8px radius, 36px tall), avatar, icon button (dismiss)

Desktop vs mobile: mobile: cards become list rows inside one bordered panel (div.cl=_1xR2j _39QMj, padding 16px, 2px swan divider, 87px tall): avatar 48 left, name 700 20px, reason 16px, then an icon-only FOLLOW (41 x 32, padding 6px 8px, add-friend svg 25x16) and an 18px dismiss X with 16px left margin; panel ends with a "View all" row. Source: profile-dark-mobile #107-#118, #141; css:1081 ._1xR2j, ._39QMj, ._3GTBe, ._32Aog.

Crops: [friend-suggestion-card-dark](crops/friend-suggestion-card-dark.png) · [friend-suggestion-card-light](crops/friend-suggestion-card-light.png)

Gaps: no hover/pressed dump for FOLLOW or dismiss; states are CSS only; mobile row layout not in any screenshot (below the fold); the dark crop shows the mouse pointer over the first card (screenshot artefact)

### Friend update (kudos) card
Where: /profile/<user> right rail: div.cl=_2G9SS > div.cl=_27qWC -V8Gl _2tJ8I (per update), a.cl=_1eHsP "View all"

Anatomy:
- panel (2px swan border, radius 16) holding stacked updates + "View all" row
- update item (2px swan bottom rule)
- avatar 50 + name (bold) + relative time
- event text (max 218px)
- event art (130 x 130, right)
- CELEBRATE button (secondary, with party icon)
- reaction counter (party icon in a double ring + count)
- "View all" row with chevron

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| panel | width | 368px right rail, 2px border, radius 16px | profile-dark-default cl=_2G9SS (#87) |
| update item | padding / height | padding 0 0 16px 16px; 222px tall | profile-dark-default cl=_2tJ8I (#88); css:5515 ._2tJ8I |
| header row | margin | margin-top 16px; avatar 50 x 50; name block margin-left 10px, max-width 158px | profile-dark-default cl=_3NHGm (#91), img (#93), cl=_3uy9e (#94) |
| event text | size / margin | 218px max width, margin 16px 0 20px, ellipsis | profile-dark-default cl=Vbl7C _3Umux (#98) |
| event art | size | 130 x 130px, margin-top 10px (104px under 360px) | profile-dark-default img cl=_18A1Y (#100); css:5515 ._18A1Y |
| CELEBRATE | size | 149 x 50px, radius 16px, border 2px 2px 4px; icon 26 x 20, label margin-left 7px | profile-dark-default button cl=_2ZO5y _2V6ug (#103), img (#104), span (#105) |
| reaction counter | size | outer ring 34 x 34 (2px snow border), inner ring 30 x 30 (2px swan border, padding 4px), icon 18 x 18, radius 16; count margin-left 8px; group margin-right 16px | profile-dark-default #108-#112; css:5515 ._1aIia, ._34nUQ |
| View all row | padding / height | padding 16px 25px 13px 18px; 51px; chevron 10 x 20 | profile-dark-default a cl=_1eHsP (#138), #139 |

| State | What changes | Source |
| --- | --- | --- |
| CELEBRATE hover | filter: brightness(0.9) | css:4779-c36ad395.css ._2V6ug:hover:not(._2wryV):not(.ypJiL) @media (hover:hover) |
| CELEBRATE active | translateY(2px), ::before box-shadow none | css:4779-c36ad395.css ._2V6ug:active:not(._2wryV), :before |
| already celebrated | not captured | not captured |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| panel border + item rule | border-color | #37464F (swan, dark) | profile-dark-default #87, #88 |
| name | color | #F1F7FB (eel, dark) | css:5515 ._1C9lp; profile-dark-default #96 |
| time | color | #52656D (hare, dark) | profile-dark-default #97 |
| event text | color | #F1F7FB (black-text, dark) | baseline (property absent from dump = inherited body default: css:app-f2ef02f8.css body { color: rgb(var(--color-black-text)); font: 500 17px/20px } and css * { font-family: duolingo-sans }); profile-dark-default #98 |
| event art | background | #131F24 (snow, dark) | profile-dark-default #100; css:5515 ._18A1Y |
| CELEBRATE | face / border / label | face #131F24 (snow), border + 2px lip #37464F (swan), label #F1F7FB (eel) | profile-dark-default #103 ::before; css:4779 ._2ZO5y |
| reaction ring | outer / inner | outer bg + border #131F24 (snow), inner border #37464F (swan) | profile-dark-default #109, #110 |
| reaction count | color | #52656D (hare, dark) | profile-dark-default #112 |
| View all | color | #F1F7FB (eel, dark) | css:5515 ._1eHsP |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| panel border + item rule | border-color | #E5E5E5 (swan, light) | profile-light-default #88, #89 |
| name | color | #4B4B4B (eel, light) | profile-light-default #97 |
| time | color | #AFAFAF (hare, light) | profile-light-default #98 |
| event text | color | #3C3C3C (black-text, light) | baseline (property absent from dump = inherited body default: css:app-f2ef02f8.css body { color: rgb(var(--color-black-text)); font: 500 17px/20px } and css * { font-family: duolingo-sans }); profile-light-default #99 |
| CELEBRATE | face / border / label | face #FFFFFF (snow), border + lip #E5E5E5 (swan), label #4B4B4B (eel) | profile-light-default #104, #106 |
| reaction ring | outer / inner | outer #FFFFFF (snow), inner border #E5E5E5 (swan) | profile-light-default #110, #111 |
| reaction count | color | #AFAFAF (hare, light) | profile-light-default #113 |
| View all | color | #4B4B4B (eel, light) | profile-light-default #139 |

Type:
- name: duolingo-sans 700 19px / 26px, ellipsis (profile-dark-default #96; css:5515 ._1C9lp)
- time: duolingo-sans 500 15px / 20px (profile-dark-default #97; css:5515 ._1HJua)
- event text: duolingo-sans 500 17px / 24px (profile-dark-default #98; css:5515 .Vbl7C)
- CELEBRATE: duolingo-sans 700 15px / 18px uppercase, letter-spacing 0.8px (profile-dark-default #105)
- reaction count: duolingo-sans 500 15px (profile-dark-default #112; css:5515 .Gh-rv)
- View all: duolingo-sans 700 17px / 20px (profile-dark-default #138)

Contains: button: secondary (web-ui _2V6ug, snow face, swan border), avatar, card/list shell, list row with chevron

Desktop vs mobile: mobile: the feed collapses to a single "Friend updates" row in the main column (a.cl=BAKBs, 534 x 82, padding 20px 22px, 700 20px eel, 55 x 42 party icon with 14px gap, chevron). Source: profile-dark-mobile #61-#64; css:5515 .BAKBs, .UqpgY.

Crops: [friend-update-card-dark](crops/friend-update-card-dark.png) · [friend-update-card-light](crops/friend-update-card-light.png) · [friend-update-card--mobile-light](crops/friend-update-card--mobile-light.png)

Gaps: no hover/pressed dump for CELEBRATE; celebrated (reacted) state not captured; anchor colour #0000EE on avatar/reaction links is the UA default and has no visible text; ignore

### Characters grid cell
Where: /characters: div.cl=_22vCj > div.cl=_11ETR (row) > button.cl=_2V6ug _3Dsa-

Anatomy:
- cell = web-ui secondary button (snow face, swan border, 2px lip)
- glyph (kana)
- romaji
- mastery bar (8px, max 40px wide, bee fill)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| grid | gaps | rows: row-gap 8px; columns: column-gap 8px, 5 cells per kana row (combo rows use 3) | characters-dark-default cl=_22vCj (#171), cl=_11ETR (#172); css:9416-975668fa.css ._22vCj, ._11ETR |
| cell | width x height | 82 x 68px at 480 column (86 x 68 light) | characters-dark-default #173; characters-light-default #181 |
| cell | padding / radius / border | padding 10px 0 5px, height auto, line-height 1; radius 16px; border 2px 2px 4px transparent with ::before face (2px border, 2px box-shadow lip) | characters-dark-default #173; css:9416 ._3Dsa- |
| glyph | line | 19px line box | characters-dark-default span cl=IxPSK (#175) |
| romaji | line / margin | 15px line, margin-bottom 5px | characters-dark-default cl=_3UqmZ (#176) |
| mastery bar | size | 40 x 8px (width 60%, max 40px), radius 4px, centred; fill min-width 12px | characters-dark-default role=progressbar cl=oCRfA QhZ1x (#177), #178, #181; css:9416 .QhZ1x |

| State | What changes | Source |
| --- | --- | --- |
| empty mastery (all 115 cells) | bar track only; fill and fill layer opacity 0 | captured:characters-dark-default #179, #181 (and all _3Dsa- cells in both themes) |
| partial / full mastery | not captured; by the web-ui progress bar CSS the fill (bee) would show at width = value% with min-width 12px | not captured (css:4779-c36ad395.css ._27NV6, ._345XU) |
| hover | no visual change: --web-ui_button-filter-hover set to none; diff of hover dump shows no change on the cell | captured:characters-dark-cell-hover (no diff); css:9416 ._3Dsa- |
| active | translateY(2px), lip shadow removed | css:4779-c36ad395.css ._2V6ug:active:not(._2wryV) |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| face | background | #131F24 (snow, dark) | characters-dark-default #173 ::before |
| border + lip | color | #37464F (swan, dark) | characters-dark-default #173 ::before |
| glyph | color | #F1F7FB (eel, dark) | css:9416 .IxPSK; characters-dark-default #175 |
| romaji | color | #52656D (hare, dark) | characters-dark-default #176; css:9416 ._3UqmZ |
| bar track | background | #37464F (swan, dark) | characters-dark-default #178 |
| bar fill | background | #FFC700 (bee, dark), opacity 0 at value 0 | characters-dark-default #179, #181 |
| disabled face/border | background / border | #202F36 (polar, dark) | css:9416 ._3Dsa- (--web-ui_button-*-disabled) |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| face | background | #FFFFFF (snow, light) | characters-light-default #181 ::before |
| border + lip | color | #E5E5E5 (swan, light) | characters-light-default #181 ::before |
| glyph | color | #4B4B4B (eel, light) | characters-light-default #183 |
| romaji | color | #AFAFAF (hare, light) | characters-light-default #184 |
| bar track | background | #E5E5E5 (swan, light) | characters-light-default #186 |
| bar fill | background | #FFC800 (bee, light), opacity 0 at value 0 | characters-light-default #187 |
| disabled face/border | background / border | #F7F7F7 (polar, light) | css:9416 ._3Dsa- |

Type:
- glyph: duolingo-sans 500 19px / 19px, centred (characters-dark-default #175; css:9416 .IxPSK)
- romaji: duolingo-sans 500 15px / 15px, text-transform none, letter-spacing 0.8px (inherited from button) (characters-dark-default #176; css:9416 ._3UqmZ, ._1ID0N)

Contains: button: secondary (web-ui _2V6ug), progress bar (8px, bee)

Desktop vs mobile: no mobile capture of /characters

Crops: [characters-cell-dark](crops/characters-cell-dark.png) · [characters-cell-light](crops/characters-cell-light.png)

Gaps: account has no character mastery, so partial and full bars are not in any dump; no mobile dump; characters-dark-tips dump is identical to default apart from an overlay opacity node (#1271): the tips view itself was not captured

### Characters script tabs
Where: /characters: div.cl=_7WPBm > div.cl=_1V2d9 _1xZUP > div.cl=_3ugho (selected adds _1H-vp)

Anatomy:
- three equal tabs (33% each): Hiragana, Katakana, Kanji
- label (uppercase)
- 2px bottom rule per tab (macaw when selected, swan otherwise)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| tab | width x height | 158 x 52px at 480 column (195 x 52 light) | characters-dark-default #154-#159; characters-light-default #162-#167 |
| tab | padding / rule | padding 15px 0; border-bottom 2px | characters-dark-default cl=_3ugho (#155); css:9416-975668fa.css ._3ugho |
| row | margins | margin 0 (desktop), 0 -16px under 700px | css:9416 ._7WPBm |

| State | What changes | Source |
| --- | --- | --- |
| selected | label and bottom rule macaw | captured:characters-dark-default #155 (cl=_1H-vp) |
| hover | label and bottom rule turn macaw (same as selected) | captured:characters-dark-tab-hover #157 (hare -> #49C0F8, swan rule -> #49C0F8); css:9416 ._3ugho:hover |
| focus / active | same as hover (macaw label and rule) | css:9416-975668fa.css ._3ugho:focus, ._3ugho:active |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| selected label + rule | color | #49C0F8 (macaw, dark) | characters-dark-default #155; css:9416 ._1H-vp |
| unselected label | color | #52656D (hare, dark) | characters-dark-default #157 |
| unselected rule | border-color | #37464F (swan, dark) | characters-dark-default #157 |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| selected label + rule | color | #1CB0F6 (macaw, light) | characters-light-default #163 |
| unselected label | color | #AFAFAF (hare, light) | characters-light-default #165 |
| unselected rule | border-color | #E5E5E5 (swan, light) | characters-light-default #165 |

Type:
- label: duolingo-sans 700 17px / 20px uppercase, letter-spacing 0.03em (0.51px) (characters-dark-default #155; css:9416 ._3ugho, ._1xZUP)

Contains: tabs (underline)

Desktop vs mobile: no mobile dump; CSS pulls the tab row out to the screen edge under 700px (margin 0 -16px)

Crops: [characters-tabs-dark](crops/characters-tabs-dark.png) · [characters-tabs-light](crops/characters-tabs-light.png)

Gaps: tab hover dump has no screenshot (characters-dark-tab-hover); no hover crop

### Guidebook key phrase bubble
Where: /guidebook/<lang>/<unit>, KEY PHRASES: div.cl=_1kJSC > div.cl=_3zpnU D0iFS (popover, arrow left) > div.cl=_36bu_ _1KdWa

Anatomy:
- "KEY PHRASES" section label
- speech bubble = web-ui popover shell with left-pointing arrow
- speaker button (animated lottie svg, 29 x 22)
- JP sentence with per-character hint tokens (dotted underline)
- translation line

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| bubble | size | content-sized width (245 to 379px seen), 91px tall; offset 8px right of the column edge to make room for the arrow | guidebook-dark-default cl=_36bu_ _1KdWa (#177), cl=_3zpnU D0iFS (#176); css:4779-c36ad395.css .D0iFS |
| bubble | padding / border / radius | padding 8px 16px 16px (12px sides under 700px); border 2px; radius 15px | guidebook-dark-default #177; css:1327-4028784b.css ._1KdWa; css:4779 ._36bu_ |
| arrow | size / position | 20 x 10px, rotated -90deg, left -13px, 15px below the top radius | guidebook-dark-default cl=_3T97b (#231); css:4779 .D0iFS>._3T97b |
| grid | layout | 2-column grid: speaker (col 1, 39px tall, margin-right 10px) + text (col 2); translation in row 2 | guidebook-dark-default cl=iS2Dl (#178), cl=fEd5_ (#179); css:1327 .fEd5_, ._3X015, .ihYGQ |
| speaker | size | 29 x 22px svg | guidebook-dark-default button (#180), span cl=_1OCYa (#181); css:1327 ._3DAip ._1OCYa |
| hint token | underline | padding-bottom 4px; repeat-x dotted underline image at the bottom | guidebook-dark-default dt=hint-token (#212); css:1327 ._2IGwo, .XxgPa |
| stack | pitch | bubbles every 112px (91 tall + 21px gap) | guidebook-dark-default #177 (y 360), #238 (y 472) |
| section label | size | 99 x 20px, 23px line | guidebook-dark-default #171 |

| State | What changes | Source |
| --- | --- | --- |
| speaker hover | filter: brightness(1.1) | css:app-f2ef02f8.css ._1saKQ:hover:not(:disabled):not(._1bjzW):not(._1hIFd) |
| speaker playing | not captured (lottie animation) | not captured |
| hint token hover / tooltip | not captured | not captured |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| bubble | background / border | bg #131F24 (snow, dark), border #37464F (swan, dark) | guidebook-dark-default #177; css:4779 ._36bu_ |
| speaker | fill | #49C0F8 (macaw, dark) | guidebook-dark-default path #186, #188, #192 |
| JP text | color | #F1F7FB (black-text, dark) | baseline (property absent from dump = inherited body default: css:app-f2ef02f8.css body { color: rgb(var(--color-black-text)); font: 500 17px/20px } and css * { font-family: duolingo-sans }); guidebook-dark-default #195 |
| hint underline | background-image | images/5dcc0728...svg (dark dotted line) | guidebook-dark-default #212; css:1327 html[data-duo-theme=dark] ._2IGwo |
| translation | color | #52656D (hare, dark) | guidebook-dark-default #230 |
| section label | color | #49C0F8 (macaw, dark) | guidebook-dark-default #171 |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| bubble | background / border | bg #FFFFFF (snow, light), border #E5E5E5 (swan, light) | guidebook-light-default #186 |
| speaker | fill | #1CB0F6 (macaw, light) | guidebook-light-default path #195, #197, #201 |
| JP text | color | #3C3C3C (black-text, light) | baseline (property absent from dump = inherited body default: css:app-f2ef02f8.css body { color: rgb(var(--color-black-text)); font: 500 17px/20px } and css * { font-family: duolingo-sans }); guidebook-light-default #204 |
| hint underline | background-image | images/06f94a15...svg (light dotted line) | guidebook-light-default #221; css:1327 ._2IGwo |
| translation | color | #AFAFAF (hare, light) | guidebook-light-default #239 |
| section label | color | #1CB0F6 (macaw, light) | guidebook-light-default #180 |

Type:
- JP text: duolingo-sans 500 17px / 20px (tokens 24px tall with underline padding) (guidebook-dark-default #195)
- translation: duolingo-sans 400 17px / 24px (guidebook-dark-default #230)
- section label: duolingo-sans 700 17px / 23px (uppercase as authored) (guidebook-dark-default #171)

Contains: popover shell (web-ui _36bu_, arrow left), icon button (speaker)

Desktop vs mobile: no mobile dump; CSS narrows bubble side padding to 12px under 700px (css:1327 ._1KdWa)

Crops: [guidebook-phrase-dark](crops/guidebook-phrase-dark.png) · [guidebook-phrase-light](crops/guidebook-phrase-light.png)

Gaps: no mobile dump; no hover or audio-playing dump

### Shop item row
Where: /shop: ul > li.cl=_3-o-j (button dt=purchase-button, icon dt=purchase-icon for power-ups)

Anatomy:
- section heading (Hearts, Power-Ups)
- row with 2px swan top rule
- item icon (100 x 100, floated into a 110px left gutter)
- title (+ optional "N / 2 EQUIPPED" pill)
- description
- price button: secondary, "GET FOR:" + gem icon + price, or "FREE TRIAL" (nova), or disabled "FULL"/"EQUIPPED"

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| section heading | size / margin | 24px / 26px, margin-top 40px, 25px gap to the list | shop-dark-default h2 cl=_21GJ- (#155) |
| row | padding / min-height | padding 20px 0 20px 110px, min-height 120px (138px with 2-line text; 166 power-up with pill) | shop-dark-default li cl=_3-o-j (#157, #171); css:8566-1e4d7a6c.css ._3-o-j @media (min-width:700px) |
| icon | size / offset | 100 x 100px, margin -5px 0 -20px -110px, float left | shop-dark-default img cl=_3ywWe (#158); css:8566 ._3ywWe |
| title | padding | padding 8px 0, 36px tall | shop-dark-default cl=_32enP (#161) |
| description | line | line-height 1.75 (29.75px) | shop-dark-default p cl=_23KGP (#162) |
| price button | size / position | min-width 150px (158 with price), 50px tall, float right, margin-left 18px, radius 16px, border 2px 2px 4px | shop-dark-default dt=purchase-button (#159, #173); css:8566 .kbxOW |
| gem icon | size / margin | 24 x 26px, margin -8px 4px -6px 6px | shop-dark-default cl=_235HK (#174); css:8566 ._235HK |
| equipped pill | size | height 25px, padding 8px, radius 16px; gap 20px from title (row-gap 3px) | shop-dark-default cl=_2tJ-w _2I6Qk (#177), cl=_2Q29c (#175); css:8566 ._2I6Qk |

| State | What changes | Source |
| --- | --- | --- |
| purchasable | macaw "GET FOR: <gem> N" | captured:shop-light-default #169 (Refill Hearts), shop-dark-default #173 (Streak Freeze) |
| disabled: hearts full / item equipped | class _2wryV: label swan, no lip, translateY(2px) | captured:shop-dark-default #159 "FULL", shop-light-default #183 "EQUIPPED"; css:4779 ._2V6ug._2wryV:not(._3fmUm); css:app ._3U5_i |
| equipped pill | swan/hare "0 / 2 EQUIPPED" vs sea-sponge/owl "2 / 2 EQUIPPED" | captured:shop-dark-default #177 vs shop-light-default #187 |
| price button hover | filter: brightness(0.9) | css:4779-c36ad395.css ._2V6ug:hover:not(._2wryV):not(.ypJiL) |
| price button active | translateY(2px), lip removed | css:4779 ._2V6ug:active:not(._2wryV) |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| row rule | border-color | #37464F (swan, dark) | shop-dark-default #157 |
| title | color | #F1F7FB (black-text, dark) | baseline (property absent from dump = inherited body default: css:app-f2ef02f8.css body { color: rgb(var(--color-black-text)); font: 500 17px/20px } and css * { font-family: duolingo-sans }); shop-dark-default #161 |
| description | color | #DCE6EC (wolf, dark) | shop-dark-default #162; css:8566 ._23KGP |
| price button | face / border / label | face #131F24 (snow), border + lip #37464F (swan), label #49C0F8 (macaw) | shop-dark-default #173; css:4779 ._3xDVI |
| FREE TRIAL label | color | #CF17C8 (nova) | shop-dark-default #165; css:8566 ._2eqoY |
| disabled (FULL / EQUIPPED) | face / border / label | face #131F24 (snow), border #37464F (swan), label #37464F (swan), no lip | shop-dark-default #159; css:app ._3U5_i |
| pill (not equipped) | bg / text | bg #37464F (swan), text #52656D (hare) | shop-dark-default #177; css:8566 ._2tJ-w |
| pill (equipped) | bg / text | bg #202F36 (sea-sponge, dark), text #93D333 (owl, dark) | css:8566 ._1-6PO; captured in shop-dark-mobile #83 |
| gem | background-image | gems/45c14e05...svg | shop-dark-default #174 |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| row rule | border-color | #E5E5E5 (swan, light) | shop-light-default #167 |
| title | color | #3C3C3C (black-text, light) | baseline (property absent from dump = inherited body default: css:app-f2ef02f8.css body { color: rgb(var(--color-black-text)); font: 500 17px/20px } and css * { font-family: duolingo-sans }); shop-light-default #171 |
| description | color | #777777 (wolf, light) | shop-light-default #172 |
| price button | face / border / label | face #FFFFFF (snow), border + lip #E5E5E5 (swan), label #1CB0F6 (macaw) | shop-light-default #169 |
| FREE TRIAL label | color | #CF17C8 (nova) | shop-light-default #175 |
| disabled (EQUIPPED) | face / border / label | face #FFFFFF (snow), border #E5E5E5 (swan), label #E5E5E5 (swan) | shop-light-default #183, #184 |
| pill (equipped) | bg / text | bg #D7FFB8 (sea-sponge, light), text #58CC02 (owl, light) | shop-light-default cl=_1-6PO _2I6Qk (#187) |

Type:
- section heading: duolingo-sans 700 24px / 26px (shop-dark-default #155)
- title: duolingo-sans 700 19px / 20px (shop-dark-default #161; css:8566 ._32enP)
- description: duolingo-sans 500 17px / 29.75px (shop-dark-default #162)
- price button: duolingo-sans 700 15px / 18px uppercase, letter-spacing 0.8px (shop-dark-default #173)
- pill: duolingo-sans 700 15px uppercase, nowrap (shop-dark-default #177; css:8566 ._2I6Qk)

Contains: button: secondary (web-ui _2V6ug, macaw label), badge/pill

Desktop vs mobile: mobile (<700px): row padding 15px 0 70px 110px, no min-height; button leaves the float and becomes position absolute, bottom 20px, left 110px (under the text), width by content (158 with price, 116 for FREE TRIAL); description gets margin-bottom 18px. Source: shop-dark-mobile #63, #65, #68, #71; css:8566 ._3-o-j, .kbxOW.

Crops: [shop-item-row-dark](crops/shop-item-row-dark.png) · [shop-item-row-light](crops/shop-item-row-light.png) · [shop-item-row--equipped-light](crops/shop-item-row--equipped-light.png) · [shop-item-row--mobile-dark](crops/shop-item-row--mobile-dark.png)

Gaps: no hover/pressed dump on /shop; only hearts refill, unlimited hearts and streak freeze exist on this account's shop

### Super promo card
Where: right rail on /learn, /characters, /guidebook (div.cl=_16rRh _2cnFr _1T_BQ, logo dt=plus-offer-logo); hero banner on /shop and /settings/super (div.cl=MGk8p, button dt=plus-offer-button)

Anatomy:
- variant A, rail card: standard rail card (snow, 2px swan, radius 16) + SUPER wordmark (78 x 21) + Duo art (98px, absolute top/right 24) + title + body + full-width cosmos button "TRY 1 WEEK FREE"
- variant B, hero banner (shop trial): eclipse background with gamma/starlight/quasar radial gradient; Duo art 90px + 25px headline; white button "START MY FREE 7 DAYS"; SUPER wordmark 86 x 23 top-right
- variant C, hero banner (family plan): same gradient; headline "Start a family plan!" + body with bold "Super Duolingo"; white "LEARN MORE" button; illustration clipped at right (200px max, overhanging -20px top/right, -65px bottom)

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| A card | width x height / padding | 368 x 233px, padding 18px, radius 16px, border 2px | learn-dark-default cl=_16rRh _2cnFr _1T_BQ (#87); css:1008-b4d34396.css ._2cnFr, ._1T_BQ |
| A title | width / margin | 220px, margin 8px 0 | learn-dark-default h2 cl=_3f4H2 WyfrO (#91); css:7668-84c050df.css .WyfrO |
| A body | width / margin | calc(100% - 83px) = 245px, margin 8px 0 24px | learn-dark-default cl=_3GCbg (#92) |
| A button | size | 328 x 50px (100%), radius 16px, 4px lip (box-shadow 0 4px nebula) | learn-dark-default button cl=_1VYyp _3b8r8 (#93) |
| A art | size / position | 98 x 94px, absolute top 24px right 24px | learn-dark-default img cl=zYUV0 (#89) |
| B/C banner | padding / radius / margin | padding 20px (20px 10px 10px under 530px), radius 16px, margin-bottom 32px | shop-dark-default cl=MGk8p (#145); css:8566-1e4d7a6c.css .MGk8p |
| B banner | size | 480 x 227px | shop-dark-default #145 |
| B art + headline | size | art 90 x 113px, margin-right 24px; headline block margin-top 24px | shop-dark-default img cl=_22aYT (#147), cl=_1iadG (#148) |
| B/C button | size / margin | height 50, margin-top 24px, width 100% of its column (440 B; 260 C dark; 369 C light), radius 16px (12px on settings-super), 4px lip | shop-dark-default dt=plus-offer-button (#152); settings-super-dark-default #109; css:7668 ._3LkfO |
| B logo | size / position | 86 x 23px, absolute top 0 right 0 with 16px margin | shop-dark-default dt=plus-offer-logo (#154); css:7668 .ZEFkS, ._24WQp |
| C banner | size | 480 x 222 (settings-super dark), 592 x 227 (settings-super light), 592 x 197 (shop light) | settings-super-dark-default cl=_3_cT8 MGk8p (#100); settings-super-light-default #102; shop-light-default #154 |
| C illustration | clip | max-width 200px, margin -20px -20px -65px 0, image max-height 230px; hidden under 530px | settings-super-dark-default cl=_2o8pO (#102), img cl=_2hygw (#103); css:7668 ._2o8pO, ._2hygw |

| State | What changes | Source |
| --- | --- | --- |
| button hover | filter: brightness(1.1) (web-ui _1VYyp default) | css:4779-c36ad395.css ._1VYyp:hover:not(._2wryV):not(.ypJiL) @media (hover:hover) (filter-hover default brightness(1.1)) |
| button active | translateY(4px) (lip width), ::before box-shadow none | css:4779-c36ad395.css ._1VYyp:active:not(._2wryV), :before |
| variant by offer | trial copy (B) vs family plan (C) chosen by account/offer | captured:shop-dark-default #145 vs shop-light-default #154 and settings-super-dark-default #100 |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| A card | bg / border / body text | bg #131F24 (snow), border #37464F (swan), body #DCE6EC (wolf) | learn-dark-default #87, #92; css:7668 ._16rRh |
| A title | color | #F1F7FB (eel, dark) | css:7668 ._3f4H2; learn-dark-default #91 |
| A button | face / lip / label | face #3C4DFF (cosmos), lip #3F22EC (nebula), label #FFFFFF (snow-always-light) | learn-dark-default #93 ::before; css:app-f2ef02f8.css ._3b8r8 |
| B/C banner | background | radial-gradient(216% 106% at 6% 3%, #26F663 (gamma) @0.3 0, #268AFF (starlight) @0.3 52%, #FC55FF (quasar) @0.3 100%) over #000437 (eclipse); text #FFFFFF (snow-always-light) | shop-dark-default #145; css:8566 .MGk8p |
| B/C button | face / lip / label | face #FFFFFF (snow-always-light), lip #FFFFFF @0.5, label #000437 (eclipse) | shop-dark-default #152 ::before; css:app ._19taU |
| C body emphasis | color | "Super Duolingo" #FFFFFF (snow-always-light, !important via .EryQo) bold | settings-super-dark-default #108; css:7668 .EryQo>span>span |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| A card | bg / border / body text | bg #FFFFFF (snow), border #E5E5E5 (swan), body #777777 (wolf) | learn-light-default #88, #93 |
| A title | color | #4B4B4B (eel, light) | learn-light-default #92 |
| A button | face / lip / label | face #3C4DFF (cosmos), lip #3F22EC (nebula), label #FFFFFF | learn-light-default #94 |
| B/C banner | background | same gradient over #000437 (eclipse): theme-independent | shop-light-default #154; settings-super-light-default #102 |
| B/C button | face / lip / label | face #FFFFFF, lip #FFFFFF @0.5, label #000437 (eclipse) | shop-light-default #163 |

Type:
- A title: duolingo-sans 700 19px / 28px (learn-dark-default #91)
- A body: duolingo-sans 500 17px / 25px (learn-dark-default #92; css:7668 .OWSZL)
- buttons: duolingo-sans 700 15px / 18px uppercase, letter-spacing 0.8px (learn-dark-default #93)
- B/C headline: duolingo-sans 700 25px / 34px (23px / 31px under 530px) (shop-dark-default #149; css:8566 ._353sT)
- C body: duolingo-sans 500 17px / 25px; emphasis 700 (settings-super-dark-default #106, #108; css:7668 ._15G6R)

Contains: button: primary (web-ui _1VYyp, recoloured cosmos/nebula), button: primary on dark (web-ui _1VYyp + _19taU white), card shell (rail card)

Desktop vs mobile: variant A lives in the right rail, which is not rendered at mobile width (no _16rRh in any *-mobile dump). Variant B on mobile: 538 x 227 at 16px gutters, same structure (shop-dark-mobile #51, #58). Under 530px CSS stacks B/C vertically and centres the text (css:7668 ._1145W, ._2z0JJ).

Crops: [super-promo-card-dark](crops/super-promo-card-dark.png) · [super-promo-card-light](crops/super-promo-card-light.png) · [super-promo-card--shop-trial-dark](crops/super-promo-card--shop-trial-dark.png) · [super-promo-card--family-plan-light](crops/super-promo-card--family-plan-light.png) · [super-promo-card--family-plan-dark](crops/super-promo-card--family-plan-dark.png)

Gaps: no hover/pressed dump for any Super button; shop trial variant (B) only captured in dark; family plan (C) in light shop and both settings-super dumps

### Ad-blocker card
Where: right rail on /learn, /characters, /guidebook, /practice-hub, /sections, /shop: div.cl=_3D_HB > div.cl=_3Mmv9 ("Using an ad blocker?")

Anatomy:
- card with eclipse background + gamma/starlight/quasar radial gradient
- Duo art strip at the top (full bleed, 91px)
- title
- body (80% opacity)
- white full-width button "TRY SUPER FOR FREE"
- "DISABLE AD BLOCKER" text link

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| card | width x height / padding / radius | 368 x 330px, padding 0 24px, radius 16px, overflow hidden; flex column, space-between | shop-dark-default cl=_3D_HB (#113), cl=_3Mmv9 (#114); css:1327-4028784b.css ._3Mmv9 |
| art | size | 368 x 91px, margin 0 -24px (bleeds to card edges), max-height 91px | shop-dark-default img cl=_1PyGQ (#115); css:1327 ._1PyGQ |
| title | margin | margin-bottom 12px; 30px line | shop-dark-default h2 cl=_3IB6P (#117) |
| body | margin | margin-top -8px; 2 lines of 24px | shop-dark-default cl=_yQL7 (#118) |
| button | size | 320 x 50px, radius 16px, 4px lip | shop-dark-default button cl=_1VYyp _19taU (#120) |
| link block | margin | margin-bottom 15px; link 20px line | shop-dark-default cl=_1d5x2 (#123), a (#124) |

| State | What changes | Source |
| --- | --- | --- |
| button hover | filter: brightness(1.1) | css:4779-c36ad395.css ._1VYyp:hover:not(._2wryV):not(.ypJiL) @media (hover:hover) (filter-hover default brightness(1.1)) |
| button active | translateY(4px), lip removed | css:4779 ._1VYyp:active:not(._2wryV) |
| link hover | not captured | not captured |

Tokens (dark):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| card | background | radial-gradient(216% 106% at 6% 3%, #26F663 (gamma) @0.3 0, #268AFF (starlight) @0.3 52%, #FC55FF (quasar) @0.3 100%) over #000437 (eclipse) | shop-dark-default #114; css:1327 ._3Mmv9 |
| title / body / link | color | #FFFFFF (snow-always-light); body opacity 0.8 | shop-dark-default #117, #118, #124; css:1327 ._3IB6P, ._yQL7, ._1d5x2 a |
| button | face / lip / label | face #FFFFFF (snow-always-light), lip #FFFFFF @0.5, label #000437 (eclipse) | shop-dark-default #120 ::before; css:app ._19taU |

Tokens (light):

| Part | Property | Value | Source |
| --- | --- | --- | --- |
| card | background | identical to dark (all tokens are always-light / eclipse) | learn-light-default #132; shop-light-default #122 |
| title / body / link | color | #FFFFFF (snow-always-light); body opacity 0.8 | learn-light-default #135, #136 |
| button | face / lip / label | face #FFFFFF, lip #FFFFFF @0.5, label #000437 (eclipse) | learn-light-default #138 |

Type:
- title: duolingo-sans 700 24px / 30px (1.25), centred (shop-dark-default #117)
- body: duolingo-sans 500 16px / 24px, centred (shop-dark-default #118; css:1327 ._yQL7)
- button: duolingo-sans 700 15px / 18px uppercase, letter-spacing 0.8px (shop-dark-default #120)
- link: duolingo-sans 700 15px uppercase, letter-spacing 1px (shop-dark-default #124; css:1327 ._1d5x2 a)

Contains: button: primary on dark (web-ui _1VYyp + _19taU white)

Desktop vs mobile: right rail only: absent from every *-mobile dump

Crops: [adblock-card-dark](crops/adblock-card-dark.png) · [adblock-card-light](crops/adblock-card-light.png)

Gaps: card height (330px) is the measured rect; no CSS rule in the captured chunks sets it explicitly

## Gaps

- `sidebar-nav`: Collapsed 88px sidebar (700-1159px) never captured: values come from CSS only.
- `sidebar-nav`: learn-dark-nav-hover has no screenshot (dump diff only), and there is no light hover dump; light hover colour is from CSS.
- `sidebar-nav`: Keyboard focus ring not captured and no focus rule found on the nav classes.
- `sidebar-nav`: Dump never records font-family (it equals the reference div); family comes from css:app-f2ef02f8.css * rule.
- `sidebar-nav`: Screenshots show the capture tool's pointer (orange-outlined arrow); it is not part of the UI.
- `stat-bar`: Active streak on desktop dark and inactive streak on desktop light were not captured; the colours come from CSS.
- `stat-bar`: What the course number (35) counts is not labelled in any dump.
- `stat-bar`: Hearts at 0 or refilling, and Super (unlimited hearts) variants, not captured.
- `right-rail`: --sidebar-offset and --app-offset are set by JS; their live values were not dumped (derived from rects).
- `right-rail`: No CSS rule hides the rail between 700px and 1159px; it stays 368 wide there (derived, not captured).
- `mobile-top-bar`: Border-bottom variant (without hJZ_L) was not seen on any captured page.
- `mobile-top-bar`: Dropdown/open state and any themed (--web-ui_topbar-*) variant not captured on mobile.
- `mobile-tab-bar`: Safe-area (iOS home indicator) handling not visible in CSS or captures.
- `mobile-tab-bar`: What opens the scrim (_1gNU8) was not captured.
- `page-grid`: No capture between 700 and 1199 px, so the collapsed-sidebar and 900px-floor layouts are derived from CSS only.
- `page-grid`: Dark captures are all 1200 wide and light 1384, so theme and width vary together; widths do not depend on theme.
- `page-grid`: --app-offset value not dumped (0 in these captures, judging by rects).
- `unit-header`: Only owl and starfish banners were captured on desktop; other unit colours are from CSS only.
- `unit-header`: Legendary (gold) banner not in any dump.
- `unit-header`: GUIDEBOOK hover/active not captured (CSS only).
- `unit-header`: Mobile screenshots do not match the mobile dumps (screenshot shows unit 1 macaw, dump shows unit 12 owl); mobile colours are taken from the dump only.
- `path-node`: Legendary node (_2ucCV) not present in any dump; CSS only.
- `path-node`: Active/pressed state not captured; CSS only.
- `path-node`: No dump shows the progress arc in dark theme (dark was at Lesson 1 of 6).
- `path-node`: Icon image dumps/icons-_learn.json lists .../images/path/5b531828e59ae83aadb3d88e6b3a98a8.svg, which no dump node references.
- `path-node`: Unit colours other than owl, macaw, starfish, fox and cardinal were not captured on nodes.
- `path-node`: Icon descriptions (star, check, book, trophy) are read from the screenshots, not from the files.
- `node-popover`: Mobile popover not captured.
- `node-popover`: Legendary and chest popovers not captured.
- `node-popover`: Open/close animation not captured.
- `path-character`: Lottie animation timing is not in the dumps.
- `jump-to-current`: Hover not captured: learn-dark-secondary-button-hover hovers the JUMP HERE? button, not this one.
- `jump-to-current`: Mobile instance not in any dump.
- `section-end-card`: Card bottom (y 797-835) is below the viewport in both screenshots; crops cut 38px of the bottom padding.
- `section-end-card`: Unlocked variant not captured.
- `section-end-card`: Mobile not captured.
- `section-card`: In-progress card is cut at the viewport bottom (797) in both screenshots; locked cards are off screen, so no crop shows them.
- `section-card`: No mobile capture of /sections.
- `section-card`: Hover states not captured.
- `section-card`: Title colour on completed/in-progress cards is not recorded in the dump.
- `lesson-top-bar`: Progress bar height (16px) comes from an inline --__internal__progress-bar-height; no CSS rule sets it.
- `lesson-top-bar`: What triggers bee versus fox fill is not recorded; both captured only as inline colours.
- `lesson-top-bar`: Light bee fill not captured.
- `lesson-top-bar`: Settings gear hover not captured, only CSS.
- `challenge-header`: HARD EXERCISE badge: not in any dump; the badge colour is set inline, so no CSS rule names its colour.
- `challenge-header`: Badge icon SVGs are inline and not saved in any icons-*.json (no lesson icon capture).
- `challenge-header`: PREVIOUS MISTAKE captured in dark only.
- `character-speech-bubble`: Hint-token popover (word definitions) never opened.
- `character-speech-bubble`: Character art is a canvas animation; not extractable.
- `character-speech-bubble`: Dark crop is from lesson-dark-feedback-incorrect (different sentence than the dark challenge dumps) because the dark challenge-default screenshot shows a later moment.
- `answer-lines`: Dark crop comes from the feedback-incorrect screenshot (one row visible, a tile in it).
- `word-bank-tile`: Keyboard-focus ring for tiles not captured.
- `choice-row`: lesson-light-choice-selected screenshot shows the moment before selection (row 3 unselected, CHECK disabled) although its dump has row 3 selected; the light selected crop was deleted. Light selected values come from the dump.
- `choice-row`: No light choice-default dump.
- `choice-row`: Correct/incorrect choice rows not captured (CSS only).
- `image-select-card`: No dark image-select dump: dark tokens would follow the choice-row values (same ._8dMUn rules) but were not captured.
- `match-tile`: Wrong-pair flash: dark dump only, no screenshot, no light capture (the colours are inline, so no CSS rule gives the light values; by palette name flamingo light is #FFB2B2, fire-ant light #EA2B2B, unverified).
- `match-tile`: Correct-pair flash (before the tiles go swan) not captured.
- `match-tile`: lesson-light-match-pair-matched has no screenshot.
- `dialogue-challenge`: No light dialogue capture.
- `dialogue-challenge`: Avatars are external SVGs (simg-ssl.duolingo.com/world-characters/avatars/bea_avatar_icon.svg, eddy_avatar_icon.svg).
- `listen-challenge`: lesson-dark-listen-default and lesson-dark-cant-listen have no screenshots, so no crops.
- `listen-challenge`: No light listen capture.
- `lesson-footer`: CHECK hover screenshot (lesson-dark-check-hover) does not match its dump; no hover crop.
- `lesson-footer`: lesson-dark-challenge-check-enabled has no screenshot; enabled dark crop taken from lesson-dark-choice-selected.
- `lesson-footer`: Light enabled crop deleted: lesson-light-choice-selected screenshot shows CHECK still disabled.
- `feedback-bar`: Light incorrect not captured: every light incorrect value is derived from the CSS rules the dark incorrect nodes use.
- `feedback-bar`: Light incorrect icon image and report icon not captured; REPORT icon class for light incorrect is probably .o8H6C (images/0f625e0c64ba72c0cd96755abcc4bcdf.svg), inferred only from the order of the report-icon rules in css:1008-b4d34396.css (light correct _26G6u, dark correct Htiq_, then o8H6C, dark incorrect _2M-GA).
- `feedback-bar`: TOO EASY / TOO DIFFICULT icons are inline stroke SVGs (stroke = state colour, 2px).
- `review-interstitial`: light theme not captured: light values derived from CSS variables and palette
- `review-interstitial`: mobile layout not captured
- `review-interstitial`: the body text of the bubble has no own colour on the node, so its colour comes from the body rule
- `combo-interstitial`: screenshot lesson-light-combo-interstitial shows the previous challenge (transition not yet painted), so no crop and no visual of the canvas animation
- `combo-interstitial`: the canvas artwork (flame or Duo animation) is not inspectable from the dump
- `combo-interstitial`: final (fully animated) caption size and opacity not captured; only CSS start values and a mid-animation computed size
- `harder-interstitial`: only present behind the quit modal: the screenshot shows the modal over it, so no crop
- `harder-interstitial`: no standalone dump or dark capture; footer state during this interstitial unknown
- `quit-modal`: art image URL not recorded in the dump (img src not captured)
- `quit-modal`: card box-shadow: none present in dump or CSS
- `lesson-complete`: dump captured mid-animation: first card label reads "combo" and the second card is opacity 0 with no children; the screenshot (later moment) shows "TOTAL XP 15" (bee) and "GREAT! 94%" (owl). Label texts and accuracy card colour are estimated from screenshot
- `lesson-complete`: illustration is a lottie not present in the dump; crop top 160px above the title is included only to show it (estimated from screenshot)
- `lesson-complete`: light theme lesson-complete body not captured (footer light values come from lesson-light-video-ad, which sits on the same end-screen footer)
- `lesson-complete`: stat icon images (bolt, target) URLs not captured
- `streak-screen`: the streak count ("1") and flame are canvas animations: no type style or colour recorded for the number (it looks fox in the screenshot, estimated)
- `streak-screen`: celebration screenshot is a later moment than the dump (layout shifted about 37px left; footer button reads "I CAN DO IT!"); crop uses dx=-37, dy=-5
- `streak-screen`: light theme not captured: all light values derived
- `streak-screen`: streak freeze or perfect-week day states not present
- `streak-goal-list`: selected row not captured (only CSS)
- `streak-goal-list`: light theme not captured
- `streak-goal-list`: bubble text is split into per-letter spans (typing reveal); final typography only
- `friend-streak-invite`: light theme not captured
- `friend-streak-invite`: INVITE pressed / invited state not captured
- `friend-streak-invite`: list continues below the footer (rows to y=975), only 4 rows visible
- `super-upsell`: each upsell captured in one theme only; these screens use always-light/always-dark and branded colours (eclipse, cosmos, gradient) so theme differences are limited to the lower trial panel (eel, swan)
- `super-upsell`: hero and lottie artwork, logo and video URLs not recorded
- `super-upsell`: trial option selected state not captured
- `super-upsell`: the video ad is a house ad; the dump shows the lesson-complete footer (light) under it, reused for lesson-complete light tokens
- `streak-dropdown`: dark theme shows the unextended header and light the extended one; the opposite pairings are from CSS only
- `streak-dropdown`: frozen, streak society and milestone header variants not captured
- `streak-dropdown`: multi-day streak connector bar not captured (streak was 0 or 1 day)
- `streak-dropdown`: mobile streak dropdown/page not captured
- `gems-dropdown`: mobile not captured
- `hearts-dropdown`: out-of-hearts (0 hearts) state not captured
- `hearts-dropdown`: mobile not captured
- `hearts-dropdown`: svg fill #FFE7E7 in the refilling heart matches no palette name (NO PALETTE MATCH)
- `courses-dropdown`: row hover not captured (css only)
- `courses-dropdown`: in dark, hover (polar) and current (iguana) resolve to the same #202F36
- `courses-dropdown`: horizontal ._3wAnu variant not captured
- `leaderboard`: leaderboard-dark-top/-row-hover/-populated screenshots are 1200x800 against a 797 dump; crops use dy=+3 (verified visually)
- `leaderboard`: demotion zone rows and divider not present (Bronze league, 15 rows, nobody demoted)
- `leaderboard`: not-joined state captured in dark only
- `leaderboard`: light-default hover on row 4 was incidental (pointer rested there), not a deliberate state capture
- `leaderboard`: leaderboard-dark-mobile screenshot does not match its dump: the shot is scrolled with the user at rank 13 (swan row), the dump has the user at rank 10 in the promotion zone; crop kept only as a layout reference, values come from the dump
- `status-picker`: hover/active on tiles not captured (css only)
- `status-picker`: empty status (after CLEAR) not captured
- `status-picker`: mobile location of the picker not captured
- `daily-quest-card`: partial progress (between 0 and max) not captured
- `daily-quest-card`: multiple unlocked quests not captured (only one quest plus the locked card)
- `daily-quest-card`: why the mobile timer uses bee rather than fox is not determined
- `monthly-badges`: mobile Badges tab not captured
- `monthly-badges`: earned vs unearned badge styling not distinguishable (all shown badges are past months)
- `achievement-row`: light crop shows only the first two rows (third row is below the light scrolled viewport)
- `achievement-row`: completed/locked achievement tile variants beyond these three were not on the page
- `achievement-row`: mobile rows not in any screenshot (below the fold); mobile values are from the dump only
- `profile-header`: avatar art is drawn in a <canvas>, so its layers are not in the dump
- `profile-header`: no hover/active state dump for the header; states are from CSS only
- `profile-header`: another user's profile (Follow button instead of edit) was not captured
- `profile-stat-tile`: light crop shows only the first row plus the WEEK badge (second row is below the fold)
- `friend-suggestion-card`: no hover/pressed dump for FOLLOW or dismiss; states are CSS only
- `friend-suggestion-card`: mobile row layout not in any screenshot (below the fold)
- `friend-suggestion-card`: the dark crop shows the mouse pointer over the first card (screenshot artefact)
- `friend-update-card`: no hover/pressed dump for CELEBRATE; celebrated (reacted) state not captured
- `friend-update-card`: anchor colour #0000EE on avatar/reaction links is the UA default and has no visible text; ignore
- `characters-cell`: account has no character mastery, so partial and full bars are not in any dump
- `characters-cell`: no mobile dump
- `characters-cell`: characters-dark-tips dump is identical to default apart from an overlay opacity node (#1271): the tips view itself was not captured
- `characters-tabs`: tab hover dump has no screenshot (characters-dark-tab-hover); no hover crop
- `guidebook-phrase`: no mobile dump
- `guidebook-phrase`: no hover or audio-playing dump
- `shop-item-row`: no hover/pressed dump on /shop
- `shop-item-row`: only hearts refill, unlimited hearts and streak freeze exist on this account's shop
- `super-promo-card`: no hover/pressed dump for any Super button
- `super-promo-card`: shop trial variant (B) only captured in dark; family plan (C) in light shop and both settings-super dumps
- `adblock-card`: card height (330px) is the measured rect; no CSS rule in the captured chunks sets it explicitly
