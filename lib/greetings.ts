// The dashboard's line under "Clients": "{First name}, {greeting}". Each
// greeting is written to follow a name and a comma, so it starts lower
// case. A different one is picked for every sign-in (see pickGreeting).
export const GREETINGS = [
  "are you ready to slay the day?",
  "let's make something worth approving.",
  "good work is waiting. Let's get to it.",
  "today's a good day to clear the review queue.",
  "fresh day, fresh ideas.",
  "let's turn feedback into finished work.",
  "time to make the brief proud.",
  "great work starts with a first draft.",
  "let's ship something brilliant today.",
  "the calendar is waiting for your magic.",
  "one approval at a time.",
  "big ideas, tight deadlines. You've got this.",
  "let's make today's posts the best ones yet.",
  "coffee in hand? Let's make it count.",
  "every great campaign starts with a single post.",
  "let's keep the momentum going.",
  "ready to turn concepts into content?",
  "here's to fewer revisions and faster approvals.",
  "let's make the feed look good today.",
  "the best idea of the week could be today's.",
];

// Stable for one sign-in (the seed is the session's sign-in time, so a
// reload keeps the same line) and different for the next.
export function pickGreeting(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return GREETINGS[Math.abs(h) % GREETINGS.length];
}

// "Raj, " + text — or the text alone, capitalised, when there's no name.
export function addressed(firstName: string | null | undefined, text: string): string {
  return firstName ? `${firstName}, ${text}` : text.charAt(0).toUpperCase() + text.slice(1);
}
