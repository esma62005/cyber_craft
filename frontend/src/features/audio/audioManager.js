import { Howl, Howler } from "howler";

// name: [file under /sounds, base volume]. Files are local, so it works offline.
const FILES = {
  click: ["ui/click", 0.4], transition: ["ui/transition", 0.5],
  dialogue: ["story/dialogue", 0.5], door: ["story/secret-door", 0.7], portal: ["story/portal", 0.6], clue: ["story/clue", 0.6],
  reward: ["rewards/reward", 0.65],
  bossIntro: ["boss/boss-intro", 0.8], bossCharge: ["boss/boss-charge", 0.6], bossHit: ["boss/boss-hit", 0.7],
  bossError: ["boss/boss-error", 0.5], bossVictory: ["boss/boss-victory", 0.85], gameOver: ["boss/game-over", 0.7],
};
const sounds = Object.fromEntries(Object.entries(FILES).map(([k, [f, v]]) => [k, new Howl({ src: [`/sounds/${f}.wav`], volume: v })]));

// Preferences only (not scores): sound on/off and master volume.
const KEY = "cc-audio";
let prefs = { muted: false, volume: 0.65 };
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { /* ignore */ }
Howler.mute(prefs.muted); Howler.volume(prefs.volume);

// Looping ambient music, started on the first click (browsers block audio before interaction).
const music = new Howl({ src: ["/sounds/music/ambient.wav"], loop: true, volume: 0.3 });
let musicOn = false;
export function enableClickSounds() {  // one global listener: every button click gets a click sound
  document.addEventListener("click", (e) => {
    if (!musicOn) { musicOn = true; music.play(); }
    const b = e.target.closest && e.target.closest("button");
    if (b && !b.closest(".snd")) playSound("click");
  });
}

export const getPrefs = () => ({ ...prefs });
export function setPrefs(p) {
  prefs = { ...prefs, ...p }; Howler.mute(prefs.muted); Howler.volume(prefs.volume);
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}
export const playSound = (name) => { sounds[name]?.play(); };  // call from events, after the server confirms
export const stopAllSounds = () => Object.values(sounds).forEach((s) => s.stop());
