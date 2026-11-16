const BASE = "http://127.0.0.1:8000/api/v1";
async function call(path, opts) {
  const r = await fetch(BASE + path, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Request failed. Check your input.");
  return data;
}
export const createPlayer = (display_name) => call("/players", { method: "POST", body: JSON.stringify({ display_name }) });
export const startSession = (id) => call(`/sessions?player_id=${id}`, { method: "POST" });
export const getMissions = () => call("/missions");
export const getSession = (id) => call(`/sessions/${id}`);
export const submitAnswer = (sid, mission_id, answer) =>
  call(`/sessions/${sid}/submit`, { method: "POST", body: JSON.stringify({ mission_id, answer }) });
export const getLeaderboard = () => call("/leaderboard");
// ---- v2: every call below carries the session token; the server decides all results ----
let TOKEN = null;
export const setToken = (t) => { TOKEN = t; };
const tc = (p, o = {}) => call(p, { ...o, headers: { "Content-Type": "application/json", "X-Session-Token": TOKEN } });
const post = (p, b) => tc(p, { method: "POST", body: JSON.stringify(b || {}) });
export const getRooms = () => tc("/rooms");
export const getRoom = (id) => tc(`/rooms/${id}`);
export const solveRoom = (id, answer) => post(`/rooms/${id}/solve`, { answer });
export const getStory = () => tc("/story/progress");
export const chooseStory = (chapter_id, choice_id) => post("/story/choices", { chapter_id, choice_id });
export const getCodex = () => tc("/story/codex");
export const bossStart = () => post("/boss/start");
export const bossQuestion = () => tc("/boss/question");
export const bossAnswer = (encounter_id, question_id, answer_id) => post("/boss/answer", { encounter_id, question_id, answer_id });
export const bossRetry = () => post("/boss/retry");
export const bossResult = () => tc("/boss/result");
