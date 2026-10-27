// 손 모양 보조 확인 (실험). 지판 판정을 바꾸지 않고, 맞음으로 나왔는데 손 모양이 다른 코드에 훨씬 가까우면 참고 문구만 띄운다.
// 모델: Roboflow 공개 사진(insu/chord) 515장의 MediaPipe 손 좌표로 학습한 작은 신경망. 교차검증 정답률 66% → 주 판정에는 쓰지 않는다.
const TIPS = [4, 8, 12, 16, 20];
export const WARN_P = 0.6;   // 다른 코드 확률이 이 이상이고 (헷갈리는 짝만 볼 때 0.6이 가장 나음, 아래 PAIRS 참고)
export const KEY_P = 0.1;    // 연습 중인 코드 확률이 이 이하일 때만
export const HOLD_S = 1.0;   // 이 시간 동안 이어져야 문구를 띄움
// 실제로 서로 많이 헷갈린 짝만 경고 (공개 사진 교차검증, 2026-10-27). 11코드 전체 비교·0.8 대비
// 맞는 모양에 잘못 경고 11.1%→7.6%, 짝 실수 잡음 49.0%→55.5%. 짝을 같은 데이터에서 골라 실제보다 좋게 나왔을 수 있음
export const PAIRS = [['Am', 'Em'], ['Am', 'C'], ['C', 'Em'], ['A', 'Em'], ['A', 'C'], ['A', 'F']];
const partners = (k) => new Set(PAIRS.filter((p) => p.includes(k)).map((p) => (p[0] === k ? p[1] : p[0])));

export function features(lm) {
  const p = lm.map((q) => [q.x - lm[0].x, q.y - lm[0].y]);
  const v = p[9], s = Math.hypot(v[0], v[1]) + 1e-9, a = Math.atan2(v[0], v[1]), c = Math.cos(a), n = Math.sin(a);
  const q = p.map(([x, y]) => [(c * x - n * y) / s, (n * x + c * y) / s]);
  if (q[5][0] < q[17][0]) q.forEach((r) => { r[0] = -r[0]; }); // 검지 쪽을 항상 +x (거울·왼손 무관)
  const d = [];
  for (let i = 0; i < TIPS.length; i++) for (let j = i + 1; j < TIPS.length; j++) d.push(Math.hypot(q[TIPS[i]][0] - q[TIPS[j]][0], q[TIPS[i]][1] - q[TIPS[j]][1]));
  return [...q.flat(), ...d];
}

export function predict(model, lm) {
  let h = features(lm).map((x, i) => (model.sd[i] ? (x - model.mu[i]) / model.sd[i] : 0)); // 항상 같은 값인 특징(손목 원점 등)은 0
  model.W.forEach((W, k) => {
    const out = model.b[k].slice();
    for (let i = 0; i < h.length; i++) { const hi = h[i], row = W[i]; for (let j = 0; j < out.length; j++) out[j] += hi * row[j]; }
    h = k < model.W.length - 1 ? out.map((x) => Math.max(0, x)) : out;
  });
  const m = Math.max(...h), e = h.map((x) => Math.exp(x - m)), z = e.reduce((s, x) => s + x, 0);
  return e.map((x) => x / z);
}

// 프레임마다 확률을 부드럽게 하고, 조건이 HOLD_S 이상 이어질 때만 다른 코드 이름을 돌려준다
export function makeShapeCheck(model) {
  let avg = null, since = 0;
  return {
    update(lm, key, dt) {
      if (!lm || !model.classes.includes(key)) { avg = null; since = 0; return null; }
      const p = predict(model, lm.map((q) => ({ x: q.x, y: q.y })));
      avg = avg ? avg.map((v, i) => v + 0.2 * (p[i] - v)) : p;
      const top = avg.indexOf(Math.max(...avg)), other = model.classes[top];
      const warn = other !== key && partners(key).has(other) && avg[top] >= WARN_P && avg[model.classes.indexOf(key)] <= KEY_P;
      since = warn ? since + dt : 0;
      return since >= HOLD_S ? other : null;
    },
    reset() { avg = null; since = 0; },
  };
}
