import { useState, useEffect, useRef } from "react";
import { playSound } from "./features/audio/audioManager.js";
import SoundControl from "./features/audio/SoundControl.jsx";
import * as api from "./api.js";
import { Rooms, Story, Boss } from "./Adventure.jsx";

const T = {
  en: { h: "YOUR DIGITAL WORLD NEEDS A DEFENDER", tag: "Play · Learn · Be Cyber Safe", start: "START YOUR QUEST", how: "HOW TO PLAY",
    howTxt: "Complete 3 missions, earn XP and reach Cyber Guardian.", name: "Choose Your Name", nameSub: "Enter a nickname to start your quest", go: "ENTER THE WORLD",
    home: "Home", missions: "Missions", inv: "Inventory", lb: "Leaderboard", quest: "Your Quest", questTxt: "Complete the cybersecurity challenges and earn XP to become a Cyber Guardian!",
    avail: "Available", locked: "Locked", done: "Completed", missed: "Missed", back: "Back to Map", submit: "Submit", next: "Next Mission", finish: "See Results",
    tips: "Tips", shift: "Shift value:", ans: "Your answer:", decrypt: "Type the decrypted message", flags: "Spot the red flags:", correct: "Correct!", wrong: "Not quite!",
    earned: "You earned", cong: "Congratulations!", all: "You completed all the missions!", rank: "Your Rank", txp: "Total XP", mc: "Missions Completed", dia: "Diamonds Collected",
    perf: "Your Performance", viewLb: "View Leaderboard", again: "Play Again", top: "Top Players", player: "Player", mission: "Mission" },
  fr: { h: "TON MONDE NUMÉRIQUE A BESOIN D'UN DÉFENSEUR", tag: "Joue · Apprends · Sois Cyber-Safe", start: "COMMENCE TA QUÊTE", how: "COMMENT JOUER",
    howTxt: "Termine 3 missions, gagne de l'XP et deviens Cyber Guardian.", name: "Choisis ton pseudo", nameSub: "Entre un pseudo pour commencer", go: "ENTRER DANS LE MONDE",
    home: "Accueil", missions: "Missions", inv: "Inventaire", lb: "Classement", quest: "Ta quête", questTxt: "Relève les défis de cybersécurité et gagne de l'XP pour devenir Cyber Guardian !",
    avail: "Disponible", locked: "Verrouillée", done: "Terminée", missed: "Ratée", back: "Retour à la carte", submit: "Valider", next: "Mission suivante", finish: "Voir les résultats",
    tips: "Conseils", shift: "Décalage :", ans: "Ta réponse :", decrypt: "Tape le message déchiffré", flags: "Repère les signaux d'alerte :", correct: "Correct !", wrong: "Pas tout à fait !",
    earned: "Tu as gagné", cong: "Félicitations !", all: "Tu as terminé toutes les missions !", rank: "Ton rang", txp: "XP total", mc: "Missions terminées", dia: "Diamants collectés",
    perf: "Tes performances", viewLb: "Voir le classement", again: "Rejouer", top: "Meilleurs joueurs", player: "Joueur", mission: "Mission" },
};
const ICON = { "password-mine": "💎", "creeper-alert": "👾", "redstone-cipher": "🔴" };
const TIPS = { "password-mine": ["Use at least 12 characters.", "Combine letters, numbers and symbols.", "Avoid common words and patterns."],
  "creeper-alert": ["Check the sender's address.", "Be wary of urgency.", "Hover links before you click."],
  "redstone-cipher": ["A computer virus is a harmful program.", "Do not download files from unknown sources.", "Keep your system and apps updated."] };
const ART = { "password-mine": "ore", "creeper-alert": "portal", "redstone-cipher": "redstone" };
const art = (n) => ({ backgroundImage: `url(/img/${n}.jpg)` });
const SLOTS = ["💎", "⛏️", "🗡️", "🛡️", "📖"];

