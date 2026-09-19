export function touchFeedback(session) {
  if (session.problem.id !== 'science.animals.sort-feathers') return session.tutorResponse.messageText;
  const latest = session.events.at(-1);
  if (latest?.type === 'hint_requested') return session.tutorResponse.messageText;
  if (latest?.type === 'answer_checked') {
    return session.evaluation?.isCorrect
      ? 'Yes! You sorted by feathers. What do the animals in each group have in common?'
      : 'Take another look at each animal. Which ones have feathers?';
  }
  return 'Look closely at what covers each animal.';
}
