// 기타 코드 판정의 핵심 계산. 화면·카메라와 무관한 순수 함수만 둔다.
//
// 좌표 약속
// - 지판 좌표 (x, y): x는 너트 0 → 가이드 끝 프렛(GUIDE_FRET) 1, y는 6번줄 쪽 가장자리 0 → 1번줄 쪽 가장자리 1
// - 프렛 번호(연속값): 0 = 너트, n = n번째 프렛 쇠막대. n번 프렛을 누르는 손가락은 (n-1, n] 사이에 있다
// - 줄 번호(연속값): 6 = 가장 굵은 줄(낮은 E), 1 = 가장 가는 줄

export const GUIDE_FRET = 5;      // 가이드 사각형이 너트부터 몇 번 프렛까지 덮는지
export const STRING_MARGIN = 0.1; // 지판 가장자리에서 바깥 줄까지의 거리 (지판 폭 대비)

// MediaPipe 손 관절 번호: 손가락 끝, 끝마디 관절(DIP)
export const TIP = { 1: 8, 2: 12, 3: 16, 4: 20 };
export const DIP = { 1: 7, 2: 11, 3: 15, 4: 19 };
// 줄을 실제로 누르는 곳은 손톱 끝이 아니라 손가락 끝마디 살(패드). 끝에서 관절 쪽으로 30% 지점을 쓴다
export const PAD_T = 0.3;

// 판정 기준 (2026-10-23 강화: 한 줄 가까이 벗어나도 맞음으로 나오던 문제)
export const STRING_FULL = 0.25;  // 이 거리(줄 단위) 안이면 줄 점수 만점
export const STRING_ZERO = 0.9;   // 이 거리면 줄 점수 0점 (반 줄이면 약 63점 → 최소 기준 미달)
export const OK_AVG = 80;         // 맞음: 손가락 평균 이 점수 이상
export const OK_MIN = 60;         //       그리고 모든 손가락이 이 점수 이상 (시뮬레이션으로 고름: llm-reliability/products/chord_test)
export const HOLD_SEC = 0.5;      // 맞음이 이 시간 동안 유지돼야 최종 맞음
export const HOLD_FRAC = 0.8;     //       그 시간 동안 이 비율 이상의 프레임이 맞음
export const FINGER_NAME = { 1: '검지', 2: '중지', 3: '약지', 4: '새끼' };

// 운지표. string: 줄 번호, fret: 프렛, finger: 1 검지 ~ 4 새끼. barre: 검지로 여러 줄을 누름
// mute: 치지 않는 줄
export const CHORDS = {
  A:  { name: 'A',  full: 'A major', mute: [6], notes: [
        { finger: 1, string: 4, fret: 2 }, { finger: 2, string: 3, fret: 2 }, { finger: 3, string: 2, fret: 2 }] },
  C:  { name: 'C',  full: 'C major', mute: [6], notes: [
        { finger: 1, string: 2, fret: 1 }, { finger: 2, string: 4, fret: 2 }, { finger: 3, string: 5, fret: 3 }] },
  G:  { name: 'G',  full: 'G major', mute: [], notes: [
        { finger: 1, string: 5, fret: 2 }, { finger: 2, string: 6, fret: 3 }, { finger: 3, string: 1, fret: 3 }] },
  D:  { name: 'D',  full: 'D major', mute: [6, 5], notes: [
        { finger: 1, string: 3, fret: 2 }, { finger: 2, string: 1, fret: 2 }, { finger: 3, string: 2, fret: 3 }] },
  Em: { name: 'Em', full: 'E minor', mute: [], notes: [
        { finger: 2, string: 5, fret: 2 }, { finger: 3, string: 4, fret: 2 }] },
  Am: { name: 'Am', full: 'A minor', mute: [6], notes: [
        { finger: 1, string: 2, fret: 1 }, { finger: 2, string: 4, fret: 2 }, { finger: 3, string: 3, fret: 2 }] },
  E:  { name: 'E',  full: 'E major', mute: [], notes: [
        { finger: 1, string: 3, fret: 1 }, { finger: 2, string: 5, fret: 2 }, { finger: 3, string: 4, fret: 2 }] },
  // F 바레: 검지가 1프렛 전체를 누른다. 카메라로는 검지 끝이 6번줄 쪽에 있는지만 본다
  F:  { name: 'F',  full: 'F major (바레)', mute: [], notes: [
        { finger: 1, string: 6, fret: 1, barre: true }, { finger: 2, string: 3, fret: 2 },
        { finger: 3, string: 5, fret: 3 }, { finger: 4, string: 4, fret: 3 }] },
};
export const CHORD_ORDER = ['A', 'C', 'G', 'D', 'Em', 'Am', 'E', 'F'];

