"""CyberCraft Game API — FastAPI + SQLite. Scoring and answers live ONLY here."""
import secrets
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import (create_engine, Column, Integer, String, Boolean,
                        DateTime, ForeignKey, UniqueConstraint, func)
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.exc import IntegrityError

engine = create_engine("sqlite:///cybercraft_v2.db", connect_args={"check_same_thread": False})
Session = sessionmaker(bind=engine)
Base = declarative_base()
now = lambda: datetime.now(timezone.utc)

class Player(Base):
    __tablename__ = "players"
    id = Column(Integer, primary_key=True)
    display_name = Column(String(20), nullable=False)
    created_at = Column(DateTime, default=now)

class GameSession(Base):
    __tablename__ = "game_sessions"
    id = Column(Integer, primary_key=True)
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    status = Column(String(12), default="active")
    total_xp = Column(Integer, default=0)
    room_mistakes = Column(Integer, default=0)
    token = Column(String(64), default=lambda: secrets.token_urlsafe(24), index=True)
    started_at = Column(DateTime, default=now)
    completed_at = Column(DateTime)

class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (UniqueConstraint("session_id", "mission_id"),)  # one answer per mission
    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=False)
    mission_id = Column(String(30), nullable=False)
    is_correct = Column(Boolean, nullable=False)
    xp_earned = Column(Integer, default=0)
    submitted_at = Column(DateTime, default=now)

def _tbl(name, *cols, uniq=None):
    return type(name, (Base,), {"__tablename__": name, "__table_args__": (UniqueConstraint(*uniq),) if uniq else (),
        "id": Column(Integer, primary_key=True), "session_id": Column(Integer, ForeignKey("game_sessions.id"), nullable=False), **dict(cols)})
RoomProgress = _tbl("room_progress", ("room_id", Column(String(30))), uniq=("session_id", "room_id"))
StoryProgress = _tbl("story_progress", ("chapter_id", Column(String(30))), ("choice_id", Column(String(30))), uniq=("session_id", "chapter_id"))
Achievement = _tbl("player_achievements", ("achievement_id", Column(String(30))), uniq=("session_id", "achievement_id"))
class BossEncounter(Base):
    __tablename__ = "boss_encounters"
    id = Column(Integer, primary_key=True); session_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=False)
    state = Column(String(12), default="charging"); current_round = Column(Integer, default=0); mistakes = Column(Integer, default=0)
    started_at = Column(DateTime, default=now); completed_at = Column(DateTime)
class BossAnswer(Base):
    __tablename__ = "boss_answers"
    id = Column(Integer, primary_key=True); encounter_id = Column(Integer, ForeignKey("boss_encounters.id"), nullable=False)
    question_id = Column(String(20)); is_correct = Column(Boolean); xp_earned = Column(Integer, default=0)
Base.metadata.create_all(engine)
from sqlalchemy import text  # tiny auto-migration so old cybercraft.db files keep working
with engine.begin() as _c:
    for _t, _col in (("game_sessions", "room_mistakes"), ("boss_encounters", "mistakes")):
        if _col not in [r[1] for r in _c.execute(text(f"PRAGMA table_info({_t})"))]:
            _c.execute(text(f"ALTER TABLE {_t} ADD COLUMN {_col} INTEGER DEFAULT 0"))
try:  # case-insensitive unique names (skipped silently if an old test DB already has duplicates)
    with engine.begin() as _c: _c.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_players_name ON players(lower(display_name))"))
except Exception: pass
MAX_LIVES = 2  # wrong answers allowed: Secret Rooms (game over) and Boss Battle (defeat)

