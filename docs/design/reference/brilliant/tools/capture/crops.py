from PIL import Image, ImageDraw
import os, sys
S='cap/srgb_'
C=[ # name, file, x0,y0,x1,y1 in CSS px
('button3d-primary-dark','onboarding-dark-intro.png',530,715,855,795),
('button3d-disabled-dark','onboarding-dark-voice-choice.png',530,715,855,795),
('choice-card-states-dark','onboarding-dark-voice-choice.png',500,270,880,620),
('choice-card-hover-dark','onboarding-dark-choice-card-hover.png',500,270,880,620),
('choice-card-selected-dark','onboarding-dark-choice-card-selected.png',500,270,880,640),
('switch-onboarding-dark','onboarding-dark-choice-card-selected.png',610,545,780,605),
('progress-onboarding-dark','onboarding-dark-level-list.png',300,10,1090,50),
('subject-card-selected-dark','onboarding-dark-subject-selected.png',470,300,930,570),
('level-option-cards-dark','onboarding-dark-level-list.png',280,260,1110,560),
('hue-shift-pills-dark','onboarding-dark-placement-question.png',520,712,865,792),
('figure-card-dark','onboarding-dark-placement-question.png',490,225,895,605),
('koji-question-dark','onboarding-dark-placement-question.png',420,90,960,170),
('promo-badge-headline-dark','promo-dark-returning-learner-offer.png',470,500,915,665),
('segmented-progress-eyebrow-dark','plan-dark-learning-plan-intro.png',320,10,1070,170),
('learning-path-tiles-dark','plan-dark-learning-path.png',190,280,1190,560),
('bottom-action-bar-dark','plan-dark-learning-path.png',0,660,1384,797),
('lesson-topbar-dark','lesson-dark-default.png',30,0,1360,70),
('lesson-interactive-dark','lesson-dark-answer-filled.png',570,100,815,575),
('lesson-koji-dock-dark','lesson-dark-default.png',0,590,460,797),
('lesson-footer-correct-dark','lesson-dark-correct.png',0,540,1384,797),
('lesson-footer-retry-dark','lesson-dark-retryable.png',0,510,1384,797),
('lesson-answer-retry-badge-dark','lesson-dark-retryable.png',580,350,810,460),
('lesson-answer-correct-badge-dark','lesson-dark-correct.png',580,350,810,460),
('tutor-chat-panel-dark','lesson-dark-tutor-chat-open.png',0,60,470,797),
('tutor-input-filled-dark','lesson-dark-tutor-input-filled.png',90,670,450,797),
('tutor-highlight-dark','lesson-dark-tutor-highlight.png',800,360,1020,460),
('modal-quit-dark','lesson-dark-quit-confirm-dialog.png',470,240,915,560),
('modal-quit-danger-hover-dark','lesson-dark-quit-confirm-danger-hover.png',470,240,915,560),
('app-header-dark','course-dark-default.png',0,0,1384,118),
('course-hero-card-dark','course-dark-default.png',170,160,700,520),
('course-path-dark','course-dark-default.png',690,160,1210,797),
('dropdown-menu-dark','course-dark-header-menu-hover.png',1010,55,1335,345),
('popover-keys-dark','course-dark-keys-popover.png',780,50,1180,380),
('popover-streak-dark','course-dark-streak-popover.png',850,50,1270,440),
('home-gamification-card-dark','home-dark-default.png',180,250,590,672),
('home-recommended-card-dark','home-dark-default.png',585,190,1205,672),
('home-ask-pill-dark','home-dark-default.png',395,675,990,775),
('home-koji-prompt-dark','home-dark-koji-prompt-open.png',260,200,1130,797),
('weekly-summary-dark','you-dark-default.png',100,95,1280,420),
('segmented-and-stats-dark','you-dark-default.png',100,440,1280,655),
('bar-chart-and-tooltip-dark','you-dark-chart-tooltip.png',100,230,1280,700),
('courses-search-dark','courses-dark-default.png',940,115,1320,195),
('courses-shelf-dark','courses-dark-default.png',70,300,1320,797),
('course-tile-hover-dark','courses-dark-course-tile-hover.png',90,490,590,760),
('settings-sidenav-dark','settings-dark-account.png',70,130,380,320),
('settings-inputs-dark','settings-dark-account.png',380,130,1000,470),
('settings-email-badges-dark','settings-dark-account.png',380,505,1000,745),
('input-focus-dark','settings-dark-input-focus-button-hover.png',380,190,1000,300),
('button-primary-hover-dark','settings-dark-input-focus-button-hover.png',380,665,1000,745),
('preferences-segmented-switch-dark','settings-dark-preferences.png',380,130,1000,730),
('preferences-switches-off-dark','settings-dark-preferences-switches-off.png',380,60,1000,797),
('preferences-light','settings-light-preferences.png',380,120,1000,760),
('app-header-light','settings-light-preferences.png',0,0,1384,118),
('lesson-topbar-light','lesson-light-default.png',30,0,1360,70),
('lesson-interactive-light','lesson-light-default.png',560,185,820,575),
('lesson-frame-light','lesson-light-default.png',20,55,1365,797),
('course-hero-card-light','course-light-default.png',170,140,700,520),
('course-path-light-app','course-light-default.png',690,140,1210,840),
('home-gamification-card-light','home-light-default.png',185,250,590,665),
('home-recommended-card-light','home-light-default.png',590,190,1200,665),
('home-ask-pill-light','home-light-default.png',395,675,990,775),
('weekly-summary-light','you-light-default.png',100,95,1280,420),
('segmented-and-stats-light','you-light-default.png',100,445,1280,655),
('courses-search-light','courses-light-default.png',940,115,1320,195),
('courses-shelf-light','courses-light-default.png',70,300,1320,797),
('settings-sidenav-light','settings-light-account.png',70,130,380,320),
('settings-inputs-light','settings-light-account.png',380,130,1000,470),
('settings-email-badges-light','settings-light-account.png',380,505,1000,745),
('dropdown-menu-light','settings-light-header-menu-open.png',1010,55,1335,345),
('popover-keys-light','settings-light-keys-popover.png',780,50,1180,380),
('popover-streak-light','settings-light-streak-popover.png',850,50,1270,440),
]
P=[ # public, 1440 css wide at 2x
('login-form-light','login-light-default.png',470,90,970,830),
('login-form-dark','login-dark-default.png',470,90,970,830),
('pricing-hero-light','pricing-light-default.png',140,270,1300,860),
('pricing-hero-dark','pricing-dark-default.png',140,270,1300,860),
('premium-comparison-dark','pricing-dark-fullpage.png',400,2830,1040,3440),
('premium-comparison-light','pricing-light-fullpage.png',400,2776,1040,3386),
('landing-ctas-light','landing-light-default.png',90,590,730,700),
('public-header-light','courses-public-light-default.png',0,0,1440,70),
('course-tiles-light','courses-public-light-default.png',80,420,1320,760),
('course-path-light','course-public-light-default.png',690,80,1210,900),
('notfound-legacy-light','notfound-light-404.png',100,40,1340,500),
]
os.makedirs('wt/docs/design/reference/brilliant/components/crops', exist_ok=True)
out=[]
for name,f,x0,y0,x1,y1 in C+P:
    im=Image.open(S+f); base=1440 if (name,f,x0,y0,x1,y1) in P else 1384; s=im.size[0]/base
    box=tuple(int(round(v*s)) for v in (x0,y0,x1,y1)); box=(box[0],box[1],min(box[2],im.size[0]),min(box[3],im.size[1]))
    c=im.crop(box)
    if c.size[0]>1600: c=c.resize((1600,int(c.size[1]*1600/c.size[0])), Image.LANCZOS)
    c.save(f'cap/crops/{name}.png'); out.append((name,c))
# contact sheet
W=4; cell=(340,240)
sheet=Image.new('RGB',(W*cell[0],((len(out)+W-1)//W)*(cell[1]+16)),'white'); d=ImageDraw.Draw(sheet)
for i,(n,c) in enumerate(out):
    t=c.copy(); t.thumbnail(cell); x=(i%W)*cell[0]; y=(i//W)*(cell[1]+16); sheet.paste(t,(x,y+14)); d.text((x+2,y),n,fill='red')
sheet.save('cap/crops_sheet.png'); print(len(out), sheet.size)