// ---------- 원근 변환 (4점 호모그래피) ----------
// src 4점 → dst 4점으로 보내는 3x3 행렬
export function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}
export function apply(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

// 가이드 네 모서리(이미지 좌표, 0~1) → 지판 좌표 변환기
// corners: { nut6, nut1, fret6, fret1 } — 너트·6번줄, 너트·1번줄, 끝프렛·6번줄, 끝프렛·1번줄
export function makeNeck(corners) {
  const img = [corners.nut6, corners.nut1, corners.fret1, corners.fret6];
  const unit = [[0, 0], [0, 1], [1, 1], [1, 0]];
  return { toNeck: homography(img, unit), toImage: homography(unit, img), corners };
}

// ---------- 지판 좌표 ↔ 프렛·줄 번호 (실제 기타의 12평균율 프렛 간격) ----------
const SPAN = 1 - Math.pow(2, -GUIDE_FRET / 12);
export function fretToX(n) { return (1 - Math.pow(2, -n / 12)) / SPAN; }
export function xToFret(x) { const d = x * SPAN; return d >= 1 ? 99 : -12 * Math.log2(1 - d); }
export function stringToY(s) { return STRING_MARGIN + (1 - 2 * STRING_MARGIN) * (6 - s) / 5; }
export function yToString(y) { return 6 - (y - STRING_MARGIN) / ((1 - 2 * STRING_MARGIN) / 5); }
// 손가락이 눌러야 할 자리 (프렛 사이 칸에서 쇠막대 쪽으로 70% 지점)
export function targetPoint(note) { return [fretToX(note.fret - 0.3), stringToY(note.string)]; }

export function locate(neck, p) {
  const [x, y] = apply(neck.toNeck, p.x, p.y);
  return { x, y, fret: x < 0 ? x * 3 : xToFret(x), string: yToString(y) };
}

// 여러 손 중에서 손가락 끝이 지판에 가장 가까운 손을 고른다 (줄 잡는 손)
export function pickFrettingHand(neck, hands) {
  let best = -1, bestD = Infinity;
  hands.forEach((lm, i) => {
    let d = 0;
    for (const t of [8, 12, 16, 20]) {
      const [x, y] = apply(neck.toNeck, lm[t].x, lm[t].y);
      // 가이드 밖으로 벗어난 만큼 + 가이드 가운데에서 먼 만큼(동점 방지)
      d += Math.hypot(Math.max(0, -x, x - 1), Math.max(0, -y, y - 1)) + 0.05 * Math.abs(x - 0.5);
    }
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

// ---------- 판정 ----------
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// 판정에 쓰는 손가락 점: 끝(TIP)에서 끝마디 관절(DIP) 쪽으로 PAD_T 만큼
export function padPoint(lm, finger) {
  const t = lm[TIP[finger]], d = lm[DIP[finger]];
  return { x: t.x + PAD_T * (d.x - t.x), y: t.y + PAD_T * (d.y - t.y) };
}

// cal: 내 손 등록에서 잰 손끝 치우침 {s: 줄, f: 프렛}. 있으면 빼고 판정 (없으면 이전과 같음)
export function evaluateNote(neck, lm, note, cal = null) {
  const at0 = locate(neck, padPoint(lm, note.finger));
  const at = cal ? { ...at0, string: at0.string - cal.s, fret: at0.fret - cal.f } : at0;
  // 줄: STRING_FULL 이내면 만점, STRING_ZERO면 0점. 바레는 6번줄 쪽(5번줄 너머)이면 만점
  const sErr = note.barre ? Math.max(0, 5 - at.string) : Math.abs(at.string - note.string);
  const sScore = clamp01(1 - Math.max(0, sErr - STRING_FULL) / (STRING_ZERO - STRING_FULL));
  // 프렛: 칸 (n-1, n] 안이면 만점(쇠막대를 살짝 넘는 0.2까지 허용), 칸 밖으로 0.6칸 벗어나면 0점
  const lo = note.fret - 1, hi = note.fret + 0.2;
  const fErr = at.fret < lo ? lo - at.fret : at.fret > hi ? at.fret - hi : 0;
  let fScore = clamp01(1 - fErr / 0.6);
  const farFromWire = fErr === 0 && at.fret < note.fret - 0.65;
  if (farFromWire) fScore *= 0.85;
  const score = Math.round(100 * sScore * fScore);

  const label = `${FINGER_NAME[note.finger]} (${note.fret}번 프렛 ${note.barre ? '전체 바레' : note.string + '번줄'})`;
  let status, msg;
  if (score >= 80) { status = 'good'; msg = farFromWire ? '좋아요. 프렛 쇠막대 쪽으로 조금 더 붙이면 소리가 깨끗해요' : '완벽한 위치예요'; }
  else {
    status = score >= 40 ? 'close' : 'bad';
    const parts = [];
    if (sScore < 1) {
      const now = Math.min(6.5, Math.max(0.5, at.string));
      parts.push(note.barre ? '검지를 6번줄까지 쭉 펴서 덮어 주세요'
        : `지금 ${Math.round(now)}번줄 근처예요 → ${note.string}번줄로 옮기세요`);
    }
    if (fScore < 0.85) {
      const nowFret = at.fret <= 0 ? '너트 바깥' : `${Math.max(1, Math.ceil(at.fret - 0.2))}번 칸`;
      parts.push(`지금 ${nowFret}이에요 → ${note.fret}번 칸으로`);
    }
    msg = parts.join(' · ') || '조금만 더 정확히 맞춰 주세요';
  }
  return { note, at, score, sScore, fScore, status, label, msg };
}

// 맞음: 평균 OK_AVG 이상이고 모든 손가락이 OK_MIN 이상
export function isOk(fingers) {
  const avg = fingers.reduce((s, f) => s + f.score, 0) / fingers.length;
  return avg >= OK_AVG && Math.min(...fingers.map((f) => f.score)) >= OK_MIN;
}

export function evaluateChord(neck, lm, chord, cal = null) {
  const fingers = chord.notes.map((n) => evaluateNote(neck, lm, n, cal));
  const score = Math.round(fingers.reduce((s, f) => s + f.score, 0) / fingers.length);
  return { chord, fingers, score, ok: isOk(fingers) };
}

// 프레임마다 흔들리는 판정을 시간으로 거른다: 최근 sec초 동안 frac 이상 맞아야 최종 맞음.
// 손가락 위치 추정 잡음(약 한 줄)으로 우연히 맞게 나오는 프레임을 걸러 낸다
export function makeHold(sec = HOLD_SEC, frac = HOLD_FRAC) {
  let q = [];
  return {
    push(t, ok) {
      q.push([t, ok]);
      while (q.length && t - q[0][0] > sec) q.shift();
      const span = q.length > 1 ? t - q[0][0] : 0;
      const good = q.filter((x) => x[1]).length / q.length;
      return span >= sec * 0.9 && good >= frac;
    },
    reset() { q = []; },
  };
}

// 가이드(지판 너트~끝 프렛)가 화면 폭에서 차지하는 비율. 작을수록 줄 간격이 좁아 판정이 흔들린다
export function guideWidth(corners) {
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const n = mid(corners.nut6, corners.nut1), f = mid(corners.fret6, corners.fret1);
  return Math.hypot(f[0] - n[0], f[1] - n[1]);
}

// 기본 가이드: 거울 화면 기준으로 왼쪽에 헤드, 오른쪽으로 몸통. 원본(비반전) 좌표로 저장
export function defaultCorners(mirror = true) {
  const m = (x) => (mirror ? 1 - x : x);
  return { nut6: [m(0.1), 0.42], nut1: [m(0.1), 0.6], fret6: [m(0.62), 0.4], fret1: [m(0.62), 0.6] };
}
