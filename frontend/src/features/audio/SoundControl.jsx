import { useState } from "react";
import { getPrefs, setPrefs } from "./audioManager.js";

export default function SoundControl() {
  const [p, setP] = useState(getPrefs());
  const upd = (x) => { setPrefs(x); setP(getPrefs()); };
  return (
    <div className="snd">
      <button aria-label={p.muted ? "Sound off" : "Sound on"} onClick={() => upd({ muted: !p.muted })}>{p.muted ? "🔇" : "🔊"}</button>
      <input type="range" aria-label="Volume" min="0" max="1" step="0.05" value={p.volume}
        onChange={(e) => upd({ volume: +e.target.value })} />
    </div>
  );
}
