// 지판 자동 따라가기: 한 번 맞춘 가이드 안쪽(지판) 모양을 기억해 두고,
// 다음 프레임에서 그 모양이 어디로 옮겨 갔는지 찾아 가이드를 같이 옮긴다.
// 손이 가린 부분은 비교에서 뺀다. 이동만 따라가고 회전·크기 변화는 다시 맞춰야 한다.

export const TRACK_W = 160;   // 이 폭으로 줄여서 계산
const SEARCH = 10;            // 한 번에 찾는 범위 (줄인 화면 기준 px)

// RGBA → 흐린 흑백 → 밝기 변화량(윤곽). 조명이 바뀌어도 줄·프렛 윤곽은 남는다
export function edges(rgba, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = rgba[j] * 0.299 + rgba[j + 1] * 0.587 + rgba[j + 2] * 0.114;
  const b = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    b[i] = (g[i] * 4 + g[i - 1] + g[i + 1] + g[i - w] + g[i + w]) / 8;
  }
  const e = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    e[i] = Math.abs(b[i + 1] - b[i - 1]) + Math.abs(b[i + w] - b[i - w]);
  }
  return e;
}

function inPoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// 손 관절 근처인지 (가려진 부분)
function handMask(hands, w, h) {
  const m = new Uint8Array(w * h);
  const r = Math.round(w * 0.045);
  for (const lm of hands) for (const p of lm) {
    const cx = Math.round(p.x * w), cy = Math.round(p.y * h);
    for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++)
      for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) m[y * w + x] = 1;
  }
  return m;
}

// corners: 0~1 좌표 4점(가이드). 가이드 안쪽, 손이 없는 픽셀을 기억한다
export function makeTemplate(e, w, h, corners, hands) {
  const poly = corners.map(([x, y]) => [x * w, y * h]);
  const hm = handMask(hands, w, h);
  const xs = [], ys = [], vs = [];
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    if (!inPoly(poly, x + 0.5, y + 0.5) || hm[y * w + x]) continue;
    xs.push(x); ys.push(y); vs.push(e[y * w + x]);
  }
  const n = vs.length;
  const mean = vs.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const spread = vs.reduce((a, b) => a + Math.abs(b - mean), 0) / Math.max(1, n);
  return { xs: Int16Array.from(xs), ys: Int16Array.from(ys), vs: Float32Array.from(vs), n, spread, dx: 0, dy: 0 };
}

function cost(t, e, w, h, hm, ox, oy) {
  let s = 0, k = 0;
  for (let i = 0; i < t.n; i += 2) {
    const x = t.xs[i] + ox, y = t.ys[i] + oy;
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
    const j = y * w + x;
    if (hm[j]) continue;
    s += Math.abs(e[j] - t.vs[i]); k++;
  }
  return k > t.n * 0.15 ? s / k : Infinity;
}

// 템플릿이 지금 프레임에서 어디로 옮겨 갔는지. 반환: 줄인 화면 px 단위 이동량과 일치도
export function trackStep(t, e, w, h, hands) {
  if (!t || t.n < 80 || t.spread < 1) return { ok: false, reason: 'flat' };
  const hm = handMask(hands, w, h);
  const c0 = cost(t, e, w, h, hm, t.dx, t.dy);
  let best = c0, bx = t.dx, by = t.dy;
  // 2px 간격으로 넓게 → 1px 간격으로 다듬기
  for (let oy = -SEARCH; oy <= SEARCH; oy += 2) for (let ox = -SEARCH; ox <= SEARCH; ox += 2) {
    const c = cost(t, e, w, h, hm, t.dx + ox, t.dy + oy);
    if (c < best) { best = c; bx = t.dx + ox; by = t.dy + oy; }
  }
  const cx = bx, cy = by;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const c = cost(t, e, w, h, hm, cx + ox, cy + oy);
    if (c < best) { best = c; bx = cx + ox; by = cy + oy; }
  }
  // 일치도: 0이면 완전히 같음, 1이면 기억한 모양의 평균 변화량만큼 다름
  const match = best / t.spread;
  const moved = bx !== t.dx || by !== t.dy;
  // 움직였다고 판단하려면 제자리보다 확실히 잘 맞아야 한다 (흔들림 방지)
  if (moved && best < c0 * 0.92 && match < 0.95) { const sx = bx - t.dx, sy = by - t.dy; t.dx = bx; t.dy = by; return { ok: true, sx, sy, match }; }
  return { ok: match < 0.95, sx: 0, sy: 0, match };
}