# ---- Missions (answers stay server-side) ----
MISSIONS = [
    {"id": "password-mine", "title": "Password Mine", "difficulty": "Easy", "type": "choice",
     "brief": "Choose the strongest password. Which of these is the most secure?",
     "options": {"a": "123456", "b": "Password123", "c": "G7!k9#pQ2", "d": "qwerty"},
     "answer": "c",
     "explain": "This password is strong because it mixes letters, numbers and symbols and is not a common word."},
    {"id": "creeper-alert", "title": "Creeper Alert", "difficulty": "Medium", "type": "choice",
     "brief": "From: support@paypa1-secure.com — 'URGENT: account locked in 1 hour! Verify at http://paypal.account-check.xyz'. What is the main red flag?",
     "options": {"a": "The email has a subject line", "b": "Urgency plus a link that doesn't match the claimed company",
                 "c": "It was sent on a weekday", "d": "It is written in English"},
     "answer": "b",
     "explain": "Fake urgency and look-alike domains are classic phishing signs. Never click; open the official site yourself."},
    {"id": "redstone-cipher", "title": "Redstone Challenge", "difficulty": "Easy", "type": "choice",
     "brief": "Q5. What is a computer virus?",
     "options": {"a": "A computer game", "b": "A type of screen", "c": "A harmful program", "d": "A keyboard"},
     "answer": "c",
     "explain": "A computer virus is a harmful program that can affect files or the way a computer works."},
]
M = {m["id"]: m for m in MISSIONS}
ORDER = [m["id"] for m in MISSIONS]
XP_CORRECT, XP_BONUS = 100, 50

def rank(xp):
    return "Cyber Guardian" if xp >= 300 else "Defender" if xp >= 200 else "Scout" if xp >= 100 else "Noob"

def public(m):
    return {k: v for k, v in m.items() if k not in ("answer", "explain")}

# ---- API ----
app = FastAPI(title="CyberCraft API")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])

class PlayerIn(BaseModel):
    display_name: str = Field(min_length=2, max_length=20, pattern=r"^[\w .-]+$")

class SubmitIn(BaseModel):
    mission_id: str = Field(max_length=30)
    answer: str = Field(max_length=120)

@app.get("/health")
def health(): return {"status": "ok"}

@app.post("/api/v1/players")
def create_player(p: PlayerIn):
    with Session() as db:
        name = p.display_name.strip(); taken = HTTPException(409, "This name is already taken. Choose another one.")
        if db.query(Player).filter(func.lower(Player.display_name) == name.lower()).first(): raise taken
        pl = Player(display_name=name); db.add(pl)
        try: db.commit()
        except IntegrityError: db.rollback(); raise taken
        return {"player_id": pl.id, "display_name": pl.display_name}

@app.post("/api/v1/sessions")
def start_session(player_id: int):
    with Session() as db:
        if not db.get(Player, player_id): raise HTTPException(404, "Player not found.")
        s = GameSession(player_id=player_id); db.add(s); db.commit()
        return {"session_id": s.id, "token": s.token}

@app.get("/api/v1/missions")
def missions(): return [public(m) for m in MISSIONS]

@app.get("/api/v1/missions/{mid}")
def mission(mid: str):
    if mid not in M: raise HTTPException(404, "Mission not found.")
    return public(M[mid])

def state(db, s):
    subs = db.query(Submission).filter_by(session_id=s.id).all()
    return {"session_id": s.id, "status": s.status, "total_xp": s.total_xp, "rank": rank(s.total_xp),
            "completed": [x.mission_id for x in subs],
            "diamonds": sum(x.is_correct for x in subs) + (2 if s.status == "completed" and all(x.is_correct for x in subs) else 0),
            "correct": [x.mission_id for x in subs if x.is_correct]}

@app.get("/api/v1/sessions/{sid}")
def session_state(sid: int):
    with Session() as db:
        s = db.get(GameSession, sid)
        if not s: raise HTTPException(404, "Session not found.")
        return state(db, s)

