import { useEffect, useState } from "react";
import * as api from "./api.js";
import { playSound } from "./features/audio/audioManager.js";
const bg = (n) => ({ backgroundImage: `url(/img/${n}.jpg)` });
const IMG = { "hidden-vault": "room1", "redstone-archive": "room2", "forgotten-server": "room3" };
const useErr = () => { const [e, setE] = useState(""); return [e, (fn) => async (...a) => { setE(""); try { return await fn(...a); } catch (x) { setE(x.message); if (/game over/i.test(x.message)) window.dispatchEvent(new Event("cc-over")); } }, setE]; };

export function Rooms({ refresh }) {
  const [d, setD] = useState({ rooms: [], lives: 2, max: 2 }), [room, setRoom] = useState(null), [pick, setPick] = useState(null), [res, setRes] = useState(null);
  const [err, guard] = useErr();
  const load = guard(async () => setD(await api.getRooms()));
  useEffect(() => { load(); }, []);
  const open = guard(async (id) => { setRes(null); setPick(null); setRoom(await api.getRoom(id)); playSound("door"); setTimeout(() => playSound("portal"), 400); });
  const solve = guard(async () => {
    const r = await api.solveRoom(room.id, pick); setRes(r); setPick(null);
    if (r.correct) { playSound("reward"); load(); refresh(); return; }
    setD((x) => ({ ...x, lives: r.lives })); playSound(r.game_over ? "gameOver" : "bossError");
    if (r.game_over) setTimeout(() => window.dispatchEvent(new Event("cc-over")), 1800);
  });
  const hearts = <span className="hearts" aria-label={`${d.lives} lives left`}>{"❤️".repeat(d.lives)}{"🖤".repeat(d.max - d.lives)}</span>;
  return (<div className="adv">{err && <p className="err" role="alert">{err}</p>}
    <div className="banner" style={bg("secret")}><h2 className="px">Secret Rooms</h2><p>Solve each room to unlock the next one. You only have 2 mistakes in total. Lives: {hearts}</p></div>
    {!room && <div className="cards">{d.rooms.map((r) => (
      <div key={r.id} className={"mc " + r.status}><div className="thumb" style={bg(IMG[r.id])} /><b className="px">{r.title}</b>
        {r.status === "locked" ? <span className="pill">🔒 {r.mission_done ? `Solve “${r.after}” first` : `Finish “${r.needs}” first`}</span>
          : <button className="pill" onClick={() => open(r.id)}>{r.status === "completed" ? "✔ " + r.reward : "Enter room"}</button>}</div>))}</div>}
    {room && <div className="q one"><div className="art tall" style={bg(IMG[room.id])} /><div>
      <button className="back" onClick={() => setRoom(null)}>← All rooms</button><h3 className="px">{room.title}</h3><p>{room.question}</p>
      {Object.entries(room.options).map(([k, v]) => <button key={k} className={"opt" + (pick === k ? " sel" : "")} onClick={() => { setPick(k); }}><span>{k.toUpperCase()}</span>{v}</button>)}
      {!room.completed && !res?.correct && <button className="btn sm" disabled={!pick} onClick={solve}>Submit</button>}
      {res && !res.correct && <p className="fb bad">{res.game_over ? "💀 GAME OVER. No lives left." : `💥 Wrong! Lives left: ${res.lives}. 💡 Hint: ${res.hint}`}</p>}
      {res?.correct && <><p className="fb ok">🗝️ {res.reward.item} unlocked! +{res.reward.xp} XP</p>
        {res.next_room ? <button className="btn sm" onClick={() => { playSound("transition"); open(res.next_room); }}>Next room ▶</button> : <button className="btn ghost sm" onClick={() => setRoom(null)}>Back to rooms</button>}</>}
      {room.completed && !res && <p className="fb ok">Already solved. Reward collected.</p>}</div></div>}</div>);
}

