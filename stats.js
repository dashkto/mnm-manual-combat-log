// Shared by index.html and analyze.html. Swing shape: {a:'p'|'m', r:'hit'|'miss', d}.

function wilson(k, n, z = 1.96){
  if (!n) return [0, 0];
  const p = k/n, d = 1 + z*z/n, c = p + z*z/(2*n), w = z*Math.sqrt(p*(1-p)/n + z*z/(4*n*n));
  return [(c-w)/d, (c+w)/d];
}

function variance(xs, mean){
  return xs.length > 1 ? xs.reduce((a,b) => a + (b-mean)**2, 0) / (xs.length-1) : 0;
}

function side(list){
  const n = list.length, hits = list.filter(e => e.r === 'hit'), dm = hits.map(e => e.d);
  const mean = dm.length ? dm.reduce((a,b) => a+b, 0) / dm.length : 0;
  const v = variance(dm, mean);
  const sorted = [...dm].sort((a,b) => a-b);
  return {n, hits: hits.length, rate: n ? hits.length/n : 0, ci: wilson(hits.length, n),
    mean, variance: v, half: dm.length > 1 ? 1.96*Math.sqrt(v/dm.length) : 0,
    median: sorted.length ? sorted[Math.floor((sorted.length-1)/2)] : 0, max: sorted.length ? sorted[sorted.length-1] : 0};
}

// Abramowitz & Stegun 7.1.26
function erfc(x){
  const t = 1 / (1 + 0.3275911*x);
  return t*(0.254829592 + t*(-0.284496736 + t*(1.421413741 + t*(-1.453152027 + t*1.061405429)))) * Math.exp(-x*x);
}
const pTwoSided = z => erfc(Math.abs(z) / Math.SQRT2);

const pct = x => (100*x).toFixed(1) + '%';
const rng = ci => `${(100*ci[0]).toFixed(0)}–${(100*ci[1]).toFixed(0)}%`;

function parseCSV(text){
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i+1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i+1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(f => f !== '')) rows.push(row);
  const [head, ...body] = rows;
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// ---------- regression ----------
const dot = (a, b) => a.reduce((s, v, i) => s + v*b[i], 0);

function invert(M){
  const n = M.length, A = M.map((r, i) => [...r, ...Array.from({length: n}, (_, j) => +(i === j))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c+1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-10) return null;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c];
    for (let j = 0; j < 2*n; j++) A[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c && A[r][c]) {
      const f = A[r][c];
      for (let j = 0; j < 2*n; j++) A[r][j] -= f*A[c][j];
    }
  }
  return A.map(r => r.slice(n));
}

const mean = v => v.reduce((a, b) => a+b, 0) / v.length;
const median = v => { const s = [...v].sort((a, b) => a-b); return s[Math.floor((s.length-1)/2)]; };
const sigmoid = t => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, t))));
const quad = (g, C) => g.reduce((s, gi, i) => s + gi*dot(C[i], g), 0);

function corr(a, b){
  const ma = mean(a), mb = mean(b);
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) { const da = a[i]-ma, db = b[i]-mb; sab += da*db; saa += da*da; sbb += db*db; }
  return sab / Math.sqrt(saa*sbb);
}

// Fits y on `factors` + mob_level, plus factor x mob_level terms so a factor's effect can change with mob level.
// rows: [{x: {name: number}, y}], y is 0/1 when logistic.
function fitModel(rows, factors, logistic){
  const n = rows.length, out = {n, logistic, constant: [], collinear: [], features: []};
  const col = nm => rows.map(r => r.x[nm]);
  const names = [...factors, 'mob_level'];
  out.constant = names.filter(nm => new Set(col(nm)).size < 2);
  const live = names.filter(nm => !out.constant.includes(nm));
  const center = Object.fromEntries(live.map(nm => [nm, mean(col(nm))]));
  const mains = live.map(nm => ({name: nm, factor: nm, get: x => x[nm]}));
  const inters = live.includes('mob_level') ? live.filter(nm => nm !== 'mob_level').map(nm =>
    ({name: nm + ' x mob_level', factor: nm, inter: true, get: x => (x[nm]-center[nm]) * (x.mob_level-center.mob_level)})) : [];
  const kept = [], vals = new Map();
  const v = f => vals.get(f) || vals.set(f, rows.map(r => f.get(r.x))).get(f);
  for (const f of [...mains, ...inters]) {
    if (f.inter && n < 10*(kept.length + 2)) continue;
    if (new Set(v(f)).size < 2) continue;
    const twin = kept.find(k => Math.abs(corr(v(k), v(f))) > 0.95);
    if (!twin) kept.push(f);
    else if (!f.inter) out.collinear.push([f.name, twin.factor]);
  }
  out.center = center;
  if (!kept.length) return out;
  if (n < 10*(kept.length + 1)) { out.error = `Needs at least ${10*(kept.length + 1)} ${logistic ? 'swings' : 'hits'}`; return out; }
  // If the data can't pin every term down, drop interaction terms first, then the last factor, and refit.
  while (kept.length) {
    const fit = solve(kept, v, rows.map(r => r.y), logistic);
    if (fit) { out.features = kept; out.beta = fit.beta; out.cov = fit.cov; return out; }
    const j = kept.findLastIndex(f => f.inter);
    const [gone] = kept.splice(j >= 0 ? j : kept.length - 1, 1);
    if (!gone.inter) out.collinear.push([gone.factor, kept.length ? kept[kept.length - 1].factor : 'mob_level']);
  }
  out.error = 'Could not fit';
  return out;
}