@app.post("/api/v1/sessions/{sid}/submit")
def submit(sid: int, body: SubmitIn):
    with Session() as db:
        s = db.get(GameSession, sid)
        if not s: raise HTTPException(404, "Session not found.")
        m = M.get(body.mission_id)
        if not m: raise HTTPException(404, "Mission not found.")
        done = [x.mission_id for x in db.query(Submission).filter_by(session_id=sid)]
        if m["id"] in done: raise HTTPException(409, "Mission already answered.")
        if m["id"] != ORDER[len(done)]: raise HTTPException(403, "Mission is locked.")
        a = body.answer.strip().lower()
        # All missions now use multiple-choice answers (a, b, c or d).
        ok = a == m["answer"]
        xp = XP_CORRECT if ok else 0
        db.add(Submission(session_id=sid, mission_id=m["id"], is_correct=ok, xp_earned=xp))
        finished = len(done) + 1 == len(ORDER)
        if finished:
            all_ok = ok and db.query(Submission).filter_by(session_id=sid, is_correct=True).count() == len(ORDER) - 1
            if all_ok: xp += XP_BONUS
            s.status, s.completed_at = "completed", now()
        s.total_xp += xp
        db.commit()  # answer + XP in a single transaction
        return {"correct": ok, "xp_earned": xp, "total_xp": s.total_xp, "rank": rank(s.total_xp),
                "finished": finished, "explanation": m["explain"],
                "message": f"Correct! You earned {xp} XP." if ok else "Not quite. No XP this time."}

@app.get("/api/v1/leaderboard")
def leaderboard(limit: int = 10):
    with Session() as db:
        rows = (db.query(Player.display_name, GameSession.total_xp)
                .join(GameSession, GameSession.player_id == Player.id)
                .filter(GameSession.status == "completed")
                .order_by(GameSession.total_xp.desc(), GameSession.completed_at).limit(min(limit, 50)).all())
        return [{"name": n, "xp": x, "rank": rank(x)} for n, x in rows]


# ================= v2: Secret Rooms, Story Mode, Boss Battle (answers never leave the server) =================
def Q(q, o, a, hint, **kw): return {"question": q, "options": dict(zip("abcd", o)), "answer": a, "hint": hint, **kw}
ROOMS = [
    {"id": "hidden-vault", "title": "The Hidden Vault", "needs": "password-mine", "reward": "Vault Key", "xp": 50,
     **Q("Where is the safest place to keep your passwords?", ["On a sticky note on the monitor", "In a password manager with a strong master password", "In passwords.txt on the desktop", "In autofill on a shared computer"], "b", "Think: encrypted and protected by one strong secret.")},
    {"id": "redstone-archive", "title": "The Redstone Archive", "needs": "redstone-cipher", "reward": "Redstone Key", "xp": 50,
     **Q("Q6. What does HTTPS indicate?", ["A secure connection", "A computer virus", "A Wi-Fi password", "A programming language"], "a", "HTTPS means the connection to the website is encrypted and more secure.")},
    {"id": "forgotten-server", "title": "The Forgotten Server", "needs": "creeper-alert", "reward": "Server Log", "xp": 50,
     **Q("Log: 40 failed logins from one IP, then a success, then a huge data export. What happened?", ["Normal user typo", "Likely brute-force then data theft", "A scheduled backup", "A software update"], "b", "Many failures, then success, then export is a classic pattern.")},
]
CHAPTERS = [
    {"id": "chapter_01", "title": "The First Signal", "needs": None, "who": "Cyber Villager", "text": "A strange message reached the village. It promises a free reward if we click fast. What do we do?",
     "choices": [{"id": "report", "label": "Report it and check the sender", "good": True, "clue": "Sender domain was a look-alike. Phishing confirmed."}, {"id": "click", "label": "Click to see what it is", "good": False, "clue": "The link was a trap, but the village firewall caught it."}]},
    {"id": "chapter_02", "title": "The Hidden Archive", "needs": "hidden-vault", "who": "Cyber Villager", "text": "A firewall protects a network. Is this statement true or false?",
     "choices": [{"id": "true", "label": "True", "good": True, "clue": "Correct! A firewall helps protect a network by filtering network traffic."}, {"id": "false", "label": "False", "good": False, "clue": "A firewall helps protect a network by filtering network traffic."}]},
    {"id": "chapter_03", "title": "The Broken Network", "needs": "redstone-archive", "who": "Guardian", "text": "The network is missing protections. Which fix comes first?",
     "choices": [{"id": "mfa", "label": "Enable MFA and update the system", "good": True, "clue": "MFA blocks stolen passwords. The Core grows weaker."}, {"id": "ignore", "label": "Wait and watch", "good": False, "clue": "Waiting lets the malware spread, but you can still fix it."}]},
]
LESSONS = {
    "chapter_01": "Urgent 'free reward' messages are classic phishing. Check the sender and never click first.",
    "chapter_02": "A firewall monitors and filters network traffic to help protect devices and networks.",
    "chapter_03": "MFA plus updates close the most common doors for attackers.",
}
BOSS_Q = [
    {"id": "boss_q_1", "round": "Entry Point", **Q("You receive a suspicious message urging you to log in now. What do you do?", ["Click the link fast", "Verify the sender via the official site, then report it", "Forward it to friends", "Reply with your password"], "b", "Never act on urgency. Verify independently.", xp=60)},
    {"id": "boss_q_2", "round": "Weak Shield", **Q("Which setting best protects an account?", ["Same password everywhere", "Multi-factor authentication", "Sharing the password with a friend", "Writing it in chat"], "b", "A second factor stops stolen passwords.", xp=60)},
    {"id": "boss_q_3", "round": "Network Breach", **Q("A virtual device looks infected. Best first action?", ["Isolate it from the network and report", "Keep using it", "Delete all logs", "Connect it to more devices"], "a", "Contain first, so it cannot spread.", xp=80)},
    {"id": "boss_q_4", "round": "Data Lock", **Q("What does encryption do for your data?", ["Makes it unreadable without the key", "Makes it faster", "Deletes old files", "Hides it from backups"], "a", "Think: scrambled without the key.", xp=80)},
    {"id": "boss_q_5", "round": "Final Protocol", **Q("Choose the best incident response set.", ["Contain, remove the threat, restore from clean backups, review", "Reboot and hope", "Ignore and move on", "Blame the user"], "a", "Contain, eradicate, recover, learn.", xp=100)},
]
BQ = {q["id"]: q for q in BOSS_Q}

