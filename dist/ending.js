// Composes the ending from what the player actually did.
//
// Two facts shape the closing sequence (prediction outcome × final choice); the street
// (caught / cut / sheltered) chooses the final shot and the lamp. Every ending is a short
// timeline of cues on the gameplay clock, and every claim on the card is something the player
// sees or hears at the stated moment. The audio is procedural: transmissions are band-limited
// noise bursts with a speech-like rhythm, so the text never claims intelligible words.
//
// | ending            | t (s) | sees                              | hears                         |
// |-------------------|-------|-----------------------------------|-------------------------------|
// | speak, followed   | 0     | sign blazes, rain heavier         | transmission + rising chord   |
// | speak, resisted   | 0     | sign blazes, rain heavier         | a transmission, no chord      |
// |                   | 7     | sign flares again                 | your transmission + chord     |
// | silence, followed | 0–7   | sign dark, rain stops             | rain and hum fade to nothing  |
// | silence, resisted | 0–3   | sign dark, rain stops             | fade to nothing               |
// |                   | 3–4.6 | dark sign flickers red            | a transmission + low tone     |
// |                   | 4.6–  | dark again                        | nothing                       |
//
// The card appears after `duration`, once the last cue has had time to land.

export const LATE = 7; // the resisted speaker's own voice arrives seven seconds late
export const INTRUSION = { from: 3, to: 4.6 };

const TIMELINES = {
  'speak-followed': {
    duration: 4.5,
    cues: [{ at: 0, id: 'broadcast' }],
    captions: [{ at: 0, text: 'You speak. The tower carries it out over 108.9 at once.' }],
    motif:
      'Your voice goes out over 108.9 the moment you speak. The seven seconds are gone: the picture and the room agree.',
  },
  'speak-resisted': {
    duration: LATE + 2.5,
    cues: [
      { at: 0, id: 'early-broadcast' },
      { at: LATE, id: 'late-broadcast' },
    ],
    captions: [
      { at: 0, text: 'Before you can speak, the speakers are already transmitting.' },
      { at: LATE, text: 'Seven seconds later, your own transmission goes out.' },
    ],
    motif:
      'The tower transmitted before you spoke. Your own voice went out seven seconds later, after the city had already heard the other one.',
  },
  'silence-followed': {
    duration: 7,
    cues: [{ at: 0, id: 'dead-air' }],
    captions: [{ at: 0, text: 'Seven seconds of dead air.' }],
    motif:
      'You hold the live microphone and say nothing. Seven seconds of dead air go out over the city.',
  },
  'silence-resisted': {
    duration: 7.5,
    cues: [
      { at: 0, id: 'dead-air' },
      { at: INTRUSION.from, id: 'intrusion' },
    ],
    captions: [
      { at: 0, text: 'You say nothing. The air goes dead.' },
      { at: INTRUSION.from, text: 'The tower transmits anyway: a burst shaped like your voice.' },
    ],
    motif:
      'You said nothing, but the dead air did not hold. Halfway through it, the tower transmitted something shaped like your voice.',
  },
};

export function composeEnding({ choice, outcome, caught, cut }) {
  const speak = choice === 'speak',
    followed = outcome === 'followed',
    timeline = TIMELINES[`${speak ? 'speak' : 'silence'}-${followed ? 'followed' : 'resisted'}`];
  // The final shot returns to the place that remembers the player best.
  const shot = caught || (cut && speak) ? 'street' : 'plaza';
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
    motif: timeline.motif,
    street,
    weather: speak ? 'Outside, the rain falls harder.' : 'Outside, the rain goes silent.',
    shot,
    tower: speak ? 'blazing' : 'dark',
    rain: speak ? 'heavier' : 'silent',
    // Street lamp in the final shot: what the player did to it, answered.
    lamp: caught ? (speak ? 'red' : 'red-to-dark') : cut ? (speak ? 'relight' : 'dark') : 'normal',
    intrusion: !speak && !followed ? INTRUSION : null,
    cues: timeline.cues,
    captions: timeline.captions,
    duration: timeline.duration,
  };
}
