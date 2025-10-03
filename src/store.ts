import { ChatMsg, SessionLog, Sequence } from "./types";
const LS_LOGS = "yoga.logs.v1";
const LS_CHAT = "yoga.chat.v1";

export function saveSession(seq: Sequence) {
  const logs = getLogs();
  logs.push({ at: new Date().toISOString(), sequenceSlug: seq.slug, durationSec: seq.durationSec });
  localStorage.setItem(LS_LOGS, JSON.stringify(logs));
}
export function getLogs(): SessionLog[] {
  try { return JSON.parse(localStorage.getItem(LS_LOGS) || "[]"); } catch { return []; }
}
export function logsByDay(yyyymm: string): Record<string, number> {
  const res: Record<string, number> = {};
  for (const l of getLogs()) if (l.at.startsWith(yyyymm)) {
    const d = l.at.slice(0,10);
    res[d] = (res[d]||0) + l.durationSec;
  }
  return res;
}
export function totalSessions(){ return getLogs().length; }
export function totalTime(){ return getLogs().reduce((a,b)=>a+b.durationSec,0); }

export function getChat(): ChatMsg[] {
  try { return JSON.parse(localStorage.getItem(LS_CHAT) || "[]"); } catch { return []; }
}
export function pushChat(m: ChatMsg){
  const arr = getChat(); arr.push(m); localStorage.setItem(LS_CHAT, JSON.stringify(arr.slice(-50)));
}