def auth(x_session_token: str = Header(...)):
    with Session() as db:
        s = db.query(GameSession).filter_by(token=x_session_token).first()
        if not s: raise HTTPException(401, "Invalid session.")
        if s.status == "over": raise HTTPException(403, "Game over: you used all your lives in the Secret Rooms.")
        return s.id

def sets(db, sid):
    f = lambda M, col, **k: {getattr(r, col) for r in db.query(M).filter_by(session_id=sid, **k)}
    return f(Submission, "mission_id"), f(RoomProgress, "room_id"), f(StoryProgress, "chapter_id")

def reward(db, sid, xp, ach=None):
    db.get(GameSession, sid).total_xp += xp
    if ach and not db.query(Achievement).filter_by(session_id=sid, achievement_id=ach).first():
        db.add(Achievement(session_id=sid, achievement_id=ach))

def room_status(r, dm, dr):  # a room opens only after its mission AND the previous room are solved
    i = ROOMS.index(r); prev_ok = i == 0 or ROOMS[i - 1]["id"] in dr
    return "completed" if r["id"] in dr else "available" if r["needs"] in dm and prev_ok else "locked"

@app.get("/api/v1/rooms")
def rooms(sid: int = Depends(auth)):
    with Session() as db:
        dm, dr, _ = sets(db, sid)
        lives = MAX_LIVES - (db.get(GameSession, sid).room_mistakes or 0)
        return {"lives": lives, "max": MAX_LIVES, "rooms": [{"id": r["id"], "title": r["title"], "needs": r["needs"],
                "after": ROOMS[i - 1]["title"] if i else None, "mission_done": r["needs"] in dm,
                "status": room_status(r, dm, dr), "reward": r["reward"] if r["id"] in dr else None} for i, r in enumerate(ROOMS)]}

def get_room(db, sid, rid):
    r = next((x for x in ROOMS if x["id"] == rid), None)
    if not r: raise HTTPException(404, "Room not found.")
    dm, dr, _ = sets(db, sid)
    if room_status(r, dm, dr) == "locked": raise HTTPException(403, "This room is still hidden. Finish its mission first.")
    return r, rid in dr

@app.get("/api/v1/rooms/{rid}")
def room(rid: str, sid: int = Depends(auth)):
    with Session() as db:
        r, done = get_room(db, sid, rid)
        return {"id": r["id"], "title": r["title"], "question": r["question"], "options": r["options"], "completed": done}