export default function App() {
  const [lang, setLang] = useState("en"), [screen, setScreen] = useState("welcome"), [nick, setNick] = useState("");
  const [err, setErr] = useState(""), [sid, setSid] = useState(null), [missions, setMissions] = useState([]);
  const [st, setSt] = useState(null), [fb, setFb] = useState(null), [pick, setPick] = useState(null);
  const [pid, setPid] = useState(null), [board, setBoard] = useState([]);
  useEffect(() => { const h = () => setScreen("over"); window.addEventListener("cc-over", h); return () => window.removeEventListener("cc-over", h); }, []);
  const prev = useRef("welcome");
  useEffect(() => {  // one sound per screen change
    const p = prev.current; prev.current = screen;
    if (screen === "welcome" || screen === p || screen === "result" || screen === "over") return;
    playSound(screen === "end" ? "bossVictory" : p === "setup" && screen === "home" ? "portal" : screen === "story" ? "dialogue" : "transition");
  }, [screen]);
  const t = T[lang];
  const guard = (fn) => async (...a) => { setErr(""); try { await fn(...a); } catch (e) { setErr(e.message); } };

  const begin = guard(async () => {
    let id = pid; if (!id) { id = (await api.createPlayer(nick.trim())).player_id; setPid(id); }  // reuse the same player on Play Again
    const s = await api.startSession(id);
    setSid(s.session_id); api.setToken(s.token); setMissions(await api.getMissions()); setSt(await api.getSession(s.session_id)); setFb(null); setScreen("home");
  });
  const restart = () => { setFb(null); setPick(null); begin(); };  // new session, same nickname
  const answer = guard(async (mid, value) => { const r = await api.submitAnswer(sid, mid, value); playSound(r.correct ? "reward" : "bossError"); setFb(r); setSt(await api.getSession(sid)); setScreen("result"); });
  const next = () => { setFb(null); setPick(null); setScreen(fb.finished ? "end" : "play"); };
  const openBoard = guard(async () => { setBoard(await api.getLeaderboard()); setScreen("board"); });

  const idx = st ? st.completed.length : 0, cur = missions[idx];
  const missed = st ? st.completed.length - st.correct.length : 0, hearts = Math.max(1, 6 - missed * 2);
  const maxXp = st && st.total_xp >= 200 ? 300 : 200, pct = st ? Math.min(100, (st.total_xp / maxXp) * 100) : 0;
  const status = (m, i) => st.completed.includes(m.id) ? (st.correct.includes(m.id) ? "completed" : "missed") : i === idx ? "available" : "locked";
  const Logo = ({ sub }) => <div className="logo"><i>⛏</i><div><span>Cyber<b>Craft</b></span>{sub && <small>Cybersecurity Club</small>}</div></div>;
  const Lang = () => <div className="lang">{["en", "fr"].map((l) => <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l}>{l.toUpperCase()}</button>)}</div>;
  const Hud = () => (
    <div className="hud"><span className="hearts" aria-label={hearts + " hearts"}>{"♥".repeat(hearts)}</span>
      <div className="meter"><i style={{ width: pct + "%" }} /></div><small className="gold">XP {st.total_xp} / {maxXp}</small>
      <div className="slots">{SLOTS.map((s, i) => <div key={i} className={"slot" + (i <= st.correct.length ? " have" : "")}>{i <= st.correct.length ? s : ""}</div>)}</div></div>);

  const Shell = ({ on, children }) => (
    <div className="shell">
      <header className="bar"><Logo /><div className="gems"><SoundControl /><Lang />💎 {st?.diamonds ?? 0}</div></header>
      <nav className="side">{[["home", "🏠", t.home], ["missions", "📜", t.missions], ["story", "📖", "Story"], ["rooms", "🗝️", "Secret Rooms"], ["inv", "🎒", t.inv]].map(([k, i, l]) =>
        <button key={k} className={on === k ? "on" : ""} onClick={() => setScreen(k)}>{i} {l}</button>)}
        <button className={on === "board" ? "on" : ""} onClick={openBoard}>🏆 {t.lb}</button></nav>
      <section className="main">{children}</section>
    </div>);

  const Cards = () => <div className="cards">{missions.map((m, i) => { const s = status(m, i); return (
    <div key={m.id} className={"mc " + s}><div className="thumb" style={art(ART[m.id])} /><b className="px">{m.title}</b>
      {s === "available" ? <button className="pill" onClick={() => { setPick(null); setScreen("play"); }}>{t.avail}</button>
        : <span className="pill">{s === "locked" ? "🔒 " + t.locked : s === "completed" ? "✔ " + t.done : t.missed}</span>}
      <span className="gold">+100 XP</span></div>); })}</div>;

  const Who = () => <div className="who"><div className="av">🧑</div><div><b>{nick}</b><div className="gold">{st.rank}</div></div>
    <div className="xp"><div><span>XP</span><span>{st.total_xp} / {maxXp}</span></div><div className="meter"><i style={{ width: pct + "%" }} /></div></div></div>;

  if (screen === "welcome") return (
    <div className="scene bg-hero"><div className="top"><Logo sub /><Lang /></div>
      <div className="hero"><h1 className="px">{t.h}</h1><p>{t.tag}</p>
        <button className="btn" onClick={() => setScreen("setup")}>{t.start} ▶</button>
        <button className="btn ghost" onClick={() => alert(t.howTxt)}>{t.how}</button></div></div>);

  if (screen === "setup") return (
    <div className="scene bg-portal">{err && <p className="err" role="alert">{err}</p>}<div className="top"><Logo /><Lang /></div>
      <div className="stage"><div className="card"><h2 className="px">{t.name}</h2><p>{t.nameSub}</p>
        <label className="field">👤<input value={nick} maxLength={20} placeholder="Player01" aria-label={t.name} onChange={(e) => setNick(e.target.value)} /></label>
        <button className="btn" disabled={nick.trim().length < 2} onClick={begin}>{t.go} ▶</button></div></div></div>);

  if (!st) return null;

  if (screen === "end") return (
    <div className="scene bg-castle"><div className="top"><Logo /><Lang /></div>
      <div className="stage"><div className="fin"><img className="trophy" src="/img/trophy.jpg" alt="" /><h1 className="px">{t.cong}</h1><p>{t.all}</p>
        <div className="stats"><div className="stat">{t.rank}<div className="px gold">🛡️ {st.rank}</div></div>
          <div className="stat">{t.txp}: <b>{st.total_xp}</b><br />{t.mc}: <b>{st.correct.length}/{missions.length}</b><br />{t.dia}: <b>{st.diamonds}</b></div></div>
        <div className="perf"><b>{t.perf}</b>{missions.map((m) => <div key={m.id}><span>{m.title}</span><span>{st.correct.includes(m.id) ? "✔" : "✘"}</span></div>)}</div>
        <div className="stats"><button className="btn alt" onClick={openBoard}>{t.viewLb}</button>
          <button className="btn" onClick={() => { setScreen("welcome"); setNick(""); setSt(null); setPid(null); }}>{t.again}</button></div></div></div></div>);

  if (screen === "play" && cur) {
    return (
      <div><header className="bar"><Logo /><Lang /></header>
        <div className="play">{err && <p className="err" role="alert">{err}</p>}
          <button className="back" onClick={() => setScreen("home")}>← {t.back}</button>
          <div className="mh"><div style={{ display: "flex", gap: 12, alignItems: "center" }}><span style={{ fontSize: 28 }}>{ICON[cur.id]}</span>
            <div><h2 className="px">{cur.title}</h2><small>{t.mission} {idx + 1} / {missions.length}</small></div></div>
            <span>Difficulty <span className={"badge " + cur.difficulty}>{cur.difficulty}</span></span></div>
          <div className="pg"><div className="q">
            <div className="art" style={art(ART[cur.id])} />
            <div><p>{cur.brief}</p>
              {cur.id === "creeper-alert" && <div className="mail"><div>From: support@minecraft-prize.com</div><div>Subject: You won a free gift!</div><p>Click here to claim it now: <u>http://bit.ly/mc-gift</u></p><p>Hurry! This offer expires in 24 hours.</p></div>}
              {cur.id === "creeper-alert" && <b>{t.flags}</b>}
              {Object.entries(cur.options).map(([k, v]) => <button key={k} className={"opt" + (pick === k ? " sel" : "")} aria-pressed={pick === k} onClick={() => setPick(k)}>
                <span>{cur.id === "creeper-alert" ? (pick === k ? "☑" : "☐") : k.toUpperCase()}</span>{v}</button>)}
              <button className="btn sm" disabled={!pick} onClick={() => answer(cur.id, pick)}>{t.submit}</button></div></div>
            <aside className="tips"><h3>{t.tips}</h3><ul>{TIPS[cur.id].map((x) => <li key={x}>{x}</li>)}</ul></aside></div>
          <Hud /></div></div>);
  }

  if (screen === "result" && fb) return (
    <div><header className="bar"><Logo /><Lang /></header>
      <div className="play"><div className={"res" + (fb.correct ? "" : " bad")} role="status"><div>
        <h2 className="px">{fb.correct ? "✔ " + t.correct : "✘ " + t.wrong}</h2><p>{t.earned} {fb.xp_earned} XP</p>
        <div className="ex"><b>Explanation:</b>{fb.explanation}</div>
        <button className="btn" onClick={next}>{fb.finished ? t.finish : t.next} ▶</button></div><div className="art tall" style={art(ART[missions[Math.max(0, idx - 1)]?.id] || "ore")} /></div><Hud /></div></div>);

  if (screen === "board") return (
    <Shell on="board"><div className="lbhead"><img className="trophy" src="/img/trophy.jpg" alt="" /><h2 className="px">{t.lb}</h2></div><p>{t.top}</p>
      <table><thead><tr><th>#</th><th>{t.player}</th><th>Rank</th><th>XP</th></tr></thead><tbody>
        {board.map((r, i) => <tr key={i} className={r.name === nick.trim() && r.xp === st.total_xp ? "me" : ""}><td>{i + 1}</td><td>🧑 {r.name}</td><td>{r.rank}</td><td>{r.xp}</td></tr>)}</tbody></table>
      {st.status === "completed" && <button className="btn alt" onClick={() => setScreen("end")}>{t.back}</button>}</Shell>);

  const refresh = async () => setSt(await api.getSession(sid));
  if (screen === "over") return <div className="scene bg-portal"><div className="res"><div><h2 className="px">💀 GAME OVER</h2><p>You used both lives in the Secret Rooms.</p>{err && <p className="err" role="alert">{err}</p>}<button className="btn" onClick={restart}>{t.again} ▶</button><button className="btn ghost" onClick={() => { setScreen("welcome"); setNick(""); setSt(null); setPid(null); }}>Main menu</button></div></div></div>;
  if (screen === "story") return Shell({ on: "story", children: <Story refresh={refresh} onBoss={() => setScreen("boss")} /> });
  if (screen === "rooms") return Shell({ on: "rooms", children: <Rooms refresh={refresh} /> });
  if (screen === "boss") return <div><header className="bar"><Logo /><div className="gems"><SoundControl /><Lang /></div></header><Boss refresh={refresh} onExit={() => setScreen("story")} /></div>;
  if (screen === "inv") return (
    <Shell on="inv"><h2 className="px">🎒 {t.inv}</h2><Who />
      <div className="slots" style={{ margin: 0 }}>{SLOTS.map((s, i) => <div key={i} className={"slot" + (i <= st.correct.length ? " have" : "")}>{i <= st.correct.length ? s : ""}</div>)}</div>
      <p>💎 {st.diamonds}</p></Shell>);

  return (
    <Shell on={screen === "missions" ? "missions" : "home"}><Who />
      {screen === "home" && <div className="quest"><h3 className="px">{t.quest}</h3><p>{t.questTxt}</p></div>}
      <Cards />{st.status === "completed" && <button className="btn alt" onClick={() => setScreen("end")}>{t.cong}</button>}</Shell>);
}