export function Story({ refresh, onBoss }) {
  const [d, setD] = useState(null), [clue, setClue] = useState(null), [codex, setCodex] = useState(null);
  const [err, guard] = useErr();
  const load = guard(async () => { setD(await api.getStory()); setCodex(await api.getCodex()); });
  useEffect(() => { load(); }, []);
  const choose = guard(async (c, ch) => { const r = await api.chooseStory(c.id, ch); setClue(r); playSound(r.good ? "reward" : "bossError"); await load(); refresh(); });
  if (!d) return <p>{err || "Loading…"}</p>;
  const cur = d.chapters.find((c) => c.status === "available");
  return (<div className="adv">{err && <p className="err" role="alert">{err}</p>}
    <div className="banner" style={bg("story")}><h2 className="px">Story Mode</h2><p>Every clue explains why the digital world broke.</p></div>
    <ol className="chapters">{d.chapters.map((c) => <li key={c.id} className={c.status}>{c.status === "completed" ? "✔" : c.status === "locked" ? "🔒" : "▶"} {c.title}</li>)}
      <li className={d.boss_defeated ? "completed" : d.boss_ready ? "available" : "locked"}>{d.boss_defeated ? "✔" : d.boss_ready ? "▶" : "🔒"} The Malware Core</li></ol>
    {clue && <div className={"fb " + (clue.good ? "ok" : "bad")} role="status"><b>{clue.good ? "✔ Correct choice!" : "✘ Wrong choice, but the story goes on."}{clue.bonus_xp ? ` +${clue.bonus_xp} XP` : ""}</b>
      {!clue.good && <p>Best answer: {clue.correct_choice}</p>}<p>📜 Clue: {clue.clue}</p><p>💡 {clue.lesson}</p></div>}
    {cur && <div className="dialog"><b className="px">{cur.who}</b><p>{cur.text}</p>
      {cur.choices.map((c) => <button key={c.id} className="opt" onClick={() => choose(cur, c.id)}>{c.label}</button>)}</div>}
    {!cur && !d.boss_ready && <p className="fb bad">Next chapter is locked. Solve a Secret Room to continue.</p>}
    {d.boss_ready && !d.boss_defeated && <button className="btn alt" onClick={() => { playSound("transition"); onBoss(); }}>⚔ Enter the Malware Core</button>}
    {d.boss_defeated && <p className="fb ok">🏆 The Malware Core has fallen. You are a Cyber Guardian.</p>}
    {codex && <div className="tips"><h3>Codex</h3><ul>{codex.items.map((i) => <li key={i}>🗝️ {i}</li>)}{codex.clues.map((c) => <li key={c}>{c}</li>)}</ul>{!codex.items.length && !codex.clues.length && <small>No evidence yet.</small>}</div>}</div>);
}

export function Boss({ refresh, onExit }) {
  const [enc, setEnc] = useState(null), [q, setQ] = useState(null), [fb, setFb] = useState(null), [vis, setVis] = useState("idle"), [pick, setPick] = useState(null), [won, setWon] = useState(null);
  const [err, guard] = useErr();
  const loadQ = guard(async (delay = 0) => { setQ(await api.bossQuestion()); setFb(null); setPick(null); setVis("charging"); setTimeout(() => playSound("bossCharge"), delay); });
  const init = guard(async () => { const e = await api.bossStart(); setEnc(e); if (e.state === "defeat") setVis("defeat"); });
  useEffect(() => { init(); }, []);
  const begin = () => { playSound("bossIntro"); loadQ(900); };
  const send = guard(async () => {
    const r = await api.bossAnswer(enc.encounter_id, q.question_id, pick);
    setEnc(r); setFb(r); setPick(null); setVis(r.boss_state);
    if (r.correct) playSound(r.boss_state === "defeated" ? "bossVictory" : "bossHit"); else playSound(r.boss_state === "defeat" ? "gameOver" : "bossError");
    if (r.boss_state === "defeated") { setWon(await api.bossResult()); refresh(); }
  });
  const shield = enc?.shield_percent ?? 100, lives = enc?.lives ?? 2, lost = enc?.state === "defeat" || vis === "defeat";
  return (<div className="arena">{err && <p className="err" role="alert">{err}</p>}
    <button className="back" onClick={onExit}>← Leave the arena</button>
    <div className={"core " + vis} style={bg("boss")} role="img" aria-label="The Malware Core">
      {vis === "charging" && <span className="warn px">INCOMING THREAT!</span>}{vis === "attack" && <span className="warn px">SHIELD HIT!</span>}</div>
    <h2 className="px">THE MALWARE CORE</h2>
    <div className="meter shield"><i style={{ width: shield + "%" }} /></div><small>Boss Shield · {shield}% · Lives: <span className="hearts">{"❤️".repeat(lives)}{"🖤".repeat(2 - lives)}</span></small>
    {won ? <div className="res"><div><h2 className="px">🏆 Victory!</h2><p>The Core shatters into light cubes.</p>
      <p>Rank: <b className="gold">{won.rank}</b> · {won.total_xp} XP</p><p>Achievement unlocked: <b>{won.achievement}</b></p>
      <button className="btn" onClick={onExit}>Back to story</button></div></div>
    : lost ? <div className="res"><div><h2 className="px">💀 Defeat</h2><p>The Core overpowered your shield. Both lives are gone and the battle is over.</p><button className="btn" onClick={onExit}>Back to story</button></div></div>
    : !q ? <button className="btn" onClick={begin}>START BATTLE ▶</button>
    : <div className="q one"><div><b className="gold">Round {Math.min(enc.round + 1, enc.total_rounds)} / {enc.total_rounds} · {q.round_title}</b><p>{q.question}</p>
      {Object.entries(q.options).map(([k, v]) => <button key={k} className={"opt" + (pick === k ? " sel" : "")} disabled={fb?.correct} onClick={() => { setPick(k); }}><span>{k.toUpperCase()}</span>{v}</button>)}
      {(!fb || !fb.correct) && <button className="btn sm" disabled={!pick} onClick={send}>Attack</button>}
      {fb && !fb.correct && <p className="fb bad">💥 The Core strikes your shield! Lives left: {fb.lives}. Hint: {fb.hint}</p>}
      {fb?.correct && <><p className="fb ok">✔ Shield cracked! +{fb.xp_earned} XP. {fb.explanation}</p><button className="btn sm" onClick={() => loadQ(0)}>Next round ▶</button></>}</div></div>}
  </div>);
}
