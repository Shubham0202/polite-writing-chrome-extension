// Whole-sentence rewrites for common blunt or casual workplace phrases.
// Keys are written naturally; toneEngine.js normalizes keys and input the same way (case, apostrophes,
// contractions, final punctuation), so "I don't understand!" and "i do not understand" both match.
// Replacements must keep the original meaning: soften the tone, never add facts, deadlines or promises.
//
// Polite tone uses the categories that soften demands, criticism and disagreement.
// Professional tone uses those plus the workplace-register categories at the bottom of this file.

export const REQUEST_TEMPLATES = {
  'fix this issue': 'Could you please look into this issue?',
  'fix this': 'Could you please look into this?',
  'do this task': 'Could you please take care of this task?',
  'start working on this': 'Could you please get started on this?',
  'check this': 'Could you please review this?',
  'look at this': 'Could you please take a look at this?',
  'handle this': 'Could you please take care of this?',
  'finish this work': 'Could you please wrap up this work?',
  'share the details': 'Could you please share the relevant details?',
  'do the needful': 'Could you please take the necessary action?',
  'please do the needful': 'Could you please take the necessary action?',
}

export const FOLLOW_UP_TEMPLATES = {
  'tell me the update': 'Could you please share an update?',
  'give me an update': 'Could you please share an update?',
  'send an update': 'Could you please share the latest update?',
  'any update': 'Could you please share an update?',
  'any updates': 'Could you please share an update?',
  'any progress': 'Could you please share any progress on this?',
  'any news': 'Have there been any updates on this?',
  'update me': 'Could you please keep me updated?',
  'keep me posted': 'Please keep me informed of any further developments.',
  'what is the status': 'Could you please share the current status?',
  'what happened to this': 'Could you please let me know the latest status?',
  'did you check this': 'Have you had a chance to review this?',
  'did you complete this': 'Could you please confirm whether this has been completed?',
  'why is this pending': 'Could you please help me understand why this is still pending?',
  "i'm waiting for your response": 'I wanted to follow up and check whether you had a chance to respond.',
  "you haven't responded": 'I wanted to follow up on my previous message.',
  'why no reply': 'I wanted to follow up on my previous message.',
  'please respond': 'I would appreciate your response when you have a moment.',
  'let me know asap': 'Please let me know as soon as you get a chance.',
}

export const DEADLINE_TEMPLATES = {
  'i need this urgently': 'I would appreciate it if this could be prioritized.',
  'i need it urgently': 'I would appreciate it if this could be prioritized.',
  'this is urgent': 'This is time-sensitive, so I would appreciate your prompt attention.',
  'do this quickly': 'Could you please complete this at your earliest convenience?',
  'do it quickly': 'Could you please complete this at your earliest convenience?',
  'do it asap': 'Could you please prioritize this?',
  'finish it fast': 'Could you please complete this as soon as possible?',
  'reply fast': 'Could you please reply at your earliest convenience?',
  "don't delay this": 'Please ensure this stays on schedule.',
  'we are getting late': 'We are approaching the deadline, so it would help to prioritize this.',
  'this is already delayed': 'This appears to be behind schedule.',
  'complete it before the deadline': 'Please make sure this is completed before the agreed deadline.',
  'we need this today': 'It would be helpful to have this completed by the end of today.',
  'why are you taking so long': 'Could you share an update on the expected completion time?',
  "we can't wait anymore": 'We need to move forward with this as soon as possible.',
}

export const CLARIFICATION_TEMPLATES = {
  "i don't understand": 'Could you please clarify this for me?',
  'what do you mean': 'Could you please elaborate on what you mean?',
  'explain this': 'Could you please provide some additional context?',
  'this is confusing': 'I would appreciate some clarification on this.',
  'why did you do this': 'Could you help me understand the reasoning behind this?',
  'what is the point of this': 'Could you please explain the purpose of this?',
  'are you sure': 'Could you please double-check this?',
}

export const DISAGREEMENT_TEMPLATES = {
  'you are wrong': 'I believe there may be a misunderstanding.',
  'that is wrong': 'I think that may not be correct.',
  'this is wrong': 'I think this may not be correct.',
  'i disagree': 'I see this a little differently.',
  "i don't agree": 'I have a slightly different perspective on this.',
  'this makes no sense': 'I am having trouble following the reasoning here.',
  'you are misunderstanding': 'I think there may be a misunderstanding. Let me clarify.',
  'that is not what i said': 'I believe my earlier point may have been misunderstood.',
  'you are making a mistake': 'I think there may be an issue with this.',
  'this approach is bad': 'I believe there may be a more effective approach.',
  'your logic is wrong': 'I think we should revisit the logic here.',
  'this will not work': 'I have some concerns about whether this will work.',
  'you should do it this way': 'I would suggest considering this alternative approach.',
  'that is your problem': 'I think this may fall outside my area. Could we check who is best placed to handle it?',
  'i already told you': 'As I mentioned earlier, I would like to highlight this again.',
  'you are not listening': 'I think we may have missed an important point in our discussion.',
}