class SolveIn(BaseModel):
    answer: str = Field(max_length=10)

@app.post("/api/v1/rooms/{rid}/solve")
def solve(rid: str, body: SolveIn, sid: int = Depends(auth)):
    with Session() as db:
        r, done = get_room(db, sid, rid)
        if done: raise HTTPException(409, "Reward already collected.")
        if body.answer.strip().lower() != r["answer"]:
            g = db.get(GameSession, sid); g.room_mistakes = (g.room_mistakes or 0) + 1
            over = g.room_mistakes >= MAX_LIVES
            if over: g.status = "over"
            db.commit()
            return {"correct": False, "hint": r["hint"], "lives": max(0, MAX_LIVES - g.room_mistakes), "game_over": over}
        db.add(RoomProgress(session_id=sid, room_id=rid)); reward(db, sid, r["xp"], "secret_" + rid)
        db.commit()
        i = ROOMS.index(r); nxt = ROOMS[i + 1] if i + 1 < len(ROOMS) else None; dm = sets(db, sid)[0]
        return {"correct": True, "reward": {"item": r["reward"], "xp": r["xp"]}, "next_room": nxt["id"] if nxt and nxt["needs"] in dm else None}

def chapter_view(db, sid):
    _, dr, dc = sets(db, sid); out = []; prev = True
    for c in CHAPTERS:
        st = "completed" if c["id"] in dc else "available" if prev and (c["needs"] is None or c["needs"] in dr) else "locked"
        v = {"id": c["id"], "title": c["title"], "status": st}
        if st == "available": v.update(who=c["who"], text=c["text"], choices=[{"id": x["id"], "label": x["label"]} for x in c["choices"]])
        out.append(v); prev = c["id"] in dc
    return out

@app.get("/api/v1/story/progress")
def story(sid: int = Depends(auth)):
    with Session() as db:
        ch = chapter_view(db, sid); won = db.query(BossEncounter).filter_by(session_id=sid, state="victory").first() is not None
        return {"chapters": ch, "boss_ready": all(c["status"] == "completed" for c in ch), "boss_defeated": won}

class ChoiceIn(BaseModel):
    chapter_id: str = Field(max_length=30); choice_id: str = Field(max_length=30)

@app.post("/api/v1/story/choices")
def choose(body: ChoiceIn, sid: int = Depends(auth)):
    with Session() as db:
        cur = next((c for c in chapter_view(db, sid) if c["id"] == body.chapter_id), None)
        if not cur: raise HTTPException(404, "Chapter not found.")
        if cur["status"] == "completed": raise HTTPException(409, "Chapter already completed.")
        if cur["status"] != "available": raise HTTPException(403, "Chapter is locked.")
        ch = next(c for c in CHAPTERS if c["id"] == body.chapter_id); pick = next((x for x in ch["choices"] if x["id"] == body.choice_id), None)
        if not pick: raise HTTPException(400, "Invalid choice for this scene.")
        db.add(StoryProgress(session_id=sid, chapter_id=ch["id"], choice_id=pick["id"])); reward(db, sid, 25 if pick["good"] else 0)
        db.commit()
        # A wrong choice never blocks the story: it only earns no bonus and shows the best answer.
        return {"good": pick["good"], "clue": pick["clue"], "bonus_xp": 25 if pick["good"] else 0,
                "correct_choice": next(x["label"] for x in ch["choices"] if x["good"]), "lesson": LESSONS[ch["id"]]}

@app.get("/api/v1/story/codex")
def codex(sid: int = Depends(auth)):
    with Session() as db:
        rows = db.query(StoryProgress).filter_by(session_id=sid).all(); _, dr, _ = sets(db, sid)
        clues = [next(x["clue"] for x in c["choices"] if x["id"] == r.choice_id) for r in rows for c in CHAPTERS if c["id"] == r.chapter_id]
        return {"clues": clues, "items": [r["reward"] for r in ROOMS if r["id"] in dr]}

# ---- Boss: Ready -> Charging -> (Damaged) -> Victory. The server owns round, shield and XP. ----
def enc_of(db, sid):
    e = db.query(BossEncounter).filter_by(session_id=sid).order_by(BossEncounter.id.desc()).first()
    return e

