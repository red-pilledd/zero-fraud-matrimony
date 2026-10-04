// UI text in English and Malayalam. Keys are grouped by screen.
export type Lang = 'en' | 'ml'

const en = {
  'brand.tagline': 'Verified Kerala matrimony. Every member real, every message safe.',
  'nav.discover': 'Matches', 'nav.inbox': 'Inbox', 'nav.assistant': 'Assistant', 'nav.me': 'Profile',
  'common.next': 'Continue', 'common.back': 'Back', 'common.save': 'Save', 'common.cancel': 'Cancel', 'common.retry': 'Retry',
  'common.loading': 'Loading…', 'common.yrs': 'yrs', 'common.verified': 'Verified', 'common.skip': 'Skip',
  'common.send': 'Send', 'common.close': 'Close', 'common.done': 'Done', 'common.optional': 'optional',

  'login.title': 'Sign in with your mobile number', 'login.phone': 'Mobile number', 'login.send': 'Send code',
  'login.code': '6-digit code sent by SMS', 'login.verify': 'Verify & continue', 'login.change': 'Change number',
  'login.devcode': 'Test mode — your code is', 'login.terms': 'By continuing you agree that our AI reads messages for safety before they are delivered, and that sharing contact details is only allowed after both members agree.',

  'ob.step': 'Step', 'ob.of': 'of',
  'ob.who.title': 'Who is creating this profile?', 'ob.who.SELF': 'Myself', 'ob.who.PARENT': 'Parent', 'ob.who.SIBLING': 'Brother / Sister',
  'ob.who.RELATIVE': 'Relative', 'ob.who.FRIEND': 'Friend',
  'ob.lang': 'Language',
  'ob.track.title': 'What brings you here?', 'ob.track.MATRIMONY': 'Marriage', 'ob.track.MATRIMONY.d': 'Looking for a life partner to marry',
  'ob.track.DATING': 'Something else', 'ob.track.DATING.d': 'Not looking to marry right now, or not sure yet',
  'ob.purpose.title': 'What are you looking for?', 'ob.purpose.note': 'This is private. It only decides who you meet — it never shows on your profile.',
  'ob.purpose.MARRIAGE': 'Dating that could lead to marriage', 'ob.purpose.MARRIAGE.d': "You'll meet people who are open to marriage",
  'ob.purpose.LONG_TERM': 'A long-term relationship', 'ob.purpose.LONG_TERM.d': 'Serious and committed, without marriage plans',
  'ob.purpose.CASUAL': 'Casual dating', 'ob.purpose.CASUAL.d': 'Meeting new people, no pressure — respectful as always',

  'ob.basics.title': 'The basics', 'ob.basics.self': 'About you', 'ob.basics.other': 'About the person',
  'f.full_name': 'Full name (private)', 'f.display_name': 'Name shown on profile', 'f.gender': 'Gender', 'f.MAN': 'Man', 'f.WOMAN': 'Woman',
  'f.seeking': 'Interested in', 'f.MEN': 'Men', 'f.WOMEN': 'Women', 'f.EVERYONE': 'Everyone',
  'f.dob': 'Date of birth', 'f.height_cm': 'Height (cm)', 'f.marital_status': 'Marital status',
  'f.NEVER_MARRIED': 'Never married', 'f.DIVORCED': 'Divorced', 'f.WIDOWED': 'Widowed', 'f.SEPARATED': 'Separated',
  'f.religion': 'Religion', 'f.caste': 'Caste / community', 'f.mother_tongue': 'Mother tongue', 'f.district': 'District / city',
  'f.state': 'State', 'f.country': 'Country', 'f.education': 'Education', 'f.occupation': 'Occupation', 'f.income_band': 'Annual income',
  'f.diet': 'Diet', 'f.drinks': 'Drinks', 'f.smokes': 'Smokes', 'f.pref_age': 'Preferred age', 'f.to': 'to',
  'f.photo_visibility': 'Who can see photos', 'f.MEMBERS': 'All verified members', 'f.ACCEPTED': 'Only people I accept to talk with',

  'ob.iv.title': 'Let’s get to know you', 'ob.iv.intro': 'Instead of a long form, our assistant asks a few questions. Answer in your own words — English or Malayalam.',
  'ob.iv.placeholder': 'Type your answer…', 'ob.iv.thinking': 'Thinking…',
  'ob.about.title': 'Your profile story', 'ob.about.intro': 'We wrote this from your answers. Edit anything you like.',
  'ob.photos.title': 'Add your photos', 'ob.photos.intro': 'At least one clear photo of your face. Every photo is checked — no group photos as the main photo, no numbers or QR codes.',
  'ob.photos.add': 'Add photo', 'ob.photos.checking': 'Checking photo…', 'ob.photos.main': 'Main', 'ob.photos.review': 'Being reviewed',
  'ob.photos.makeMain': 'Make main', 'ob.photos.remove': 'Remove',
  'ob.selfie.title': 'Quick live selfie', 'ob.selfie.intro': 'This proves you are the person in your photos. Do the gesture shown, then take the picture.',
  'ob.selfie.start': 'Open camera', 'ob.selfie.capture': 'Take selfie', 'ob.selfie.do': 'Do this:', 'ob.selfie.checking': 'Checking…',
  'ob.selfie.again': 'Try again', 'ob.selfie.nocam': 'Camera not available. Allow camera access in your browser settings and reload.',

  'disc.title': 'Your matches', 'disc.filters': 'Filters', 'disc.empty': 'No new profiles right now. Check back soon — new verified members join every day.',
  'disc.more': 'Show more', 'disc.age': 'Age', 'disc.any': 'Any', 'disc.apply': 'Apply', 'disc.byFamily': 'Profile by family',
  'disc.pendingSelfie': 'Your selfie is being reviewed. You can look around; starting conversations unlocks once it is confirmed.',

  'prof.about': 'About', 'prof.details': 'Details', 'prof.start': 'Start a conversation', 'prof.price': 'One-time fee',
  'prof.introLabel': 'Your first message', 'prof.introHint': 'Say hello and why their profile caught your eye. No contact details.',
  'prof.refund': 'If they don’t reply within 48 hours, or decline, the fee comes back as credit automatically.',
  'prof.useCredit': 'Use credit', 'prof.pay': 'Pay', 'prof.credit': 'Your credit', 'prof.goChat': 'Open conversation',
  'prof.waiting': 'Request sent — waiting for reply', 'prof.ended': 'This conversation has ended', 'prof.testPay': 'Test payment (no real money)',
  'prof.photosHidden': 'Photos are shown once they accept your conversation',

  'inbox.title': 'Inbox', 'inbox.requests': 'Requests for you', 'inbox.chats': 'Conversations', 'inbox.sent': 'Waiting for reply',
  'inbox.past': 'Past', 'inbox.accept': 'Accept', 'inbox.decline': 'Decline', 'inbox.empty': 'Nothing here yet. Start a conversation from Matches.',
  'inbox.expires': 'Reply by', 'inbox.refunded': 'Fee returned as credit', 'inbox.declined': 'Declined', 'inbox.expired': 'No reply',
  'inbox.closed': 'Ended', 'inbox.credit': 'Credit',

  'chat.placeholder': 'Write a message…', 'chat.checking': 'Checking…', 'chat.notSent': 'Not sent',
  'chat.safety': 'Every message is checked for safety before it’s delivered. Contact details unlock only when you both agree.',
  'chat.contact': 'Exchange contacts', 'chat.contactAsk': 'wants to exchange phone numbers. Do you agree?', 'chat.agree': 'Agree',
  'chat.notYet': 'Not yet', 'chat.contactWaiting': 'Waiting for them to agree to exchange numbers', 'chat.contactReview': 'Checking whether it’s a good time to exchange numbers…',
  'chat.phone': 'Phone number', 'chat.menu': 'Options', 'chat.end': 'End conversation', 'chat.block': 'Block', 'chat.report': 'Report',
  'chat.reportWhy': 'What happened? Our team will look into it.', 'chat.closed': 'This conversation has ended.',
  'chat.request': 'Waiting for them to accept your request.', 'chat.paused': 'Your account is paused — you can read but not send.',

  'asst.title': 'Your assistant', 'asst.intro': 'Private questions to understand you better and find better matches. Only you see these.',
  'asst.empty': 'No questions right now.', 'asst.answer': 'Your answer…', 'asst.answered': 'Answered', 'asst.skipped': 'Skipped',

  'me.title': 'Profile', 'me.edit': 'Edit details', 'me.photos': 'Photos', 'me.about': 'About', 'me.settings': 'Settings',
  'me.language': 'Language', 'me.purpose': 'What I’m looking for', 'me.notify': 'Phone notifications', 'me.notifyOn': 'Turn on',
  'me.notifyDone': 'On for this device', 'me.logout': 'Sign out', 'me.delete': 'Delete my account', 'me.deleteConfirm': 'Delete your account? Your profile and photos will be erased and open conversations ended.',
  'me.credit': 'Credit', 'me.selfie': 'Selfie', 'me.strikes': 'Warnings', 'me.creditNote': 'Used automatically the next time you start a conversation.',
  'me.preview': 'View as others see it',

  'closed.title': 'Account closed', 'closed.body': 'This account was closed for breaking the community rules.',
  'footer.credit': 'Designed by IndusLabs',
} as const