export const CODE_REVIEW_TEMPLATES = {
  'your code is not good': 'I think there are some areas where the code could be improved.',
  'this code is messy': 'Could we improve the code structure for better readability?',
  'why did you write it like this': 'Could you explain the reasoning behind this implementation?',
  'use better variable names': 'Could we use more descriptive variable names here?',
  'this code is repeated': 'Could we consider extracting this repeated logic into a reusable function?',
  'you forgot validation': 'Could you please include the necessary validation?',
  'add error handling': 'Could we add appropriate error handling for this scenario?',
  'change the function name': 'Could we consider using a more descriptive function name?',
  'this needs refactoring': 'I think this section could benefit from some refactoring.',
  'test your code': 'Could you please test these changes before proceeding?',
  'there are too many unnecessary changes': 'Could we limit the changes to the scope of this requirement?',
  'update the comments': 'Could you please update the comments to reflect the current implementation?',
}

export const MEETING_TEMPLATES = {
  "let's discuss this": 'Could we schedule some time to discuss this?',
  "let's talk about this": 'I think it would be helpful to discuss this together.',
  "let's finalize this": 'Could we work towards finalizing this?',
  "let's work together": 'It would be great if we could collaborate on this.',
  'call me': 'Could we arrange a quick call?',
  'join the meeting': 'Could you please join the scheduled meeting?',
  'send meeting details': 'Could you please share the meeting details?',
  'what is the meeting about': 'Could you please share the agenda for the meeting?',
  'i will explain later': 'I can provide further clarification during our discussion.',
  "i can't attend": 'Unfortunately, I will not be able to attend.',
  'share your opinion': 'I would appreciate your thoughts on this.',
  'what do you suggest': 'I would be interested in hearing your recommendations.',
}

export const APPROVAL_TEMPLATES = {
  'approve this': 'Could you please review and approve this?',
  'check and approve': 'Could you please review this and provide your approval?',
  'give me permission': 'Could you please grant the necessary approval?',
  'i need your confirmation': 'I would appreciate your confirmation on this.',
  'please sign off': 'Could you please provide your sign-off?',
}

// Professional tone only: these are neutral, not rude, so Make Polite leaves them as written.

export const WORKPLACE_QUESTION_TEMPLATES = {
  'is this correct': 'Could you please confirm whether this is correct?',
  'which one should i use': 'Could you please advise which option would be more suitable?',
  'what should i do': 'Could you please guide me on the next steps?',
  'i have a doubt': 'I have a question about this. Could you please clarify?',
  'can you explain again': 'Would you mind explaining that once more?',
  'can i proceed': 'Could you please confirm whether I can proceed?',
  'should i continue': 'Could you please advise whether I should proceed?',
  'is this approved': 'Could you please confirm the approval status?',
  'waiting for approval': 'This is currently awaiting approval.',
}

export const DEVELOPMENT_TEMPLATES = {
  'there is a bug': 'I noticed an issue that needs further investigation.',
  'the api is not working': 'The API does not appear to be working as expected.',
  'the backend is not working': 'There appears to be an issue with the backend functionality.',
  'backend is not working': 'There appears to be an issue with the backend functionality.',
  'fix the frontend': 'Could you please investigate and address the frontend issue?',
  'the design is wrong': 'The current design does not appear to match the expected requirements.',
  'the api response is wrong': 'The API response does not seem to match the expected structure.',
  'this feature is broken': 'This feature is not functioning as expected.',
  'the changes are not working': 'The recent changes do not appear to be working as expected.',
  'the ui is messed up': 'There appear to be some UI inconsistencies that need attention.',
  'the data is incorrect': 'The displayed data does not appear to be accurate.',
  'this is not matching the requirement': 'The current implementation does not fully align with the requirements.',
  'deployment is not working': 'There appears to be an issue with the deployment process.',
  'check the console error': 'Could you please investigate the console errors?',
  'check the api integration': 'Could you please review the API integration?',
  'check the pull request': 'Could you please review the pull request?',
  'remove this code': 'Could we consider removing this code?',
  'change this logic': 'Could we revisit and update this logic?',
  'merge the code': 'Could you please proceed with merging the changes?',
  'push your changes': 'Could you please push your latest changes?',
}

export const ACKNOWLEDGEMENT_TEMPLATES = {
  'sorry for the delay': 'Apologies for the delay, and thank you for your patience.',
  'my mistake': 'I apologize for the oversight.',
  'i forgot': 'Apologies, this slipped my attention.',
  "i didn't notice that": 'Thank you for pointing that out. I had overlooked it.',
  'thanks for telling me': 'Thank you for bringing this to my attention.',
  'i will check': 'I will look into this.',
  'i will check and revert': 'I will review this and get back to you.',
  'will check and revert': 'I will review this and get back to you.',
  'i will do it': 'I will take care of this.',
  'i have completed it': 'I have completed this.',
  'done': 'This has been completed.',
  'got it': 'Understood.',
  'no problem': 'Certainly, happy to help.',
}
