// Shared by index.html and analyze.html. Swing shape: {a:'p'|'m', k:'melee'|'ability', h:'main'|'off', r, d, c}.

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
  const cnt = r => list.filter(e => e.r === r).length;
  const mean = dm.length ? dm.reduce((a,b) => a+b, 0) / dm.length : 0;
  const v = variance(dm, mean);
  const sorted = [...dm].sort((a,b) => a-b);
  return {n, hits: hits.length, rate: n ? hits.length/n : 0, ci: wilson(hits.length, n),
    miss: cnt('miss'), dodge: cnt('dodge'), parry: cnt('parry'), block: cnt('block'),
    crits: hits.filter(e => e.c).length, mean, variance: v, half: dm.length > 1 ? 1.96*Math.sqrt(v/dm.length) : 0,
    median: sorted.length ? sorted[Math.floor((sorted.length-1)/2)] : 0, max: sorted.length ? sorted[sorted.length-1] : 0};
}

// Abramowitz & Stegun 7.1.26
function erfc(x){
  const t = 1 / (1 + 0.3275911*x);
  return t*(0.254829592 + t*(-0.284496736 + t*(1.421413741 + t*(-1.453152027 + t*1.061405429)))) * Math.exp(-x*x);
}
const pTwoSided = z => erfc(Math.abs(z) / Math.SQRT2);

// B minus A, for two side() results.
function compareRates(A, B){
  if (!A.n || !B.n) return null;
  const pool = (A.hits + B.hits) / (A.n + B.n);
  const sePool = Math.sqrt(pool*(1-pool)*(1/A.n + 1/B.n));
  const se = Math.sqrt(A.rate*(1-A.rate)/A.n + B.rate*(1-B.rate)/B.n);
  const diff = B.rate - A.rate;
  return {diff, lo: diff - 1.96*se, hi: diff + 1.96*se, p: sePool ? pTwoSided(diff/sePool) : 1};
}
function compareMeans(A, B){
  if (A.hits < 2 || B.hits < 2) return null;
  const se = Math.sqrt(A.variance/A.hits + B.variance/B.hits);
  const diff = B.mean - A.mean;
  return {diff, lo: diff - 1.96*se, hi: diff + 1.96*se, p: se ? pTwoSided(diff/se) : 1};
}

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