function solve(kept, v, y, logistic){
  const k = kept.length + 1, n = y.length;
  const m = kept.map(f => mean(v(f))), sd = kept.map((f, j) => Math.sqrt(mean(v(f).map(x => (x-m[j])**2))));
  const X = y.map((_, i) => [1, ...kept.map((f, j) => (v(f)[i] - m[j]) / sd[j])]);
  let b = Array(k).fill(0), C = null;
  if (logistic) {
    for (let it = 0; it < 50; it++) {
      const H = Array.from({length: k}, () => Array(k).fill(0)), g = Array(k).fill(0);
      X.forEach((x, i) => {
        const p = sigmoid(dot(x, b)), w = p*(1-p);
        for (let a = 0; a < k; a++) { g[a] += x[a]*(y[i]-p); for (let c = 0; c < k; c++) H[a][c] += w*x[a]*x[c]; }
      });
      C = invert(H);
      if (!C) return null;
      const step = C.map(r => dot(r, g));
      b = b.map((bi, i) => bi + step[i]);
      if (Math.max(...step.map(Math.abs)) < 1e-8) break;
    }
  } else {
    const XtX = Array.from({length: k}, (_, a) => Array.from({length: k}, (_, c) => X.reduce((s, x) => s + x[a]*x[c], 0)));
    const inv = invert(XtX);
    if (!inv) return null;
    b = inv.map(r => dot(r, Array.from({length: k}, (_, a) => X.reduce((s, x, i) => s + x[a]*y[i], 0))));
    const s2 = X.reduce((s, x, i) => s + (y[i] - dot(x, b))**2, 0) / (n - k);
    C = inv.map(r => r.map(c => c*s2));
  }
  // Back to raw units: raw = T * standardized.
  const T = Array.from({length: k}, (_, a) => Array.from({length: k}, (_, c) =>
    a === 0 ? (c === 0 ? 1 : -m[c-1]/sd[c-1]) : (a === c ? 1/sd[a-1] : 0)));
  return {beta: T.map(r => dot(r, b)), cov: T.map(ra => T.map(rc => quad2(ra, C, rc)))};
}
const quad2 = (a, C, c) => a.reduce((s, ai, i) => s + ai*dot(C[i], c), 0);

const featureVector = (M, x) => [1, ...M.features.map(f => f.get(x))];

function predict(M, x){
  const f = featureVector(M, x), eta = dot(M.beta, f), se = Math.sqrt(quad(f, M.cov));
  return M.logistic ? {y: sigmoid(eta), lo: sigmoid(eta - 1.96*se), hi: sigmoid(eta + 1.96*se)} : {y: eta, lo: eta - 1.96*se, hi: eta + 1.96*se};
}

// Predicted outcome at x with `factor` one higher, minus at x (probability for logistic models).
function step(M, factor, x){
  if (!M.features.some(f => f.factor === factor && !f.inter)) return null;
  const f0 = featureVector(M, x), f1 = featureVector(M, {...x, [factor]: x[factor] + 1});
  // Gradient of the difference w.r.t. beta, for its standard error.
  const grad = f => M.logistic ? (p => f.map(v => v*p*(1-p)))(sigmoid(dot(M.beta, f))) : f;
  const g0 = grad(f0), g = grad(f1).map((v, i) => v - g0[i]);
  const val = f => M.logistic ? sigmoid(dot(M.beta, f)) : dot(M.beta, f);
  const d = val(f1) - val(f0), se = Math.sqrt(quad(g, M.cov));
  return {effect: d, lo: d - 1.96*se, hi: d + 1.96*se, p: se ? pTwoSided(d/se) : 1};
}

// p-value for "this factor's effect changes with mob level", or null if not tested.
function levelDependence(M, factor){
  const j = M.features.findIndex(f => f.factor === factor && f.inter);
  if (j < 0) return null;
  const se = Math.sqrt(M.cov[j+1][j+1]);
  return se ? pTwoSided(M.beta[j+1] / se) : 1;
}