export type Key = keyof typeof en

const ml: Partial<Record<Key, string>> = {
  'brand.tagline': 'ഉറപ്പുള്ള കേരള വിവാഹാലോചനകൾ. ഓരോ അംഗവും യഥാർത്ഥം, ഓരോ സന്ദേശവും സുരക്ഷിതം.',
  'nav.discover': 'ആലോചനകൾ', 'nav.inbox': 'സന്ദേശങ്ങൾ', 'nav.assistant': 'സഹായി', 'nav.me': 'പ്രൊഫൈൽ',
  'common.next': 'തുടരുക', 'common.back': 'പിന്നോട്ട്', 'common.save': 'സേവ് ചെയ്യുക', 'common.cancel': 'റദ്ദാക്കുക', 'common.retry': 'വീണ്ടും ശ്രമിക്കുക',
  'common.loading': 'ലോഡ് ചെയ്യുന്നു…', 'common.yrs': 'വയസ്സ്', 'common.verified': 'ഉറപ്പാക്കിയത്', 'common.skip': 'ഒഴിവാക്കുക',
  'common.send': 'അയയ്ക്കുക', 'common.close': 'അടയ്ക്കുക', 'common.done': 'കഴിഞ്ഞു', 'common.optional': 'നിർബന്ധമില്ല',

  'login.title': 'മൊബൈൽ നമ്പർ ഉപയോഗിച്ച് പ്രവേശിക്കുക', 'login.phone': 'മൊബൈൽ നമ്പർ', 'login.send': 'കോഡ് അയയ്ക്കുക',
  'login.code': 'SMS ആയി വന്ന 6 അക്ക കോഡ്', 'login.verify': 'ഉറപ്പാക്കി തുടരുക', 'login.change': 'നമ്പർ മാറ്റുക',
  'login.devcode': 'ടെസ്റ്റ് മോഡ് — നിങ്ങളുടെ കോഡ്', 'login.terms': 'തുടരുന്നതിലൂടെ, സന്ദേശങ്ങൾ എത്തിക്കുന്നതിനു മുമ്പ് സുരക്ഷയ്ക്കായി ഞങ്ങളുടെ AI വായിക്കുമെന്നും, രണ്ടുപേരും സമ്മതിച്ചതിനു ശേഷം മാത്രമേ ഫോൺ നമ്പർ പങ്കിടാനാകൂ എന്നും നിങ്ങൾ അംഗീകരിക്കുന്നു.',

  'ob.step': 'ഘട്ടം', 'ob.of': '/',
  'ob.who.title': 'ആരാണ് ഈ പ്രൊഫൈൽ ഉണ്ടാക്കുന്നത്?', 'ob.who.SELF': 'ഞാൻ തന്നെ', 'ob.who.PARENT': 'അച്ഛൻ / അമ്മ', 'ob.who.SIBLING': 'സഹോദരൻ / സഹോദരി',
  'ob.who.RELATIVE': 'ബന്ധു', 'ob.who.FRIEND': 'സുഹൃത്ത്',
  'ob.lang': 'ഭാഷ',
  'ob.track.title': 'എന്താണ് നിങ്ങൾ അന്വേഷിക്കുന്നത്?', 'ob.track.MATRIMONY': 'വിവാഹം', 'ob.track.MATRIMONY.d': 'വിവാഹം കഴിക്കാൻ ഒരു ജീവിതപങ്കാളിയെ തേടുന്നു',
  'ob.track.DATING': 'മറ്റെന്തെങ്കിലും', 'ob.track.DATING.d': 'ഇപ്പോൾ വിവാഹത്തിനില്ല, അല്ലെങ്കിൽ ഉറപ്പില്ല',
  'ob.purpose.title': 'എന്താണ് നിങ്ങൾ തേടുന്നത്?', 'ob.purpose.note': 'ഇത് സ്വകാര്യമാണ്. ആരെ പരിചയപ്പെടണം എന്നു മാത്രമേ ഇത് തീരുമാനിക്കൂ — പ്രൊഫൈലിൽ കാണിക്കില്ല.',
  'ob.purpose.MARRIAGE': 'വിവാഹത്തിലേക്ക് നയിക്കാവുന്ന പരിചയം', 'ob.purpose.MARRIAGE.d': 'വിവാഹത്തിന് തയ്യാറുള്ളവരെ പരിചയപ്പെടാം',
  'ob.purpose.LONG_TERM': 'ദീർഘകാല ബന്ധം', 'ob.purpose.LONG_TERM.d': 'ഗൗരവമുള്ള ബന്ധം, വിവാഹ പദ്ധതിയില്ലാതെ',
  'ob.purpose.CASUAL': 'സാധാരണ ഡേറ്റിംഗ്', 'ob.purpose.CASUAL.d': 'പുതിയ ആളുകളെ പരിചയപ്പെടാം, സമ്മർദ്ദമില്ലാതെ — എപ്പോഴും മാന്യമായി',

  'ob.basics.title': 'അടിസ്ഥാന വിവരങ്ങൾ', 'ob.basics.self': 'നിങ്ങളെക്കുറിച്ച്', 'ob.basics.other': 'വ്യക്തിയെക്കുറിച്ച്',
  'f.full_name': 'മുഴുവൻ പേര് (സ്വകാര്യം)', 'f.display_name': 'പ്രൊഫൈലിൽ കാണിക്കുന്ന പേര്', 'f.gender': 'ലിംഗം', 'f.MAN': 'പുരുഷൻ', 'f.WOMAN': 'സ്ത്രീ',
  'f.seeking': 'താൽപര്യം', 'f.MEN': 'പുരുഷന്മാർ', 'f.WOMEN': 'സ്ത്രീകൾ', 'f.EVERYONE': 'എല്ലാവരും',
  'f.dob': 'ജനന തീയതി', 'f.height_cm': 'ഉയരം (സെ.മീ)', 'f.marital_status': 'വൈവാഹിക നില',
  'f.NEVER_MARRIED': 'അവിവാഹിതർ', 'f.DIVORCED': 'വിവാഹമോചിതർ', 'f.WIDOWED': 'വിധവ / വിഭാര്യൻ', 'f.SEPARATED': 'വേർപിരിഞ്ഞു താമസിക്കുന്നു',
  'f.religion': 'മതം', 'f.caste': 'ജാതി / സമുദായം', 'f.mother_tongue': 'മാതൃഭാഷ', 'f.district': 'ജില്ല / നഗരം',
  'f.state': 'സംസ്ഥാനം', 'f.country': 'രാജ്യം', 'f.education': 'വിദ്യാഭ്യാസം', 'f.occupation': 'ജോലി', 'f.income_band': 'വാർഷിക വരുമാനം',
  'f.diet': 'ഭക്ഷണരീതി', 'f.drinks': 'മദ്യപാനം', 'f.smokes': 'പുകവലി', 'f.pref_age': 'താൽപര്യമുള്ള പ്രായം', 'f.to': 'മുതൽ',
  'f.photo_visibility': 'ഫോട്ടോ ആർക്കൊക്കെ കാണാം', 'f.MEMBERS': 'ഉറപ്പാക്കിയ എല്ലാ അംഗങ്ങൾക്കും', 'f.ACCEPTED': 'ഞാൻ സംസാരിക്കാൻ സമ്മതിച്ചവർക്ക് മാത്രം',

  'ob.iv.title': 'നമുക്ക് പരിചയപ്പെടാം', 'ob.iv.intro': 'നീണ്ട ഫോമിനു പകരം ഞങ്ങളുടെ സഹായി കുറച്ചു ചോദ്യങ്ങൾ ചോദിക്കും. നിങ്ങളുടെ സ്വന്തം വാക്കുകളിൽ മറുപടി നൽകൂ — മലയാളത്തിലോ ഇംഗ്ലീഷിലോ.',
  'ob.iv.placeholder': 'മറുപടി എഴുതുക…', 'ob.iv.thinking': 'ആലോചിക്കുന്നു…',
  'ob.about.title': 'പ്രൊഫൈൽ വിവരണം', 'ob.about.intro': 'നിങ്ങളുടെ മറുപടികളിൽ നിന്ന് ഞങ്ങൾ എഴുതിയതാണ്. ഇഷ്ടമുള്ളത് മാറ്റാം.',
  'ob.photos.title': 'ഫോട്ടോകൾ ചേർക്കുക', 'ob.photos.intro': 'മുഖം വ്യക്തമായി കാണുന്ന ഒരു ഫോട്ടോയെങ്കിലും വേണം. എല്ലാ ഫോട്ടോയും പരിശോധിക്കും — പ്രധാന ഫോട്ടോയായി ഗ്രൂപ്പ് ഫോട്ടോ പാടില്ല, നമ്പറോ QR കോഡോ പാടില്ല.',
  'ob.photos.add': 'ഫോട്ടോ ചേർക്കുക', 'ob.photos.checking': 'ഫോട്ടോ പരിശോധിക്കുന്നു…', 'ob.photos.main': 'പ്രധാനം', 'ob.photos.review': 'പരിശോധനയിൽ',
  'ob.photos.makeMain': 'പ്രധാനമാക്കുക', 'ob.photos.remove': 'നീക്കം ചെയ്യുക',
  'ob.selfie.title': 'ഒരു ലൈവ് സെൽഫി', 'ob.selfie.intro': 'ഫോട്ടോകളിലുള്ളത് നിങ്ങൾ തന്നെയാണെന്ന് ഉറപ്പാക്കാനാണിത്. കാണിക്കുന്ന ആംഗ്യം ചെയ്ത് ഫോട്ടോ എടുക്കുക.',
  'ob.selfie.start': 'ക്യാമറ തുറക്കുക', 'ob.selfie.capture': 'സെൽഫി എടുക്കുക', 'ob.selfie.do': 'ഇത് ചെയ്യുക:', 'ob.selfie.checking': 'പരിശോധിക്കുന്നു…',
  'ob.selfie.again': 'വീണ്ടും ശ്രമിക്കുക', 'ob.selfie.nocam': 'ക്യാമറ ലഭ്യമല്ല. ബ്രൗസർ സെറ്റിംഗ്സിൽ ക്യാമറ അനുവദിച്ച് റീലോഡ് ചെയ്യുക.',

  'disc.title': 'നിങ്ങൾക്കുള്ള ആലോചനകൾ', 'disc.filters': 'ഫിൽട്ടർ', 'disc.empty': 'ഇപ്പോൾ പുതിയ പ്രൊഫൈലുകളില്ല. ഉടൻ വീണ്ടും നോക്കൂ — ദിവസവും പുതിയ അംഗങ്ങൾ ചേരുന്നുണ്ട്.',
  'disc.more': 'കൂടുതൽ കാണുക', 'disc.age': 'പ്രായം', 'disc.any': 'ഏതും', 'disc.apply': 'പ്രയോഗിക്കുക', 'disc.byFamily': 'കുടുംബം തയ്യാറാക്കിയ പ്രൊഫൈൽ',
  'disc.pendingSelfie': 'നിങ്ങളുടെ സെൽഫി പരിശോധനയിലാണ്. ചുറ്റും നോക്കാം; ഉറപ്പായാൽ സംഭാഷണം തുടങ്ങാം.',

  'prof.about': 'വിവരണം', 'prof.details': 'വിശദാംശങ്ങൾ', 'prof.start': 'സംഭാഷണം തുടങ്ങുക', 'prof.price': 'ഒറ്റത്തവണ ഫീസ്',
  'prof.introLabel': 'നിങ്ങളുടെ ആദ്യ സന്ദേശം', 'prof.introHint': 'ഒരു നമസ്കാരവും പ്രൊഫൈൽ ഇഷ്ടപ്പെടാൻ കാരണവും എഴുതൂ. ഫോൺ നമ്പറോ മറ്റ് വിവരങ്ങളോ പാടില്ല.',
  'prof.refund': '48 മണിക്കൂറിനുള്ളിൽ മറുപടിയില്ലെങ്കിലോ നിരസിച്ചാലോ ഫീസ് ക്രെഡിറ്റായി സ്വയം തിരികെ ലഭിക്കും.',
  'prof.useCredit': 'ക്രെഡിറ്റ് ഉപയോഗിക്കുക', 'prof.pay': 'പണമടയ്ക്കുക', 'prof.credit': 'നിങ്ങളുടെ ക്രെഡിറ്റ്', 'prof.goChat': 'സംഭാഷണം തുറക്കുക',
  'prof.waiting': 'അഭ്യർത്ഥന അയച്ചു — മറുപടിക്കായി കാത്തിരിക്കുന്നു', 'prof.ended': 'ഈ സംഭാഷണം അവസാനിച്ചു', 'prof.testPay': 'ടെസ്റ്റ് പേയ്മെന്റ് (യഥാർത്ഥ പണമല്ല)',
  'prof.photosHidden': 'സംഭാഷണം അവർ സ്വീകരിച്ചാൽ ഫോട്ടോകൾ കാണാം',

  'inbox.title': 'സന്ദേശങ്ങൾ', 'inbox.requests': 'നിങ്ങൾക്കുള്ള അഭ്യർത്ഥനകൾ', 'inbox.chats': 'സംഭാഷണങ്ങൾ', 'inbox.sent': 'മറുപടി കാത്തിരിക്കുന്നു',
  'inbox.past': 'മുമ്പത്തേത്', 'inbox.accept': 'സ്വീകരിക്കുക', 'inbox.decline': 'നിരസിക്കുക', 'inbox.empty': 'ഇവിടെ ഇനിയും ഒന്നുമില്ല. ആലോചനകളിൽ നിന്ന് ഒരു സംഭാഷണം തുടങ്ങൂ.',
  'inbox.expires': 'മറുപടി നൽകേണ്ടത്', 'inbox.refunded': 'ഫീസ് ക്രെഡിറ്റായി തിരികെ നൽകി', 'inbox.declined': 'നിരസിച്ചു', 'inbox.expired': 'മറുപടി ലഭിച്ചില്ല',
  'inbox.closed': 'അവസാനിച്ചു', 'inbox.credit': 'ക്രെഡിറ്റ്',

  'chat.placeholder': 'സന്ദേശം എഴുതുക…', 'chat.checking': 'പരിശോധിക്കുന്നു…', 'chat.notSent': 'അയച്ചില്ല',
  'chat.safety': 'ഓരോ സന്ദേശവും എത്തിക്കുന്നതിനു മുമ്പ് സുരക്ഷയ്ക്കായി പരിശോധിക്കും. രണ്ടുപേരും സമ്മതിച്ചാൽ മാത്രമേ ഫോൺ നമ്പർ പങ്കിടാനാകൂ.',
  'chat.contact': 'നമ്പർ കൈമാറുക', 'chat.contactAsk': 'ഫോൺ നമ്പർ കൈമാറാൻ ആഗ്രഹിക്കുന്നു. നിങ്ങൾ സമ്മതിക്കുന്നോ?', 'chat.agree': 'സമ്മതം',
  'chat.notYet': 'ഇപ്പോൾ വേണ്ട', 'chat.contactWaiting': 'നമ്പർ കൈമാറാൻ അവരുടെ സമ്മതത്തിനായി കാത്തിരിക്കുന്നു', 'chat.contactReview': 'നമ്പർ കൈമാറാൻ സമയമായോ എന്ന് പരിശോധിക്കുന്നു…',
  'chat.phone': 'ഫോൺ നമ്പർ', 'chat.menu': 'ഓപ്ഷനുകൾ', 'chat.end': 'സംഭാഷണം അവസാനിപ്പിക്കുക', 'chat.block': 'ബ്ലോക്ക് ചെയ്യുക', 'chat.report': 'റിപ്പോർട്ട് ചെയ്യുക',
  'chat.reportWhy': 'എന്താണ് സംഭവിച്ചത്? ഞങ്ങളുടെ ടീം പരിശോധിക്കും.', 'chat.closed': 'ഈ സംഭാഷണം അവസാനിച്ചു.',
  'chat.request': 'നിങ്ങളുടെ അഭ്യർത്ഥന അവർ സ്വീകരിക്കുന്നതിനായി കാത്തിരിക്കുന്നു.', 'chat.paused': 'നിങ്ങളുടെ അക്കൗണ്ട് താൽക്കാലികമായി നിർത്തിയിരിക്കുന്നു — വായിക്കാം, അയയ്ക്കാനാവില്ല.',

  'asst.title': 'നിങ്ങളുടെ സഹായി', 'asst.intro': 'നിങ്ങളെ നന്നായി മനസ്സിലാക്കാനും മികച്ച ആലോചനകൾ കണ്ടെത്താനുമുള്ള സ്വകാര്യ ചോദ്യങ്ങൾ. നിങ്ങൾക്ക് മാത്രമേ ഇവ കാണാനാകൂ.',
  'asst.empty': 'ഇപ്പോൾ ചോദ്യങ്ങളൊന്നുമില്ല.', 'asst.answer': 'നിങ്ങളുടെ മറുപടി…', 'asst.answered': 'മറുപടി നൽകി', 'asst.skipped': 'ഒഴിവാക്കി',

  'me.title': 'പ്രൊഫൈൽ', 'me.edit': 'വിവരങ്ങൾ മാറ്റുക', 'me.photos': 'ഫോട്ടോകൾ', 'me.about': 'വിവരണം', 'me.settings': 'സെറ്റിംഗ്സ്',
  'me.language': 'ഭാഷ', 'me.purpose': 'ഞാൻ തേടുന്നത്', 'me.notify': 'ഫോൺ അറിയിപ്പുകൾ', 'me.notifyOn': 'ഓണാക്കുക',
  'me.notifyDone': 'ഈ ഫോണിൽ ഓണാണ്', 'me.logout': 'പുറത്തുകടക്കുക', 'me.delete': 'അക്കൗണ്ട് ഡിലീറ്റ് ചെയ്യുക', 'me.deleteConfirm': 'അക്കൗണ്ട് ഡിലീറ്റ് ചെയ്യണോ? പ്രൊഫൈലും ഫോട്ടോകളും മായ്ക്കും, തുറന്ന സംഭാഷണങ്ങൾ അവസാനിക്കും.',
  'me.credit': 'ക്രെഡിറ്റ്', 'me.selfie': 'സെൽഫി', 'me.strikes': 'മുന്നറിയിപ്പുകൾ', 'me.creditNote': 'അടുത്ത തവണ സംഭാഷണം തുടങ്ങുമ്പോൾ സ്വയം ഉപയോഗിക്കും.',
  'me.preview': 'മറ്റുള്ളവർ കാണുന്നതുപോലെ കാണുക',

  'closed.title': 'അക്കൗണ്ട് അടച്ചു', 'closed.body': 'സമൂഹ നിയമങ്ങൾ ലംഘിച്ചതിനാൽ ഈ അക്കൗണ്ട് അടച്ചു.',
  'footer.credit': 'Designed by IndusLabs',
}

export function translate(lang: Lang, key: Key): string {
  return (lang === 'ml' ? ml[key] : undefined) ?? en[key]
}
