// Composes the ending from what the player actually did. Kept deliberately small: one line
// resolves the seven-second motif (prediction × choice), one line answers the street
// (caught / cut / sheltered), and the final shot and environment back up every claim.
//
// Every environmental statement here is rendered: the tower sign blazes or goes dark, the
// rain audibly and visibly intensifies or falls silent, and the street lamp (shown when the
// street is the final shot) stays red, goes dark, or relights.

export const SPEAK_DURATION = 4.5,
  SILENCE_DURATION = 7; // seven seconds of dead air before the card

export function composeEnding({ choice, outcome, caught, cut }) {
  const speak = choice === 'speak',
    followed = outcome === 'followed';
  // The final shot returns to the place that remembers the player best.
  const shot = caught || (cut && speak) ? 'street' : 'plaza';
  const motif = speak
    ? followed
      ? 'Your voice goes out over 108.9 at the same moment your lips move. The seven seconds are gone: the picture and the room are one.'
      : 'Your voice reaches the speakers seven seconds late. The other you had already said it, and the city heard them first.'
    : followed
      ? 'You hold the live microphone and say nothing. Seven seconds of silence go out over the city.'
      : 'You say nothing. On the monitor, the other you leans in and fills the silence with your voice.';
  const street = caught
    ? speak
      ? 'On the side street, the red lamp that caught you burns brighter, listening.'
      : 'On the side street, the red lamp that caught you finally goes dark.'
    : cut
      ? speak
        ? 'On the side street, the lamp you put out comes back on to carry your voice.'
        : 'Over the plaza, the tower’s sign goes dark, the way the street lamp did when you cut the feed.'
      : speak
        ? 'Over the plaza, the tower’s sign burns. Under every awning, someone waits you out.'
        : 'Over the plaza, the tower’s sign goes dark.';
  return {
    choice,
    title: speak ? 'You are on air.' : 'Dead air.',
    motif,
    street,
    weather: speak ? 'Outside, the rain falls harder.' : 'Outside, the rain goes silent.',
    caption: speak ? 'Your voice goes out over 108.9.' : 'Seven seconds of dead air.',
    shot,
    tower: speak ? 'blazing' : 'dark',
    rain: speak ? 'heavier' : 'silent',
    // Street lamp in the final shot: what the player did to it, answered.
    lamp: caught ? (speak ? 'red' : 'red-to-dark') : cut ? (speak ? 'relight' : 'dark') : 'normal',
    echo: speak && !followed, // the broadcast plays twice, seven seconds apart in spirit
    duration: speak ? SPEAK_DURATION : SILENCE_DURATION,
  };
}
