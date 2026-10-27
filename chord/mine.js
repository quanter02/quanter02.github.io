// 내 손 등록: 지판 판정이 '맞음'으로 2초 이어질 때 그 순간의 손 모양과 손끝 치우침을 코드별로 저장하고,
// 이후 같은 코드를 연습할 때 (1) 치우침을 빼고 판정하고 (2) 내가 등록한 모양과 얼마나 다른지 2차 확인한다.
// 저장은 이 기기 브라우저(localStorage)에만. 화면·사진은 저장하지 않고 손 관절 좌표에서 만든 숫자만 둔다.
import { features } from './shape.js?v=1';

export const ENROLL_SEC = 2.0;   // 맞음이 이만큼 이어지면 저장
export const WARN_SEC = 1.0;     // 내 모양과 다름이 이만큼 이어지면 문구
const KEY = 'chord.mine.v1';
const TIP_FEAT = { 1: 16, 2: 24, 3: 32, 4: 40 }; // features() 안에서 손가락 끝(8·12·16·20번 관절) x 위치
const FINGER = { 1: '검지', 2: '중지', 3: '약지', 4: '새끼' };

export function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { chords: {} }; } catch { return { chords: {} }; }
}
export function save(db) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} }

// 등록된 코드들의 손끝 치우침 평균 (줄, 프렛). 카메라 각도·손 두께는 코드와 상관없이 비슷하게 치우친다
export function calibration(db) {
  const xs = Object.values(db.chords).map((c) => c.off).filter(Boolean);
  if (!xs.length) return null;
  return { s: xs.reduce((a, o) => a + o[0], 0) / xs.length, f: xs.reduce((a, o) => a + o[1], 0) / xs.length };
}

// 등록 진행: 프레임마다 push. 맞음이 끊기면 처음부터. 다 모이면 저장할 기록을 돌려준다
export function makeEnroll(key) {
  let t = 0, feats = [], res = [];
  return {
    key,
    progress: () => Math.min(1, t / ENROLL_SEC),
    push(ok, lm, residuals, dt) {
      if (!ok || !lm) { t = 0; feats = []; res = []; return null; }
      t += dt; feats.push(features(lm)); res.push(...residuals);
      if (t < ENROLL_SEC) return null;
      const n = feats.length, mean = feats[0].map((_, i) => feats.reduce((s, f) => s + f[i], 0) / n);
      const off = [res.reduce((s, r) => s + r[0], 0) / res.length, res.reduce((s, r) => s + r[1], 0) / res.length];
      return { f: mean, n, off, at: new Date().toISOString().slice(0, 10) };
    },
  };
}

// 현재 손 모양과 등록 모양의 차이: 손 크기로 나눈 손가락 끝 위치 차이(가장 큰 손가락)
export function compare(tmpl, lm, fingers) {
  const f = features(lm);
  let worst = null, worstD = 0;
  for (const k of fingers) {
    const i = TIP_FEAT[k], d = Math.hypot(f[i] - tmpl.f[i], f[i + 1] - tmpl.f[i + 1]);
    if (d > worstD) { worstD = d; worst = k; }
  }
  return { d: worstD, finger: worst, name: FINGER[worst] };
}

// 손 크기(손목~중지 뿌리) 대비 이 거리 이상 벗어나면 '내 모양과 다름'. 한 칸(프렛) 어긋남은 대략 0.3~0.4, 한 줄은 약 0.1이라 줄 단위는 지판 판정이 맡음 [임시 기준, 실사용으로 조정]
export const DIFF = 0.25;

export function makeMineCheck() {
  let since = 0;
  return {
    update(tmpl, lm, fingers, dt) {
      if (!tmpl || !lm) { since = 0; return null; }
      const r = compare(tmpl, lm, fingers);
      since = r.d >= DIFF ? since + dt : 0;
      return since >= WARN_SEC ? r : null;
    },
    reset() { since = 0; },
  };
}