def enc_view(e): return {"encounter_id": e.id, "state": e.state, "round": e.current_round, "total_rounds": len(BOSS_Q), "shield_percent": 100 - 100 * e.current_round // len(BOSS_Q), "lives": max(0, MAX_LIVES - (e.mistakes or 0))}

@app.post("/api/v1/boss/start")
def boss_start(sid: int = Depends(auth)):
    with Session() as db:
        e = enc_of(db, sid)
        if e and e.state == "victory": raise HTTPException(409, "The Malware Core is already defeated.")
        if e: return enc_view(e)
        if not all(c["status"] == "completed" for c in chapter_view(db, sid)): raise HTTPException(403, "Finish chapters 1-3 first.")
        e = BossEncounter(session_id=sid); db.add(e); db.commit(); return enc_view(e)

@app.get("/api/v1/boss/state")
def boss_state(sid: int = Depends(auth)):
    with Session() as db:
        e = enc_of(db, sid)
        if not e: raise HTTPException(404, "No encounter yet.")
        return enc_view(e)

@app.get("/api/v1/boss/question")
def boss_question(sid: int = Depends(auth)):
    with Session() as db:
        e = enc_of(db, sid)
        if not e or e.state != "charging": raise HTTPException(409, "No active question.")
        q = BOSS_Q[e.current_round]
        return {"question_id": q["id"], "round_title": q["round"], "question": q["question"], "options": q["options"]}

class BossIn(BaseModel):
    encounter_id: int; question_id: str = Field(max_length=20); answer_id: str = Field(max_length=10)

@app.post("/api/v1/boss/answer")
def boss_answer(body: BossIn, sid: int = Depends(auth)):
    with Session() as db:
        e = db.get(BossEncounter, body.encounter_id)
        if not e or e.session_id != sid: raise HTTPException(404, "Encounter not found.")
        if e.state != "charging": raise HTTPException(409, "Battle is not active.")
        q = BOSS_Q[e.current_round]
        if body.question_id != q["id"]: raise HTTPException(409, "That question is not active.")
        ok = body.answer_id.strip().lower() == q["answer"]
        seen = db.query(BossAnswer).join(BossEncounter).filter(BossEncounter.session_id == sid, BossAnswer.question_id == q["id"], BossAnswer.is_correct.is_(True)).first()
        xp = q["xp"] if ok and not seen else 0
        db.add(BossAnswer(encounter_id=e.id, question_id=q["id"], is_correct=ok, xp_earned=xp))
        if not ok:
            e.mistakes = (e.mistakes or 0) + 1
            if e.mistakes >= MAX_LIVES: e.state, e.completed_at = "defeat", now()
            db.commit()
            return {"correct": False, "boss_state": "defeat" if e.state == "defeat" else "attack", "hint": q["hint"], **enc_view(e)}
        e.current_round += 1; reward(db, sid, xp)
        if e.current_round == len(BOSS_Q):
            e.state, e.completed_at = "victory", now(); reward(db, sid, 100, "malware_slayer")
            db.add(StoryProgress(session_id=sid, chapter_id="chapter_04", choice_id="core_defeated"))
        db.commit()
        return {"correct": True, "boss_state": "defeated" if e.state == "victory" else "damaged", "xp_earned": xp,
                "explanation": q["hint"], **enc_view(e)}

@app.post("/api/v1/boss/retry")
def boss_retry(sid: int = Depends(auth)):
    with Session() as db:
        e = enc_of(db, sid)
        if not e or e.state in ("victory", "defeat"): raise HTTPException(409, "Nothing to retry.")
        e.current_round = 0; db.commit(); return enc_view(e)

@app.get("/api/v1/boss/result")
def boss_result(sid: int = Depends(auth)):
    with Session() as db:
        e = enc_of(db, sid)
        if not e or e.state != "victory": raise HTTPException(409, "The Core still stands.")
        s = db.get(GameSession, sid)
        return {"total_xp": s.total_xp, "rank": rank(s.total_xp), "achievement": "Malware Slayer"}
