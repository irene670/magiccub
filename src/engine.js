// ===== Picture-cube engine: geometry, state, matching, solving =====
// Works in browser (window.CubeEngine) and Node (module.exports).
(function (root) {
'use strict';
const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
const NRM = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] };
const UPV = { U: [0, 0, -1], R: [0, 1, 0], F: [0, 1, 0], D: [0, 0, 1], L: [0, 1, 0], B: [0, 1, 0] };
const RGT = { U: [1, 0, 0], R: [0, 0, -1], F: [1, 0, 0], D: [1, 0, 0], L: [0, 0, 1], B: [-1, 0, 0] };

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const neg = a => [-a[0], -a[1], -a[2]];
const clean = a => a.map(x => Math.round(x) + 0);

function faceOfNormal(n) { for (const f of FACES) if (eq(NRM[f], n)) return f; return null; }
function slotPos(fi) {
  const f = FACES[Math.floor(fi / 9)], i = fi % 9, r = Math.floor(i / 3), c = i % 3;
  return add(add(NRM[f], scl(RGT[f], c - 1)), scl(UPV[f], 1 - r));
}
function slotIndex(pos, n) {
  const f = faceOfNormal(n); const r = 1 - dot(pos, UPV[f]), c = 1 + dot(pos, RGT[f]);
  return FACES.indexOf(f) * 9 + r * 3 + c;
}
// quarter-turn index of an "image up" vector relative to a face's standard up (clockwise as seen from outside)
function qOf(face, up) {
  if (eq(up, UPV[face])) return 0; if (eq(up, RGT[face])) return 1;
  if (eq(up, neg(UPV[face]))) return 2; if (eq(up, neg(RGT[face]))) return 3; return -1;
}
function vecOfQ(face, q) { return [UPV[face], RGT[face], neg(UPV[face]), neg(RGT[face])][((q % 4) + 4) % 4]; }

// ---------- sticker state ----------
function solvedState() {
  const s = [];
  for (let fi = 0; fi < 54; fi++) { const f = FACES[Math.floor(fi / 9)]; s.push({ id: fi, pos: slotPos(fi), n: NRM[f].slice(), up: UPV[f].slice() }); }
  return s;
}
// rotate v clockwise (seen from outside) by 90deg about axis a
function rotCW(v, a) { return clean(add(scl(a, dot(a, v)), neg(cross(a, v)))); }
function applyMove(state, face, k) {
  const a = NRM[face]; k = ((k % 4) + 4) % 4;
  for (const st of state) {
    if (dot(st.pos, a) !== 1) continue;
    for (let i = 0; i < k; i++) { st.pos = rotCW(st.pos, a); st.n = rotCW(st.n, a); st.up = rotCW(st.up, a); }
  }
  return state;
}
function parseAlg(s) {
  const out = []; if (!s) return out;
  for (const t of s.trim().split(/\s+/)) {
    if (!t) continue; const f = t[0]; if (!FACES.includes(f)) continue;
    const k = t.length === 1 ? 1 : t[1] === '2' ? 2 : t[1] === "'" ? 3 : 1; out.push([f, k]);
  }
  return out;
}
function fmtMove(f, k) { k = ((k % 4) + 4) % 4; return f + (k === 1 ? '' : k === 2 ? '2' : "'"); }
function applyAlg(state, alg) { for (const [f, k] of (typeof alg === 'string' ? parseAlg(alg) : alg)) applyMove(state, f, k); return state; }
function cloneState(s) { return s.map(x => ({ id: x.id, pos: x.pos.slice(), n: x.n.slice(), up: x.up.slice() })); }
function bySlot(state) { const m = new Array(54); for (const st of state) m[slotIndex(st.pos, st.n)] = st; return m; }
function toFacelets(state) { const m = bySlot(state); return m.map(st => FACES[Math.floor(st.id / 9)]).join(''); }
function centerRots(state) { const m = bySlot(state); return FACES.map((f, i) => qOf(f, m[i * 9 + 4].up)); }
function isSolved(state, withCenters = true) {
  const m = bySlot(state);
  for (let i = 0; i < 54; i++) {
    const st = m[i]; if (Math.floor(st.id / 9) !== Math.floor(i / 9)) return false;
    if (i % 9 !== 4 && st.id !== i) return false;
    if (withCenters || i % 9 !== 4) { if (!eq(st.up, UPV[FACES[Math.floor(i / 9)]])) return false; }
  }
  return true;
}
// simplify consecutive same-face moves (and commuting opposite pairs)
const OPP = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };
function simplify(moves) {
  let m = moves.map(x => [x[0], ((x[1] % 4) + 4) % 4]).filter(x => x[1]);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < m.length; i++) {
      // look ahead past one commuting opposite-face move
      for (let j = i + 1; j < m.length && j <= i + 2; j++) {
        if (m[j][0] === m[i][0]) {
          if (j === i + 2 && m[i + 1][0] !== OPP[m[i][0]]) break;
          const k = (m[i][1] + m[j][1]) % 4; m.splice(j, 1);
          if (k) m[i][1] = k; else m.splice(i, 1);
          changed = true; break;
        }
        if (m[j][0] !== OPP[m[i][0]]) break;
      }
      if (changed) break;
    }
  }
  return m;
}

// ---------- piece geometry ----------
function det3(a, b, c) { return dot(a, cross(b, c)); }
function matFromCols(a, b, c) { return [a, b, c]; } // columns
function mulMT(Ncols, Mcols, v) { // (N * M^T) v where N,M given as column lists, M orthonormal
  const t = [dot(Mcols[0], v), dot(Mcols[1], v), dot(Mcols[2], v)];
  return clean(add(add(scl(Ncols[0], t[0]), scl(Ncols[1], t[1])), scl(Ncols[2], t[2])));
}
const CORNERS = [], EDGES = [];
(function buildPieces() {
  const seen = {};
  for (let fi = 0; fi < 54; fi++) {
    const p = slotPos(fi); const nz = p.filter(x => x !== 0).length; const key = p.join(',');
    if (nz < 2 || seen[key]) continue; seen[key] = 1;
    const normals = [0, 1, 2].filter(ax => p[ax] !== 0).map(ax => { const v = [0, 0, 0]; v[ax] = p[ax]; return v; });
    if (nz === 3) {
      if (det3(normals[0], normals[1], normals[2]) < 0) normals.reverse();
      CORNERS.push({ pos: p, normals, fac: normals.map(n => slotIndex(p, n)) });
    } else EDGES.push({ pos: p, normals, fac: normals.map(n => slotIndex(p, n)) });
  }
})();
// For slot piece s holding ref piece c with twist t: list of [slotFacelet, refFacelet, q, upVec]
function placement(slot, ref, t, isCorner) {
  const k = slot.normals.length; const out = [];
  const sN = slot.normals, rN = []; for (let i = 0; i < k; i++) rN.push(ref.normals[(i + t) % k]);
  const sCols = k === 3 ? sN : [sN[0], sN[1], cross(sN[0], sN[1])];
  const rCols = k === 3 ? rN : [rN[0], rN[1], cross(rN[0], rN[1])];
  for (let i = 0; i < k; i++) {
    const refFac = slotIndex(ref.pos, rN[i]); const refFace = FACES[Math.floor(refFac / 9)];
    const up = mulMT(sCols, rCols, UPV[refFace]);
    const slotFac = slotIndex(slot.pos, sN[i]); const slotFace = FACES[Math.floor(slotFac / 9)];
    out.push([slotFac, refFac, qOf(slotFace, up), up]);
  }
  return out;
}
const CPL = [], EPL = []; // CPL[s][c][t], EPL[s][e][t]
for (let s = 0; s < 8; s++) { CPL.push([]); for (let c = 0; c < 8; c++) { CPL[s].push([]); for (let t = 0; t < 3; t++) CPL[s][c].push(placement(CORNERS[s], CORNERS[c], t, true)); } }
for (let s = 0; s < 12; s++) { EPL.push([]); for (let e = 0; e < 12; e++) { EPL[s].push([]); for (let t = 0; t < 2; t++) EPL[s][e].push(placement(EDGES[s], EDGES[e], t, false)); } }

// ---------- Hungarian (min cost assignment) ----------
function hungarian(C) {
  const n = C.length, INF = 1e18; const u = new Float64Array(n + 1), v = new Float64Array(n + 1), p = new Int32Array(n + 1), way = new Int32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0; const minv = new Float64Array(n + 1).fill(INF); const used = new Uint8Array(n + 1);
    do {
      used[j0] = 1; const i0 = p[j0]; let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) {
        const cur = C[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) { if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const ans = new Array(n); let cost = 0; for (let j = 1; j <= n; j++) { ans[p[j] - 1] = j - 1; }
  for (let i = 0; i < n; i++) cost += C[i][ans[i]];
  return { assign: ans, cost };
}

// ---------- image patches & descriptors ----------
// patch: {S, data: Float32Array(S*S*3)} RGB 0..1
function rotPatchCW(p) {
  const S = p.S, d = new Float32Array(S * S * 3);
  for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) {
    const src = ((S - 1 - c) * S + r) * 3, dst = (r * S + c) * 3;
    d[dst] = p.data[src]; d[dst + 1] = p.data[src + 1]; d[dst + 2] = p.data[src + 2];
  }
  return { S, data: d };
}
const W = { struct: 1.0, chroma: 6.0, bright: 1.5, color: 2.5 };
function descriptor(p, gain, live) {
  const S = p.S, D = p.data, g = gain || [1, 1, 1];
  const G = 6, cs = S / G; const out = [];
  const gray = new Float32Array(G * G), rr = new Float32Array(G * G), gg = new Float32Array(G * G), bb = new Float32Array(G * G);
  for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) {
    const i = (r * S + c) * 3, cell = Math.min(G - 1, Math.floor(r / cs)) * G + Math.min(G - 1, Math.floor(c / cs));
    const R = D[i] * g[0], Gg = D[i + 1] * g[1], B = D[i + 2] * g[2];
    rr[cell] += R; gg[cell] += Gg; bb[cell] += B; gray[cell] += 0.299 * R + 0.587 * Gg + 0.114 * B;
  }
  let m = 0; for (const x of gray) m += x; m /= gray.length;
  let sd = 0; for (const x of gray) sd += (x - m) * (x - m); sd = Math.sqrt(sd / gray.length) + 1e-3 * m + 1e-6;
  const nrm = 1 / Math.sqrt(gray.length);
  for (let i = 0; i < gray.length; i++) out.push(W.struct * nrm * (gray[i] - m) / sd);
  const cnt = cs * cs;
  for (let i = 0; i < gray.length; i++) {
    const s = rr[i] + gg[i] + bb[i] + 1e-6 * cnt; const wt = Math.min(1, 4 * s / (3 * cnt)); // de-weight dark cells
    out.push(W.chroma * nrm * wt * (rr[i] / s - 1 / 3), W.chroma * nrm * wt * (bb[i] / s - 1 / 3));
  }
  // absolute colour (after gain normalisation) – coarse
  const wc = live ? 0 : W.color, wb = live ? 0 : W.bright;
  for (let i = 0; i < gray.length; i++) out.push(wc * nrm * rr[i] / cnt, wc * nrm * gg[i] / cnt, wc * nrm * bb[i] / cnt);
  out.push(wb * m / cnt);
  return Float32Array.from(out);
}
function dist2(a, b) { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return s; }
function patchMean(p) { const m = [0, 0, 0]; const n = p.S * p.S; for (let i = 0; i < n; i++) { m[0] += p.data[i * 3]; m[1] += p.data[i * 3 + 1]; m[2] += p.data[i * 3 + 2]; } return m.map(x => x / n); }

// Reference = 54 patches in standard orientation (index = facelet index)
function buildReference(refPatches) {
  const desc = refPatches.map(p => { const r = []; let q = p; for (let k = 0; k < 4; k++) { r.push(descriptor(q)); q = rotPatchCW(q); } return r; });
  const ldesc = refPatches.map(p => { const r = []; let q = p; for (let k = 0; k < 4; k++) { r.push(descriptor(q, null, true)); q = rotPatchCW(q); } return r; });
  const mean = [0, 0, 0]; refPatches.forEach(p => { const m = patchMean(p); for (let i = 0; i < 3; i++) mean[i] += m[i] / 54; });
  // typical distance scale (non-identical stickers)
  const ds = []; for (let i = 0; i < 54; i += 5) for (let j = i + 1; j < 54; j += 7) ds.push(dist2(desc[i][0], desc[j][0]));
  ds.sort((a, b) => a - b);
  const ls = []; for (let i = 0; i < 54; i += 5) for (let j = i + 1; j < 54; j += 7) ls.push(dist2(ldesc[i][0], ldesc[j][0]));
  ls.sort((a, b) => a - b);
  return { patches: refPatches, desc, ldesc, mean, scale: ds[Math.floor(ds.length * 0.25)] || 1, lscale: ls[Math.floor(ls.length * 0.25)] || 1 };
}

// position mapping: captured image = standard rotated clockwise k times. std pos p -> captured pos
function capPos(p, k) { let r = Math.floor(p / 3), c = p % 3; for (let i = 0; i < k; i++) { const nr = c, nc = 2 - r; r = nr; c = nc; } return r * 3 + c; }

// Live: identify which face a captured face is (by centre), and quality measures
function identifyFace(ref, patches9) {
  const d = patches9.map(p => descriptor(p, null, true));
  const centre = d[4]; const scores = [];
  for (let f = 0; f < 6; f++) { let best = 1e18; for (let q = 0; q < 4; q++) best = Math.min(best, dist2(centre, ref.ldesc[f * 9 + 4][q])); scores.push(best); }
  const order = scores.map((s, i) => [s, i]).sort((a, b) => a[0] - b[0]);
  let fit = 0;
  for (let i = 0; i < 9; i++) { let b = 1e18; for (let j = 0; j < 54; j++) for (let q = 0; q < 4; q++) { const v = dist2(d[i], ref.ldesc[j][q]); if (v < b) b = v; } fit += b; }
  fit /= 9;
  return { face: order[0][1], scores: scores.map(x => x / ref.lscale), dist: order[0][0] / ref.lscale, ratio: order[0][0] / (order[1][0] + 1e-9), fit: fit / ref.lscale, desc: d };
}
// similarity of two captured faces (min over 4 whole-face rotations), live-descriptor units
function faceSimilarity(ref, A, B) {
  const dA = A.map(p => descriptor(p, null, true));
  const rB = B.map(p => { const r = []; let q = p; for (let k = 0; k < 4; k++) { r.push(descriptor(q, null, true)); q = rotPatchCW(q); } return r; });
  let best = 1e18;
  for (let k = 0; k < 4; k++) { let v = 0; for (let p = 0; p < 9; p++) v += dist2(dA[capPos(p, k)], rB[p][k]); best = Math.min(best, v / 9); }
  return best / ref.lscale;
}
// Global gain: scanned stickers are a permutation of reference stickers -> equal means
function globalGain(ref, caps) {
  const m = [0, 0, 0]; caps.forEach(c => c.patches.forEach(p => { const pm = patchMean(p); for (let i = 0; i < 3; i++) m[i] += pm[i] / 54; }));
  return m.map((x, i) => ref.mean[i] / (x + 1e-6));
}

// caps: array of 6 {patches:[9 patches]} (captured images, any face order / rotation)
// returns {state, faceOfCap, rotOfCap, cost, perSticker, valid, problems}
function reconstruct(ref, caps, opts) {
  opts = opts || {};
  const gain = opts.noGain ? null : globalGain(ref, caps);
  // base distance table B[i][capPos][refFac][q]
  const B = caps.map(c => c.patches.map(p => { const d = descriptor(p, gain); return ref.desc.map(rd => rd.map(x => dist2(d, x))); }));
  // 1) faces by centre (assignment)
  const CC = caps.map((c, i) => FACES.map((f, fi) => Math.min(...[0, 1, 2, 3].map(q => B[i][4][fi * 9 + 4][q]))));
  const fa = opts.faceOfCap ? { assign: opts.faceOfCap } : hungarian(CC);
  const capOfFace = new Array(6); fa.assign.forEach((f, i) => capOfFace[f] = i);
  // slot cost lookup given rotations
  function slotCost(rots, slotFac, refFac, q) {
    const f = Math.floor(slotFac / 9), p = slotFac % 9, i = capOfFace[f], k = rots[f];
    return B[i][capPos(p, k)][refFac][(q + k) % 4];
  }
  function evaluate(rots, wantDetail) {
    const Cc = [], Ct = [];
    for (let s = 0; s < 8; s++) { Cc.push([]); Ct.push([]); for (let c = 0; c < 8; c++) { let b = 1e18, bt = 0; for (let t = 0; t < 3; t++) { let v = 0; for (const [sf, rf, q] of CPL[s][c][t]) v += slotCost(rots, sf, rf, q); if (v < b) { b = v; bt = t; } } Cc[s].push(b); Ct[s].push(bt); } }
    const Ec = [], Et = [];
    for (let s = 0; s < 12; s++) { Ec.push([]); Et.push([]); for (let e = 0; e < 12; e++) { let b = 1e18, bt = 0; for (let t = 0; t < 2; t++) { let v = 0; for (const [sf, rf, q] of EPL[s][e][t]) v += slotCost(rots, sf, rf, q); if (v < b) { b = v; bt = t; } } Ec[s].push(b); Et[s].push(bt); } }
    const hc = hungarian(Cc), he = hungarian(Ec);
    let cost = hc.cost + he.cost; const cq = [];
    for (let f = 0; f < 6; f++) { let b = 1e18, bq = 0; for (let q = 0; q < 4; q++) { const v = slotCost(rots, f * 9 + 4, f * 9 + 4, q); if (v < b) { b = v; bq = q; } } cost += b; cq.push(bq); }
    if (!wantDetail) return cost;
    return { cost, corners: hc.assign.map((c, s) => [c, Ct[s][c]]), edges: he.assign.map((e, s) => [e, Et[s][e]]), cq };
  }
  // 2) rotation search: 4^6
  let best = null; const all = [];
  for (let code = 0; code < 4096; code++) {
    const rots = [0, 1, 2, 3, 4, 5].map(f => (code >> (2 * f)) & 3);
    const c = evaluate(rots, false); all.push([c, code]);
  }
  all.sort((a, b) => a[0] - b[0]);
  const candidates = all.slice(0, opts.tryTop || 12).map(([c, code]) => [0, 1, 2, 3, 4, 5].map(f => (code >> (2 * f)) & 3));
  let firstDetail = null;
  for (const rots of candidates) {
    let det = evaluate(rots, true);
    let st = buildState(det); let chk = checkState(st);
    if (!chk.ok) { const fixed = repair(det, rots); if (fixed) { det = fixed.det; st = buildState(det); chk = checkState(st); } }
    const res = { state: st, det, rots, chk };
    if (!firstDetail) firstDetail = res;
    if (chk.ok) { best = res; break; }
  }
  const r = best || firstDetail;
  // per-sticker confidence (normalised)
  const perSticker = new Array(54).fill(0);
  function fill(list, PL) { list.forEach(([c, t], s) => { for (const [sf, rf, q] of PL[s][c][t]) perSticker[sf] = slotCost(r.rots, sf, rf, q) / ref.scale; }); }
  fill(r.det.corners, CPL); fill(r.det.edges, EPL);
  for (let f = 0; f < 6; f++) perSticker[f * 9 + 4] = slotCost(r.rots, f * 9 + 4, f * 9 + 4, r.det.cq[f]) / ref.scale;
  return { state: r.state, faceOfCap: fa.assign, rotOfFace: r.rots, capOfFace, cost: r.det.cost / ref.scale, perSticker, valid: r.chk.ok, problems: r.chk.problems, gain };

  function buildState(det) {
    const st = [];
    det.corners.forEach(([c, t], s) => { for (const [sf, rf, q, up] of CPL[s][c][t]) st.push({ id: rf, pos: slotPos(sf), n: NRM[FACES[Math.floor(sf / 9)]].slice(), up: up.slice() }); });
    det.edges.forEach(([e, t], s) => { for (const [sf, rf, q, up] of EPL[s][e][t]) st.push({ id: rf, pos: slotPos(sf), n: NRM[FACES[Math.floor(sf / 9)]].slice(), up: up.slice() }); });
    for (let f = 0; f < 6; f++) st.push({ id: f * 9 + 4, pos: slotPos(f * 9 + 4), n: NRM[FACES[f]].slice(), up: vecOfQ(FACES[f], det.cq[f]) });
    return st;
  }
  function pieceCost(rots, PL, s, c, t) { let v = 0; for (const [sf, rf, q] of PL[s][c][t]) v += slotCost(rots, sf, rf, q); return v; }
  // try cheapest local changes that make the cube legal
  function repair(det, rots) {
    const base = JSON.parse(JSON.stringify(det));
    const options = [];
    const tryDet = (d, extra) => { const s = buildState(d); if (checkState(s).ok) options.push([extra, d]); };
    // single corner twist / edge flip / centre quarter / swaps
    const cand = [];
    for (let s = 0; s < 8; s++) for (let t = 0; t < 3; t++) if (t !== base.corners[s][1]) cand.push(['ct', s, t]);
    for (let s = 0; s < 12; s++) if (true) cand.push(['ef', s, 1 - base.edges[s][1]]);
    for (let f = 0; f < 6; f++) for (const dq of [1, 3]) cand.push(['cq', f, (base.cq[f] + dq) % 4]);
    for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) cand.push(['es', a, b]);
    for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) cand.push(['cs', a, b]);
    const applyC = (d, cnd) => {
      const [k, a, b] = cnd;
      if (k === 'ct') d.corners[a][1] = b; else if (k === 'ef') d.edges[a][1] = b; else if (k === 'cq') d.cq[a] = b;
      else if (k === 'es') { const t = d.edges[a][0]; d.edges[a][0] = d.edges[b][0]; d.edges[b][0] = t; bestT(d.edges, a, EPL, 2); bestT(d.edges, b, EPL, 2); }
      else if (k === 'cs') { const t = d.corners[a][0]; d.corners[a][0] = d.corners[b][0]; d.corners[b][0] = t; bestT(d.corners, a, CPL, 3); bestT(d.corners, b, CPL, 3); }
    };
    function bestT(list, s, PL, n) { let b = 1e18, bt = 0; for (let t = 0; t < n; t++) { const v = pieceCost(rots, PL, s, list[s][0], t); if (v < b) { b = v; bt = t; } } list[s][1] = bt; }
    const costOf = d => { let v = 0; d.corners.forEach(([c, t], s) => v += pieceCost(rots, CPL, s, c, t)); d.edges.forEach(([e, t], s) => v += pieceCost(rots, EPL, s, e, t)); for (let f = 0; f < 6; f++) v += slotCost(rots, f * 9 + 4, f * 9 + 4, d.cq[f]); return v; };
    // up to 3 combined changes, cheapest first (greedy over sorted singles)
    const singles = cand.map(c => { const d = JSON.parse(JSON.stringify(base)); applyC(d, c); return [costOf(d) - base.cost, c]; }).sort((a, b) => a[0] - b[0]).slice(0, 40);
    let bestOpt = null;
    const consider = (list) => { const d = JSON.parse(JSON.stringify(base)); for (const c of list) applyC(d, c); if (checkState(buildState(d)).ok) { const v = costOf(d); if (!bestOpt || v < bestOpt[0]) bestOpt = [v, d]; } };
    for (let i = 0; i < singles.length; i++) { consider([singles[i][1]]); for (let j = i + 1; j < singles.length; j++) { consider([singles[i][1], singles[j][1]]); } }
    if (!bestOpt) for (let i = 0; i < 20; i++) for (let j = i + 1; j < 20; j++) for (let l = j + 1; l < 20; l++) consider([singles[i][1], singles[j][1], singles[l][1]]);
    if (!bestOpt) return null; bestOpt[1].cost = bestOpt[0]; return { det: bestOpt[1] };
  }
}

// legality check incl. picture-centre parity
function checkState(state) {
  const problems = []; const m = bySlot(state);
  if (m.some(x => !x)) return { ok: false, problems: ['slots'] };
  const ids = new Set(state.map(s => s.id)); if (ids.size !== 54) problems.push('duplicate');
  // corners
  const cPerm = [], cTw = [];
  for (let s = 0; s < 8; s++) {
    const fac = CORNERS[s].fac; const pids = fac.map(f => m[f].id);
    let found = -1, tw = 0;
    for (let c = 0; c < 8 && found < 0; c++) for (let t = 0; t < 3; t++) { if (CPL[s][c][t].every(([sf, rf]) => m[sf].id === rf)) { found = c; tw = t; break; } }
    if (found < 0) { problems.push('corner'); return { ok: false, problems }; }
    cPerm.push(found); cTw.push(tw);
  }
  const ePerm = [], eFl = [];
  for (let s = 0; s < 12; s++) {
    let found = -1, tw = 0;
    for (let e = 0; e < 12 && found < 0; e++) for (let t = 0; t < 2; t++) { if (EPL[s][e][t].every(([sf, rf]) => m[sf].id === rf)) { found = e; tw = t; break; } }
    if (found < 0) { problems.push('edge'); return { ok: false, problems }; }
    ePerm.push(found); eFl.push(tw);
  }
  if (new Set(cPerm).size !== 8 || new Set(ePerm).size !== 12) problems.push('perm');
  if (cTw.reduce((a, b) => a + b, 0) % 3) problems.push('twist');
  if (eFl.reduce((a, b) => a + b, 0) % 2) problems.push('flip');
  const par = p => { let x = 0; const v = p.slice(); for (let i = 0; i < v.length; i++) while (v[i] !== i) { const j = v[i]; [v[i], v[j]] = [v[j], v[i]]; x ^= 1; } return x; };
  const pc = par(cPerm), pe = par(ePerm);
  if (pc !== pe) problems.push('parity');
  const cr = centerRots(state); if (cr.reduce((a, b) => a + b, 0) % 2 !== pc) problems.push('centreParity');
  return { ok: problems.length === 0, problems };
}

// ---------- centre-orientation fixes ----------
// algs[pattern] where pattern is centre delta vector (URFDLB) mod 4, found by offline search
let CENTER_ALGS = {"h1": "U L R U2 R' L' U R L U2 R' L'", "h2": "U R D' U' R2 U D R U' D' R2 D", "hh": "U2 R2 F U2 F2 U2 F2 U2 F' R2 U2 F2 R2 F2", "hh2": "U R2 U2 R2 U2 R2 U' F2 R2 U2 F2 U2 R2 F2", "q11": "U R2 U2 R U2 R2 U' R2 U2 R U2 R2 U R2 U2 R' U2 R2", "q31": "R U R2 U2 R U2 R2 U R2 U R' U2 R' U2 R2 U' R2 U2 R' U'"};
function setCenterAlgs(a) { CENTER_ALGS = a; }
// Rotate an alg by a whole-cube symmetry: map faces
function remapAlg(alg, map) { return parseAlg(alg).map(([f, k]) => [map[f], k]); }
// 24 rotations as face maps
const ROTS = (function () {
  const x = { U: 'F', F: 'D', D: 'B', B: 'U', R: 'R', L: 'L' }; // cube rotation x: U->F? (where U face goes)
  const y = { F: 'L', L: 'B', B: 'R', R: 'F', U: 'U', D: 'D' };
  const compose = (a, b) => { const r = {}; for (const f of FACES) r[f] = b[a[f]]; return r; };
  const id = {}; FACES.forEach(f => id[f] = f);
  const seen = {}, out = []; const q = [id];
  while (q.length) { const m = q.shift(); const k = FACES.map(f => m[f]).join(''); if (seen[k]) continue; seen[k] = 1; out.push(m); q.push(compose(m, x), compose(m, y)); }
  return out;
})();
// 24 proper rotation matrices (as functions on integer vectors)
const CUBE_ROTS = (function () {
  const out = []; const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0], [0, 0, -1]];
  for (const a of axes) for (const b of axes) {
    if (dot(a, b) !== 0) continue; const c = cross(a, b);
    out.push({ apply: v => [a[0] * v[0] + b[0] * v[1] + c[0] * v[2], a[1] * v[0] + b[1] * v[1] + c[1] * v[2], a[2] * v[0] + b[2] * v[1] + c[2] * v[2]] });
  }
  // identity first
  out.sort((p, q) => (eq(q.apply([1, 2, 3]), [1, 2, 3]) ? 1 : 0) - (eq(p.apply([1, 2, 3]), [1, 2, 3]) ? 1 : 0));
  return out;
})();
// expand base algs to all orientations; table: key "dU,dR,dF,dD,dL,dB" -> shortest move list
let FIX_TABLE = null;
function buildFixTable() {
  FIX_TABLE = {};
  const put = (vec, moves) => { const k = vec.join(','); if (!FIX_TABLE[k] || FIX_TABLE[k].length > moves.length) FIX_TABLE[k] = moves; };
  for (const alg of Object.values(CENTER_ALGS)) {
    for (const R of ROTS) {
      const moves = remapAlg(alg, R);
      for (const inv of [false, true]) {
        const mv = inv ? moves.slice().reverse().map(([f, k]) => [f, (4 - k) % 4]) : moves;
        const vec = [0, 0, 0, 0, 0, 0]; mv.forEach(([f, k]) => { vec[FACES.indexOf(f)] = (vec[FACES.indexOf(f)] + k) % 4; });
        // verify
        const st = applyAlg(solvedState(), mv); if (!isSolved(st, false)) continue;
        put(vec, mv);
      }
    }
  }
  return FIX_TABLE;
}
// Dijkstra over all 4096 centre-delta vectors: shortest combination of table entries
let FIX_ALL = null;
function buildFixAll() {
  if (!FIX_TABLE) buildFixTable();
  const enc = v => v.reduce((a, x, i) => a + (x << (2 * i)), 0);
  const entries = Object.entries(FIX_TABLE).map(([k, m]) => [k.split(',').map(Number), m]);
  const dist = new Array(4096).fill(Infinity), prev = new Array(4096).fill(null);
  dist[0] = 0; const done = new Uint8Array(4096);
  for (;;) {
    let u = -1, b = Infinity; for (let i = 0; i < 4096; i++) if (!done[i] && dist[i] < b) { b = dist[i]; u = i; }
    if (u < 0) break; done[u] = 1;
    const uv = [0, 1, 2, 3, 4, 5].map(i => (u >> (2 * i)) & 3);
    for (const [e, m] of entries) {
      const w = enc(uv.map((x, i) => (x + e[i]) % 4)); const nd = b + m.length;
      if (nd < dist[w]) { dist[w] = nd; prev[w] = [u, m]; }
    }
  }
  FIX_ALL = { dist, prev, enc };
}
function centerFix(need) {
  if (!FIX_ALL) buildFixAll();
  let w = FIX_ALL.enc(need); if (FIX_ALL.dist[w] === Infinity) return null;
  const parts = []; while (w !== 0) { const [u, m] = FIX_ALL.prev[w]; parts.push(m); w = u; }
  return simplify([].concat(...parts.reverse()));
}

// ---------- solve ----------
// solver: function(facelets) -> iterator of solution strings (min2phase)
function solve(state, min2phase, opts) {
  opts = opts || {};
  const cr = centerRots(state);
  const sols = [];
  const t0 = Date.now();
  // solve the same position seen from all 24 whole-cube orientations -> different solutions
  const PRE = [[]]; for (const f of FACES) for (const k of [1, 2, 3]) PRE.push([[f, k]]);
  outer: for (const pre of PRE) for (const g of CUBE_ROTS) {
    if (sols.length && Date.now() - t0 > (opts.timeMs || 2500)) break outer;
    const st = applyAlg(cloneState(state), pre).map(x => ({ id: x.id, pos: g.apply(x.pos), n: g.apply(x.n), up: g.apply(x.up) }));
    const m = bySlot(st); const relabel = {};
    for (let f = 0; f < 6; f++) { const c = m[f * 9 + 4]; relabel[FACES[Math.floor(c.id / 9)]] = FACES[f]; }
    const fac = m.map(x => relabel[FACES[Math.floor(x.id / 9)]]).join('');
    const sol = new min2phase.Search().solution(fac, opts.maxDepth || 21, 1e9, 0, 0);
    if (/Error/.test(sol)) { if (!sols.length && g === CUBE_ROTS[0]) return { error: sol }; continue; }
    // move on rotated face Y == physical move on face X with g(N[X]) = N[Y]
    sols.push(pre.concat(parseAlg(sol).map(([f, k]) => [FACES.find(X => eq(g.apply(NRM[X]), NRM[f])), k])));
  }
  if (!sols.length) return { error: 'no solution' };
  let best = null;
  for (const mv of sols) {
    const net = [0, 0, 0, 0, 0, 0]; mv.forEach(([f, k]) => net[FACES.indexOf(f)] += k);
    const need = FACES.map((f, i) => ((-(cr[i] + net[i])) % 4 + 8) % 4);
    const fix = centerFix(need); if (!fix) continue;
    const full = simplify(mv.concat(fix));
    if (!best || full.length < best.moves.length) best = { moves: full, base: mv.length, fix: fix.length };
  }
  if (!best) return { error: 'centre fix failed' };
  // verify
  const st = applyAlg(cloneState(state), best.moves);
  best.verified = isSolved(st, true);
  return best;
}

// library mode for a cube held the guided way: re-orient the reference (a solved-cube photo set) so its
// frame matches how the customer held the cube (captures given in FACES order: U R F D L B as held)
function libraryHold(refPats, caps, opts) {
  opts = opts || {};
  const ref0 = buildReference(refPats);
  const rec0 = reconstruct(ref0, caps);
  const g = CUBE_ROTS.find(G => rec0.faceOfCap.every((rf, i) => eq(G.apply(NRM[FACES[rf]]), NRM[FACES[i]])));
  if (!g) return { rec: rec0, rec0, ok: false, reason: rec0.valid ? 'centres' : 'invalid' };
  const m = bySlot(solvedState().map(x => ({ id: x.id, pos: g.apply(x.pos), n: g.apply(x.n), up: g.apply(x.up) })));
  const map = [], pats = [];
  for (let k = 0; k < 54; k++) { const q = qOf(FACES[Math.floor(k / 9)], m[k].up); map.push([m[k].id, q]); let p = refPats[m[k].id]; for (let i = 0; i < q; i++) p = rotPatchCW(p); pats.push(p); }
  const ref = buildReference(pats);
  const rec = reconstruct(ref, caps, { faceOfCap: [0, 1, 2, 3, 4, 5] });
  return { rec, map, ok: rec.valid, rec0 };
}
const api = { libraryHold, CUBE_ROTS, faceSimilarity, FACES, NRM, UPV, RGT, CORNERS, EDGES, CPL, EPL, slotPos, slotIndex, qOf, vecOfQ, solvedState, applyMove, applyAlg, parseAlg, fmtMove, cloneState, bySlot, toFacelets, centerRots, isSolved, simplify, hungarian, rotPatchCW, descriptor, dist2, buildReference, capPos, identifyFace, reconstruct, checkState, setCenterAlgs, buildFixTable, centerFix, solve, ROTS, W };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CubeEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
// ---- shared patch extraction (RGBA buffer -> 9 patches) ----
(function(){
  function extractPatches(rgba, W, H, x0, y0, size, S, margin) {
    S = S || 12; margin = margin == null ? 0.16 : margin;
    const cell = size / 3, out = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const cx0 = x0 + c * cell + cell * margin, cy0 = y0 + r * cell + cell * margin, cs = cell * (1 - 2 * margin);
      const d = new Float32Array(S * S * 3);
      for (let pr = 0; pr < S; pr++) for (let pc = 0; pc < S; pc++) {
        const ax = cx0 + pc * cs / S, ay = cy0 + pr * cs / S, bx = ax + cs / S, by = ay + cs / S;
        let R = 0, G = 0, B = 0, n = 0;
        const step = Math.max(1, (bx - ax) / 3);
        for (let yy = ay; yy < by; yy += step) for (let xx = ax; xx < bx; xx += step) {
          const ix = Math.min(W - 1, Math.max(0, xx | 0)), iy = Math.min(H - 1, Math.max(0, yy | 0)); const o = (iy * W + ix) * 4;
          R += rgba[o]; G += rgba[o + 1]; B += rgba[o + 2]; n++;
        }
        const o = (pr * S + pc) * 3; d[o] = R / n / 255; d[o + 1] = G / n / 255; d[o + 2] = B / n / 255;
      }
      out.push({ S, data: d });
    }
    return out;
  }
  const E = (typeof module !== 'undefined' && module.exports) ? module.exports : (typeof window !== 'undefined' ? window.CubeEngine : globalThis.CubeEngine);
  E.extractPatches = extractPatches;
})();
// ---- registration: refine the crop box so stickers line up with reference stickers ----
(function(){
  const E = (typeof module !== 'undefined' && module.exports) ? module.exports : (typeof window !== 'undefined' ? window.CubeEngine : globalThis.CubeEngine);
  function fitOf(ref, patches) {
    let fit = 0;
    for (const p of patches) { const d = E.descriptor(p, null, true); let b = 1e18; for (let j = 0; j < 54; j++) for (let q = 0; q < 4; q++) { const v = E.dist2(d, ref.ldesc[j][q]); if (v < b) b = v; } fit += b; }
    return fit / 9 / ref.lscale;
  }
  function refineBox(ref, rgba, W, H, box, opts) {
    opts = opts || {}; let cur = { x: box.x, y: box.y, s: box.s };
    let best = fitOf(ref, E.extractPatches(rgba, W, H, cur.x, cur.y, cur.s));
    const R = opts.range == null ? 0.09 : opts.range, G = opts.grid || 0.03;
    for (const sc of [0.94, 1, 1.06]) for (let oy = -R; oy <= R + 1e-9; oy += G) for (let ox = -R; ox <= R + 1e-9; ox += G) {
      const s2 = box.s * sc, c = { x: box.x + ox * box.s - (s2 - box.s) / 2, y: box.y + oy * box.s - (s2 - box.s) / 2, s: s2 };
      const f = fitOf(ref, E.extractPatches(rgba, W, H, c.x, c.y, c.s));
      if (f < best) { best = f; cur = c; }
    }
    best = fitOf(ref, E.extractPatches(rgba, W, H, cur.x, cur.y, cur.s));
    let step = box.s * (opts.step || 0.02); const minStep = box.s * 0.006; let iter = 0;
    while (step >= minStep && iter < 80) {
      iter++; let improved = false;
      const cands = [[step, 0, 0], [-step, 0, 0], [0, step, 0], [0, -step, 0], [-step / 2, -step / 2, step], [step / 2, step / 2, -step]];
      for (const [dx, dy, ds] of cands) {
        const c = { x: cur.x + dx, y: cur.y + dy, s: cur.s + ds };
        if (Math.abs(c.s - box.s) > box.s * 0.15 || Math.abs(c.x - box.x) > box.s * 0.15 || Math.abs(c.y - box.y) > box.s * 0.15) continue;
        const f = fitOf(ref, E.extractPatches(rgba, W, H, c.x, c.y, c.s));
        if (f < best - 1e-6) { best = f; cur = c; improved = true; break; }
      }
      if (!improved) step /= 2;
    }
    return { box: cur, fit: best, patches: E.extractPatches(rgba, W, H, cur.x, cur.y, cur.s) };
  }
  E.fitOf = fitOf; E.refineBox = refineBox;
})();
// mean within-sticker contrast: a flat wall/desk is ~0.01, a picture face is ~0.1
(function(){ const E = (typeof module !== 'undefined' && module.exports) ? module.exports : (typeof window !== 'undefined' ? window.CubeEngine : globalThis.CubeEngine);
  E.texture = function(pats){ let ws=0; for(const q of pats){ const n=q.S*q.S; let m=0,v=0; for(let i=0;i<n;i++){ const g=(q.data[i*3]+q.data[i*3+1]+q.data[i*3+2])/3; m+=g; v+=g*g; } m/=n; v=v/n-m*m; ws+=Math.sqrt(Math.max(0,v)); } return ws/pats.length; };
})();
// ======================= AUTO-JIGSAW (no reference images) =======================
// cells54[slotFac] = {S, data} : the sticker images as scanned, in each face's standard orientation.
// Finds where every piece belongs (and centre orientation) so that the 6 assembled pictures are as
// continuous as possible across sticker borders, subject to the cube being a legal position.
(function(){
  const E = (typeof module !== 'undefined' && module.exports) ? module.exports : (typeof window !== 'undefined' ? window.CubeEngine : globalThis.CubeEngine);
  const { CPL, EPL, FACES, slotPos, NRM, vecOfQ, hungarian, checkState, rotPatchCW } = E;
  const JW = { autoTrim: false, depth0: 2, depth1: 5, n: 24, grad: 0.3, pred: 1.2, col: 0.5, eps: 0.05, S: 48, inv: 0, abs: 0, log: false, lim: 0.22 };
  // strips of an image: side 0=top,1=right,2=bottom,3=left ; each -> [outer line, inner line] arrays (n*3)
  function strips(p) {
    const S = p.S, D = p.data, n = JW.n, seg = S / n, out = [];
    const px = (r, c) => { const i = (r * S + c) * 3; return [D[i], D[i + 1], D[i + 2]]; };
    const line = (side, depth) => {
      const a = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) {
        let R = 0, G = 0, B = 0, cnt = 0;
        for (let t = Math.floor(k * seg); t < Math.floor((k + 1) * seg); t++) {
          let r, c;
          if (side === 0) { r = depth; c = t; } else if (side === 2) { r = S - 1 - depth; c = t; }
          else if (side === 3) { r = t; c = depth; } else { r = t; c = S - 1 - depth; }
          const v = px(r, c); R += v[0]; G += v[1]; B += v[2]; cnt++;
        }
        if (JW.log) { a[k * 3] = Math.log(R / cnt + 0.04); a[k * 3 + 1] = Math.log(G / cnt + 0.04); a[k * 3 + 2] = Math.log(B / cnt + 0.04); } else { a[k * 3] = R / cnt; a[k * 3 + 1] = G / cnt; a[k * 3 + 2] = B / cnt; }
      }
      return a;
    };
    for (let s = 0; s < 4; s++) out.push([line(s, JW.depth0), line(s, JW.depth1)]);
    return out;
  }
  // dissimilarity between side sa of A and side sb of B, abutting (sampled in the same direction)
  function dis(A, B) {
    // A,B: [outer, inner] lines facing each other across the seam.
    // Work in log space; remove the mean offset along the seam (exposure-invariant), keep a small absolute term.
    const [a0, a1] = A, [b0, b1] = B; const n = a0.length;
    const k = JW.pred, wg = JW.grad, inv = JW.inv;
    const off = [0, 0, 0], offp = [0, 0, 0];
    for (let i = 0; i < n; i++) { const c = i % 3; off[c] += (a0[i] - b0[i]) * 3 / n; offp[c] += ((a0[i] + (a0[i] - a1[i]) * k) - (b0[i] + (b0[i] - b1[i]) * k)) * 3 / n; }
    const lim = JW.lim; for (let c = 0; c < 3; c++) { off[c] = Math.max(-lim, Math.min(lim, off[c])); offp[c] = Math.max(-lim, Math.min(lim, offp[c])); }
    let s = 0;
    for (let i = 0; i < n; i++) {
      const c = i % 3; const ga = a0[i] - a1[i], gb = b0[i] - b1[i];
      const d1 = (a0[i] + ga * k) - (b0[i] + gb * k), d2 = a0[i] - b0[i], d3 = ga + gb;
      const d1i = d1 - inv * offp[c], d2i = d2 - inv * off[c];
      s += d1i * d1i + JW.col * d2i * d2i + wg * d3 * d3 + JW.abs * (d2 * d2);
    }
    return s;
  }
  // static placement entries: [homeFacelet, imageId] where imageId = slotFacelet*4 + rotation
  const EENT = [], CENT = [];
  for (let s = 0; s < 12; s++) { EENT.push([]); for (let e = 0; e < 12; e++) EENT[s].push([0, 1].map(t => EPL[s][e][t].map(([sf, rf, q]) => [rf, sf * 4 + ((4 - q) % 4)]))); }
  for (let s = 0; s < 8; s++) { CENT.push([]); for (let c = 0; c < 8; c++) CENT[s].push([0, 1, 2].map(t => CPL[s][c][t].map(([sf, rf, q]) => [rf, sf * 4 + ((4 - q) % 4)]))); }
  const KIND = []; for (let fi = 0; fi < 54; fi++) { const p = fi % 9; KIND.push(p === 4 ? 1 : p % 2 ? 2 : 4); } // 1 centre, 2 edge, 4 corner
  // pair geometry inside a face (row-major cells): [a, b, horizontal?]  a is left/top of b
  const PAIRS = [[0,1,1],[1,2,1],[3,4,1],[4,5,1],[6,7,1],[7,8,1],[0,3,0],[3,6,0],[1,4,0],[4,7,0],[2,5,0],[5,8,0]];

  // estimate per-scanned-face exposure gains from the seams of a (mostly right) solution
  function seamGains(cells54, homeImg) {
    const mean = (p, rot, side) => { // mean colour of the outer line of side 'side' of image rotated rot
      const st = strips(rotN(p, rot))[side][0]; const m = [0, 0, 0]; for (let i = 0; i < st.length; i++) m[i % 3] += st[i] * 3 / st.length; return m; };
    const rotN = (p, r) => { for (let i = 0; i < r; i++) p = rotPatchCW(p); return p; };
    const obs = []; // [fa, fb, logratio]
    for (let f = 0; f < 6; f++) for (const [a, b, h] of PAIRS) {
      const ia = homeImg[f * 9 + a], ib = homeImg[f * 9 + b]; const fa = Math.floor((ia >> 2) / 9), fb = Math.floor((ib >> 2) / 9); if (fa === fb) continue;
      const ma = mean(cells54[ia >> 2], ia & 3, h ? 1 : 2), mb = mean(cells54[ib >> 2], ib & 3, h ? 3 : 0);
      const la = Math.log(ma[0] + ma[1] + ma[2] + 0.03), lb = Math.log(mb[0] + mb[1] + mb[2] + 0.03);
      obs.push([fa, fb, la - lb]);
    }
    // robust least squares (IRLS) for log g, mean 0
    const lg = [0, 0, 0, 0, 0, 0];
    for (let it = 0; it < 30; it++) {
      const num = [0, 0, 0, 0, 0, 0], den = [0, 0, 0, 0, 0, 0];
      for (const [a, b, r] of obs) { const res = r - (lg[a] - lg[b]); const w = 1 / Math.max(0.08, Math.abs(res)); num[a] += w * (r + lg[b]); den[a] += w; num[b] += w * (lg[a] - r); den[b] += w; }
      for (let f = 0; f < 6; f++) if (den[f]) lg[f] = 0.5 * lg[f] + 0.5 * num[f] / den[f];
      const m = lg.reduce((x, y) => x + y, 0) / 6; for (let f = 0; f < 6; f++) lg[f] -= m;
    }
    return lg.map(x => Math.exp(x));
  }
  // dark plastic gaps between stickers: find how deep the dark border is, so seams compare picture, not plastic
  function gapDepth(cells) {
    const S = cells[0].S, prof = new Float64Array(14);
    for (const p of cells) { const D = p.data; for (let d = 0; d < 14; d++) { let s = 0, n = 0; for (let t = 4; t < S - 4; t++) { for (const [r, c] of [[d, t], [S - 1 - d, t], [t, d], [t, S - 1 - d]]) { const i = (r * S + c) * 3; s += D[i] + D[i + 1] + D[i + 2]; n++; } } prof[d] += s / n / cells.length; } }
    const inner = (prof[9] + prof[10] + prof[11] + prof[12]) / 4; let g = 0;
    while (g < 8 && prof[g] < 0.8 * inner) g++;
    return { g, prof: Array.from(prof).map(x => +x.toFixed(2)) };
  }
  E._jwdbg = { strips: p => strips(p), dis: (a, b) => dis(a, b), JW };
  function jigsaw(cells54, opts) {
    opts = opts || {};
    if (!opts._trim && JW.autoTrim !== false && opts.autoTrim !== false) {
      const gd = gapDepth(cells54); const d0 = JW.depth0, d1 = JW.depth1;
      const sh = Math.max(0, gd.g - 1);
      JW.depth0 = d0 + sh; JW.depth1 = d1 + sh;
      try { const r = jigsaw(cells54, Object.assign({}, opts, { _trim: true })); r.gap = gd; return r; } finally { JW.depth0 = d0; JW.depth1 = d1; }
    }
    if (opts.em !== false) {
      const o1 = Object.assign({}, opts, { em: false, timeMs: (opts.timeMs || 2500) / 2 });
      const r1 = jigsaw(cells54, o1);
      // normalise like pass 1 did, then divide by the seam-estimated gains
      const fm = [], gm = [0, 0, 0];
      for (let f = 0; f < 6; f++) { const m = [0, 0, 0]; let n = 0; for (let p = 0; p < 9; p++) { const d = cells54[f * 9 + p].data; for (let i = 0; i < d.length; i += 3) { m[0] += d[i]; m[1] += d[i + 1]; m[2] += d[i + 2]; n++; } } fm.push(m.map(x => x / n)); for (let c = 0; c < 3; c++) gm[c] += m[c] / n / 6; }
      const c1 = cells54.map((p, fi) => { const g = fm[Math.floor(fi / 9)].map((x, c) => gm[c] / (x + 1e-6)); const d = new Float32Array(p.data.length); for (let i = 0; i < d.length; i++) d[i] = p.data[i] * g[i % 3]; return { S: p.S, data: d }; });
      const gains = seamGains(c1, r1.homeImgCap);
      const c2 = c1.map((p, fi) => { const g = gains[Math.floor(fi / 9)]; const d = new Float32Array(p.data.length); for (let i = 0; i < d.length; i++) d[i] = Math.min(1.5, p.data[i] / g); return { S: p.S, data: d }; });
      const o2 = Object.assign({}, o1, { normalize: false, faceRot: r1.faceRot, rotSearch: [], rotGreedy: [] });
      const r2 = jigsaw(c2, o2);
      if (JSON.stringify(r2.det) === JSON.stringify(r1.det)) return r1;
      if (!r2.valid) return r1; if (!r1.valid) return r2;
      // keep pass 2 only if it wins under BOTH measures (before and after exposure correction)
      const [a1, b1] = jigsaw(cells54, Object.assign({}, o1, { faceRot: r1.faceRot, rotSearch: [], rotGreedy: [], evalOnly: [r1.det, r2.det] }));
      const [a2, b2] = jigsaw(c2, Object.assign({}, o2, { evalOnly: [r1.det, r2.det] }));
      const pick = (b1 < a1 && b2 < a2) ? r2 : r1;
      pick.passScores = [a1, b1, a2, b2]; pick.gains = gains;
      return pick;
    }
    const FQ = opts.forceCq || null;
    // exposure: each scanned face holds stickers from all pictures, so equalise per-face mean colour
    if (opts.normalize !== false) {
      const fm = [], gm = [0, 0, 0];
      for (let f = 0; f < 6; f++) { const m = [0, 0, 0]; let n = 0; for (let p = 0; p < 9; p++) { const d = cells54[f * 9 + p].data; for (let i = 0; i < d.length; i += 3) { m[0] += d[i]; m[1] += d[i + 1]; m[2] += d[i + 2]; n++; } } fm.push(m.map(x => x / n)); for (let c = 0; c < 3; c++) gm[c] += m[c] / n / 6; }
      cells54 = cells54.map((p, fi) => { const g = fm[Math.floor(fi / 9)].map((x, c) => gm[c] / (x + 1e-6)); const d = new Float32Array(p.data.length); for (let i = 0; i < d.length; i++) d[i] = p.data[i] * g[i % 3]; return { S: p.S, data: d }; });
    }
    // rotated images: img id = slotFac*4 + rot (image rotated rot quarter turns clockwise)
    const ST = new Array(216);
    for (let f = 0; f < 54; f++) { let p = cells54[f]; for (let r = 0; r < 4; r++) { ST[f * 4 + r] = strips(p); p = rotPatchCW(p); } }
    // full pair tables, then "second-best" normalisation (flat stickers stop looking compatible with everything)
    const NI = 216, Hraw = new Float64Array(NI * NI), Vraw = new Float64Array(NI * NI);
    for (let a = 0; a < NI; a++) for (let b = 0; b < NI; b++) {
      if ((a >> 2) === (b >> 2)) { Hraw[a * NI + b] = Vraw[a * NI + b] = 1e9; continue; }
      Hraw[a * NI + b] = dis(ST[a][1], ST[b][3]); Vraw[a * NI + b] = dis(ST[a][2], ST[b][0]);
    }
    function norm(T) {
      const row = new Float64Array(NI), col = new Float64Array(NI);
      for (let a = 0; a < NI; a++) { let m1 = 1e18, m2 = 1e18; for (let b = 0; b < NI; b++) { const v = T[a * NI + b]; if (v < m1) { m2 = m1; m1 = v; } else if (v < m2) m2 = v; } row[a] = m2; }
      for (let b = 0; b < NI; b++) { let m1 = 1e18, m2 = 1e18; for (let a = 0; a < NI; a++) { const v = T[a * NI + b]; if (v < m1) { m2 = m1; m1 = v; } else if (v < m2) m2 = v; } col[b] = m2; }
      let mean = 0; for (let i = 0; i < NI; i++) mean += row[i] / NI; const eps = mean * (JW.eps || 0.05) + 1e-9;
      const out = new Float64Array(NI * NI);
      for (let a = 0; a < NI; a++) for (let b = 0; b < NI; b++) out[a * NI + b] = JW.norm === false ? T[a * NI + b] : T[a * NI + b] / Math.sqrt((row[a] + eps) * (col[b] + eps));
      return out;
    }
    const Hbase = norm(Hraw), Vbase = norm(Vraw);
    let Hn = Hbase, Vn = Vbase, MAP = null;
    // a face scanned rotated by k: standard id (slot,rot) -> captured id
    function mapFor(fr) { const M = new Int32Array(NI); for (let f = 0; f < 6; f++) for (let p = 0; p < 9; p++) for (let r = 0; r < 4; r++) { const k = fr[f]; M[(f * 9 + p) * 4 + r] = (f * 9 + E.capPos(p, k)) * 4 + ((r - k + 8) % 4); } return M; }
    // locked home facelets (user said "this face is right"): opts.lockCap = {homeFacelet: capturedImageId}
    const LS = new Int16Array(54).fill(-1), LI = new Int16Array(NI).fill(-1); const LOCKCAP = opts.lockCap || null;
    function buildLocks() {
      LS.fill(-1); LI.fill(-1); if (!LOCKCAP) return;
      const INV = new Int32Array(NI); for (let a = 0; a < NI; a++) INV[MAP ? MAP[a] : a] = a;
      for (const h in LOCKCAP) { const std = INV[LOCKCAP[h]]; LS[+h] = std; LI[std] = +h; }
    }
    const okEnt = ent => { if (!LOCKCAP) return true; for (let i = 0; i < ent.length; i++) { const h = ent[i][0], id = ent[i][1]; if (LS[h] >= 0 && LS[h] !== id) return false; if (LI[id] >= 0 && LI[id] !== h) return false; } return true; };
    const detOk = det => { if (!LOCKCAP) return true; const img = homeImages(det); for (let h = 0; h < 54; h++) if (LS[h] >= 0 && img[h] !== LS[h]) return false; return true; };
    // assemblies the customer has already seen (as captured image ids per home facelet): opts.avoid = [homeImgCap, ...]
    const AV = opts.avoid && opts.avoid.length ? opts.avoid : null, AVMIN = opts.avoidMin || 3;
    const avoided = det => { if (!AV) return false; const img = homeImages(det); for (const a of AV) { let d = 0; for (let h = 0; h < 54 && d < AVMIN; h++) if ((MAP ? MAP[img[h]] : img[h]) !== a[h]) d++; if (d < AVMIN) return true; } return false; };
    function setTables(fr) {
      if (fr.every(x => x === 0)) { Hn = Hbase; Vn = Vbase; MAP = null; buildLocks(); return; }
      const M = mapFor(fr); MAP = M; Hn = new Float64Array(NI * NI); Vn = new Float64Array(NI * NI);
      for (let a = 0; a < NI; a++) { const ma = M[a] * NI; for (let b = 0; b < NI; b++) { Hn[a * NI + b] = Hbase[ma + M[b]]; Vn[a * NI + b] = Vbase[ma + M[b]]; } }
      buildLocks();
    }
    const costH = (a, b) => Hn[a * NI + b], costV = (a, b) => Vn[a * NI + b];
    const scale = 1;
    // home facelet -> image id, from a full assignment
    function homeImages(det) {
      const img = new Array(54);
      det.corners.forEach(([c, t], s) => { for (const [sf, rf, q] of CPL[s][c][t]) img[rf] = sf * 4 + ((4 - q) % 4); });
      det.edges.forEach(([e, t], s) => { for (const [sf, rf, q] of EPL[s][e][t]) img[rf] = sf * 4 + ((4 - q) % 4); });
      for (let f = 0; f < 6; f++) img[f * 9 + 4] = (f * 9 + 4) * 4 + ((4 - det.cq[f]) % 4);
      return img;
    }
    function score(img) {
      let s = 0;
      for (let f = 0; f < 6; f++) for (const [a, b, h] of PAIRS) s += h ? costH(img[f * 9 + a], img[f * 9 + b]) : costV(img[f * 9 + a], img[f * 9 + b]);
      return s;
    }
    // cost of a set of home facelets placed with given images, against the currently fixed neighbours in img
    // (neighbours that are 'undefined' are ignored)
    const NB = []; // for each home facelet: list of [otherFacelet, iAmFirst, horizontal]
    for (let fi = 0; fi < 54; fi++) NB.push([]);
    for (let f = 0; f < 6; f++) for (const [a, b, h] of PAIRS) { NB[f * 9 + a].push([f * 9 + b, true, h]); NB[f * 9 + b].push([f * 9 + a, false, h]); }
    const KMAP = { c: 1, e: 2, k: 4 };
    function localCost(img, entries, skipKinds) {
      let mask = 0; if (skipKinds) for (const k of skipKinds) mask |= KMAP[k];
      let s = 0;
      for (let i = 0; i < entries.length; i++) {
        const hf = entries[i][0], id = entries[i][1], nb = NB[hf];
        for (let j = 0; j < nb.length; j++) {
          const o = nb[j][0]; if (KIND[o] & mask) continue; const oi = img[o]; if (oi === undefined || oi < 0) continue;
          s += nb[j][1] ? (nb[j][2] ? Hn[id * NI + oi] : Vn[id * NI + oi]) : (nb[j][2] ? Hn[oi * NI + id] : Vn[oi * NI + id]);
        }
      }
      return s;
    }
    function optEdges(det, img, useCorners) {
      const C = [], T = [];
      for (let s = 0; s < 12; s++) { C.push([]); T.push([]); for (let e = 0; e < 12; e++) { let b = 1e18, bt = 0; for (let t = 0; t < 2; t++) { if (!okEnt(EENT[s][e][t])) continue; const v = localCost(img, EENT[s][e][t], useCorners ? ['e'] : ['e', 'k']); if (v < b) { b = v; bt = t; } } C[s].push(Math.min(b, 1e9)); T[s].push(bt); } }
      const h = hungarian(C); det.edges = h.assign.map((e, s) => [e, T[s][e]]);
    }
    function optCorners(det, img) {
      const C = [], T = [];
      for (let s = 0; s < 8; s++) { C.push([]); T.push([]); for (let c = 0; c < 8; c++) { let b = 1e18, bt = 0; for (let t = 0; t < 3; t++) { if (!okEnt(CENT[s][c][t])) continue; const v = localCost(img, CENT[s][c][t], ['k', 'c']); if (v < b) { b = v; bt = t; } } C[s].push(Math.min(b, 1e9)); T[s].push(bt); } }
      const h = hungarian(C); det.corners = h.assign.map((c, s) => [c, T[s][c]]);
    }
    function optCentres(det, img) {
      for (let f = 0; f < 6; f++) { if (FQ && FQ[f] != null) { det.cq[f] = FQ[f]; continue; } let b = 1e18, bq = 0; for (let q = 0; q < 4; q++) { if (!okEnt([[f * 9 + 4, (f * 9 + 4) * 4 + ((4 - q) % 4)]])) continue; const v = localCost(img, [[f * 9 + 4, (f * 9 + 4) * 4 + ((4 - q) % 4)]], ['k']); if (v < b) { b = v; bq = q; } } det.cq[f] = bq; }
    }
    function partialImg(det, parts) {
      const img = new Array(54);
      if (parts.includes('c')) for (let f = 0; f < 6; f++) img[f * 9 + 4] = (f * 9 + 4) * 4 + ((4 - det.cq[f]) % 4);
      if (parts.includes('e')) det.edges.forEach(([e, t], s) => { for (const [sf, rf, q] of EPL[s][e][t]) img[rf] = sf * 4 + ((4 - q) % 4); });
      if (parts.includes('k')) det.corners.forEach(([c, t], s) => { for (const [sf, rf, q] of CPL[s][c][t]) img[rf] = sf * 4 + ((4 - q) % 4); });
      return img;
    }
    function run(cq0) {
      const det = { cq: cq0.slice(), edges: null, corners: null };
      optEdges(det, partialImg(det, ['c']), false);
      optCorners(det, partialImg(det, ['e']));
      let best = score(homeImages(det)), bestDet = JSON.parse(JSON.stringify(det));
      for (let it = 0; it < 8; it++) {
        optCentres(det, partialImg(det, ['e']));
        optEdges(det, partialImg(det, ['c', 'k']), true);
        optCorners(det, partialImg(det, ['e']));
        const s = score(homeImages(det));
        if (s < best - 1e-9) { best = s; bestDet = JSON.parse(JSON.stringify(det)); } else break;
      }
      return { det: bestDet, score: best };
    }
    // ---- simulated annealing over legal assignments ----
    // det.corners[s] = [home, twist], det.edges[s] = [home, flip], det.cq[f]
    let seed = opts.seed || 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const ri = n => Math.floor(rnd() * n);
    // facelet image ids contributed by one piece placement
    const cEnt = (s, c, t) => CENT[s][c][t];
    const eEnt = (s, e, t) => EENT[s][e][t];
    function anneal(det, iters) {
      const img = homeImages(det);
      let cur = score(img); let best = cur, bestDet = JSON.parse(JSON.stringify(det));
      const T0 = opts.T0 || 0.6, T1 = 0.02;
      for (let it = 0; it < iters; it++) {
        const T = T0 * Math.pow(T1 / T0, it / iters);
        // propose
        const kind = rnd(); const changes = []; // [type, slot, newVal]
        if (kind < 0.25) { // edge 3-cycle with random flips (sum even)
          const a = ri(12); let b = ri(12); while (b === a) b = ri(12); let c = ri(12); while (c === a || c === b) c = ri(12);
          const fa = ri(2), fb = ri(2), fc = (fa + fb) % 2;
          const A = det.edges[a], B = det.edges[b], Cc = det.edges[c];
          changes.push(['e', a, [Cc[0], (Cc[1] + fa) % 2]], ['e', b, [A[0], (A[1] + fb) % 2]], ['e', c, [B[0], (B[1] + fc) % 2]]);
        } else if (kind < 0.5) { // corner 3-cycle with twists summing to 0
          const a = ri(8); let b = ri(8); while (b === a) b = ri(8); let c = ri(8); while (c === a || c === b) c = ri(8);
          const ta = ri(3), tb = ri(3), tc = (6 - ta - tb) % 3;
          const A = det.corners[a], B = det.corners[b], Cc = det.corners[c];
          changes.push(['c', a, [Cc[0], (Cc[1] + ta) % 3]], ['c', b, [A[0], (A[1] + tb) % 3]], ['c', c, [B[0], (B[1] + tc) % 3]]);
        } else if (kind < 0.65) { // swap 2 corners + swap 2 edges (keeps parity equal), centre parity fixed at the end
          const a = ri(8); let b = ri(8); while (b === a) b = ri(8); const x = ri(12); let y = ri(12); while (y === x) y = ri(12);
          const ta = ri(3), fb = ri(2);
          changes.push(['c', a, [det.corners[b][0], (det.corners[b][1] + ta) % 3]], ['c', b, [det.corners[a][0], (det.corners[a][1] + 3 - ta) % 3]]);
          changes.push(['e', x, [det.edges[y][0], (det.edges[y][1] + fb) % 2]], ['e', y, [det.edges[x][0], (det.edges[x][1] + fb) % 2]]);
        } else if (kind < 0.75) { // twist two corners
          const a = ri(8); let b = ri(8); while (b === a) b = ri(8); const t = 1 + ri(2);
          changes.push(['c', a, [det.corners[a][0], (det.corners[a][1] + t) % 3]], ['c', b, [det.corners[b][0], (det.corners[b][1] + 3 - t) % 3]]);
        } else if (kind < 0.85) { // flip two edges
          const a = ri(12); let b = ri(12); while (b === a) b = ri(12);
          changes.push(['e', a, [det.edges[a][0], 1 - det.edges[a][1]]], ['e', b, [det.edges[b][0], 1 - det.edges[b][1]]]);
        } else { // rotate a centre
          const f = ri(6); changes.push(['q', f, (det.cq[f] + 1 + ri(3)) % 4]);
        }
        // affected home facelets: old and new entries
        const oldEnt = [], newEnt = [];
        for (const [ty, sl, v] of changes) {
          if (ty === 'e') { oldEnt.push(...eEnt(sl, det.edges[sl][0], det.edges[sl][1])); newEnt.push(...eEnt(sl, v[0], v[1])); }
          else if (ty === 'c') { oldEnt.push(...cEnt(sl, det.corners[sl][0], det.corners[sl][1])); newEnt.push(...cEnt(sl, v[0], v[1])); }
          else { const h = sl * 9 + 4; oldEnt.push([h, img[h]]); newEnt.push([h, h * 4 + ((4 - v) % 4)]); }
        }
        const touched = new Set(oldEnt.map(e => e[0]));
        const before = seamSum(img, touched);
        const saved = []; for (const [h] of oldEnt) saved.push([h, img[h]]);
        for (const [h, id] of newEnt) img[h] = id;
        const after = seamSum(img, touched);
        const d = after - before;
        if (d <= 0 || rnd() < Math.exp(-d / T)) {
          for (const [ty, sl, v] of changes) { if (ty === 'e') det.edges[sl] = v; else if (ty === 'c') det.corners[sl] = v; else det.cq[sl] = v; }
          cur += d; if (cur < best - 1e-9) { best = cur; bestDet = JSON.parse(JSON.stringify(det)); }
        } else { for (const [h, id] of saved) img[h] = id; }
      }
      return { det: bestDet, score: best };
    }
    // sum of seams touching any facelet in the set (each seam counted once)
    function seamSum(img, set) {
      let s = 0;
      for (const hf of set) for (const [o, first, h] of NB[hf]) {
        if (set.has(o) && o < hf) continue;
        s += first ? (h ? costH(img[hf], img[o]) : costV(img[hf], img[o])) : (h ? costH(img[o], img[hf]) : costV(img[o], img[hf]));
      }
      return s;
    }
    const identity = () => ({ cq: [0, 0, 0, 0, 0, 0], corners: [0, 1, 2, 3, 4, 5, 6, 7].map(i => [i, 0]), edges: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => [i, 0]) });
    // ---- beam search over home slots (most-constrained first) ----
    function beamSearch(W, startSlot) {
      // home slots: centres 'q'+f, edges 'e'+K, corners 'c'+K ; facelets of each
      const slots = [];
      for (let f = 0; f < 6; f++) slots.push({ type: 'q', K: f, fac: [f * 9 + 4] });
      for (let K = 0; K < 12; K++) slots.push({ type: 'e', K, fac: E.EDGES[K].fac });
      for (let K = 0; K < 8; K++) slots.push({ type: 'c', K, fac: E.CORNERS[K].fac });
      // order: greedily maximise seams to already-placed facelets
      const placed = new Set(), order = [];
      let first = slots[startSlot]; order.push(first); first.fac.forEach(x => placed.add(x));
      while (order.length < slots.length) {
        let best = null, bs = -1;
        for (const sl of slots) { if (order.includes(sl)) continue; let n = 0; for (const fc of sl.fac) for (const [o] of NB[fc]) if (placed.has(o)) n++; const sc2 = n * 10 + (sl.type === 'c' ? 2 : sl.type === 'e' ? 1 : 0); if (sc2 > bs) { bs = sc2; best = sl; } }
        order.push(best); best.fac.forEach(x => placed.add(x));
      }
      // options per slot: list of {piece key, entries}
      const opt = order.map(sl => {
        const o = [];
        if (sl.type === 'q') { for (let q = 0; q < 4; q++) { if (!FQ || FQ[sl.K] == null || FQ[sl.K] === q) o.push({ pk: 'q', val: q, ent: [[sl.K * 9 + 4, (sl.K * 9 + 4) * 4 + ((4 - q) % 4)]] }); } }
        else if (sl.type === 'e') for (let s2 = 0; s2 < 12; s2++) for (let t = 0; t < 2; t++) o.push({ pk: 's' + s2, ps: s2, val: t, ent: eEnt(s2, sl.K, t) });
        else for (let s2 = 0; s2 < 8; s2++) for (let t = 0; t < 3; t++) o.push({ pk: 'k' + s2, ps: s2, val: t, ent: cEnt(s2, sl.K, t) });
        return o;
      });
      let beam = [{ cost: 0, img: new Int16Array(54).fill(-1), usedE: 0, usedC: 0, choice: [] }];
      for (let d = 0; d < order.length; d++) {
        const sl = order[d], O = opt[d], nO = O.length;
        const cap = beam.length * nO; const costs = new Float64Array(cap), bi = new Int32Array(cap), oiA = new Int16Array(cap); let n = 0;
        for (let x = 0; x < beam.length; x++) { const b = beam[x], img = b.img;
          for (let oi = 0; oi < nO; oi++) {
            const o = O[oi];
            if (sl.type === 'e' && (b.usedE >> o.ps) & 1) continue;
            if (sl.type === 'c' && (b.usedC >> o.ps) & 1) continue;
            if (LOCKCAP && !okEnt(o.ent)) continue;
            let add = 0; const ent = o.ent;
            for (let i = 0; i < ent.length; i++) { const hf = ent[i][0], id = ent[i][1], nb = NB[hf];
              for (let j = 0; j < nb.length; j++) { const oid = img[nb[j][0]]; if (oid < 0) continue; add += nb[j][1] ? (nb[j][2] ? Hn[id * NI + oid] : Vn[id * NI + oid]) : (nb[j][2] ? Hn[oid * NI + id] : Vn[oid * NI + id]); } }
            costs[n] = b.cost + add; bi[n] = x; oiA[n] = oi; n++;
          }
        }
        let thr = Infinity;
        if (n > W) { const tmp = costs.slice(0, n); tmp.sort(); thr = tmp[W - 1]; }
        const nb2 = [];
        for (let i = 0; i < n && nb2.length < W; i++) {
          if (costs[i] > thr) continue;
          const b = beam[bi[i]], o = O[oiA[i]]; const img = b.img.slice(); for (const [hf, id] of o.ent) img[hf] = id;
          nb2.push({ cost: costs[i], img, usedE: sl.type === 'e' ? b.usedE | (1 << o.ps) : b.usedE, usedC: sl.type === 'c' ? b.usedC | (1 << o.ps) : b.usedC, choice: b.choice.concat([oiA[i]]) });
        }
        beam = nb2;
      }
      beam.sort((x, y) => x.cost - y.cost);
      // convert to det (indexed by current slot)
      return beam.map(b => {
        const det = { cq: [0, 0, 0, 0, 0, 0], edges: new Array(12), corners: new Array(8) };
        order.forEach((sl, d) => { const o = opt[d][b.choice[d]]; if (sl.type === 'q') det.cq[sl.K] = o.val; else if (sl.type === 'e') det.edges[o.ps] = [sl.K, o.val]; else det.corners[o.ps] = [sl.K, o.val]; });
        return { det, score: b.cost };
      });
    }
    // 2) best candidates -> corners + alternating exact block optimisation
    const clone = d => ({ cq: d.cq.slice(), edges: d.edges.map(x => x.slice()), corners: d.corners.map(x => x.slice()) });
    function descend(det) {
      let sc = score(homeImages(det));
      for (let it = 0; it < 12; it++) {
        optCentres(det, partialImg(det, ['e']));
        optEdges(det, partialImg(det, ['c', 'k']), true);
        optCorners(det, partialImg(det, ['e']));
        const s2 = score(homeImages(det)); if (s2 > sc - 1e-9) { sc = Math.min(sc, s2); break; } sc = s2;
      }
      return sc;
    }
    // which way were the faces held? try rotations of the listed faces (cheap: tables are only permuted)
    let faceRot = opts.faceRot ? opts.faceRot.slice() : [0, 0, 0, 0, 0, 0];
    const rotFaces = opts.rotSearch || [];
    const feasible = fr => {
        setTables(fr); if (!LOCKCAP) return true;
        for (let K = 0; K < 8; K++) { const fac = E.CORNERS[K].fac; if (!fac.some(h => LS[h] >= 0)) continue; let ok = false; for (let s2 = 0; s2 < 8 && !ok; s2++) for (let t = 0; t < 3 && !ok; t++) if (okEnt(CENT[s2][K][t])) ok = true; if (!ok) return false; }
        for (let K = 0; K < 12; K++) { const fac = E.EDGES[K].fac; if (!fac.some(h => LS[h] >= 0)) continue; let ok = false; for (let s2 = 0; s2 < 12 && !ok; s2++) for (let t = 0; t < 2 && !ok; t++) if (okEnt(EENT[s2][K][t])) ok = true; if (!ok) return false; }
        return true;
      };

    if (rotFaces.length) {
      let bestR = null; const nComb = Math.pow(4, rotFaces.length); const hyp = [];
      for (let code = 0; code < nComb; code++) {
        const fr = faceRot.slice(); rotFaces.forEach((f, i) => fr[f] = (code >> (2 * i)) & 3);
        if (opts.skipRot && opts.skipRot.includes(fr.join(''))) continue;
        if (LOCKCAP && !feasible(fr)) continue;
        setTables(fr);
        const br = beamSearch(opts.rotBeam || 300, 0).slice(0, 2).map(r => descend(clone(r.det)));
        const sc = Math.min(...br); hyp.push([sc, fr.join('')]);
        if (!bestR || sc < bestR.score) bestR = { score: sc, fr };
      }
      // re-check the 3 best hypotheses more thoroughly
      hyp.sort((a, b) => a[0] - b[0]); let best2 = null;
      if (!hyp.length) hyp.push([0, faceRot.join('')]);
      const recheck = hyp.slice(0, 3).map(h => h[1]);
      if (opts.rotPrefer) { const pref = hyp.filter(h => h[1].split('').every((c, i) => !opts.rotPrefer.includes(i) || c === '0')); if (pref.length && !recheck.includes(pref[0][1])) recheck.push(pref[0][1]); }
      for (const key of recheck) {
        const fr = key.split('').map(Number); setTables(fr);
        let br = []; for (const st of [0, 3]) br = br.concat(beamSearch(700, st));
        br.sort((a, b) => a.score - b.score);
        const sc = Math.min(...br.slice(0, 4).map(r => descend(clone(r.det))));
        if (!best2 || sc < best2.score) best2 = { score: sc, fr };
      }
      bestR = best2 || { fr: faceRot };
      faceRot = bestR.fr; if (opts.debug) console.log('  [rot]', hyp.sort((a, b) => a[0] - b[0]).slice(0, 4).map(h => h[1] + ':' + h[0].toFixed(1)).join(' '));
    }
    if (opts.rotGreedy && opts.rotGreedy.length) {
      const quick = fr => { setTables(fr); const br = beamSearch(opts.rotBeam || 300, opts.rotStart || 0); if (!br.length) return 1e18; return Math.min(...br.slice(0, 2).map(r => { const d = clone(r.det); const v = descend(d); return detOk(d) ? v : v + 1e6; })); };
      // with locked faces: only rotations under which every locked piece can actually be placed
      const faces = opts.rotGreedy;
      if (LOCKCAP) {
        const cands = []; const n = Math.pow(4, faces.length);
        for (let code = 0; code < n; code++) { const fr = faceRot.slice(); faces.forEach((f, i) => fr[f] = (code >> (2 * i)) & 3); if (feasible(fr)) cands.push(fr); }
        let best = null; for (const fr of cands.slice(0, 24)) { const v = quick(fr); if (!best || v < best.v) best = { v, fr }; }
        if (best) faceRot = best.fr;
        if (opts.debug) console.log('  [rotLocked] feasible', cands.length, 'chosen', faceRot.join(''));
      } else {
        let cur = quick(faceRot);
        for (let round = 0; round < (opts.rotRounds || 3); round++) for (const f of faces) {
          let bk = faceRot[f];
          for (let k = 0; k < 4; k++) { if (k === faceRot[f]) continue; const fr = faceRot.slice(); fr[f] = k; const v = quick(fr); if (v < cur - 1e-9) { cur = v; bk = k; } }
          faceRot[f] = bk;
        }
        if (opts.debug) console.log('  [rotGreedy]', faceRot.join(''), cur.toFixed(2));
      }
    }
    setTables(faceRot);
    if (opts.evalOnly) return opts.evalOnly.map(d => score(homeImages(d)));
    let beamRes = [];
    for (const st of (opts.starts || [0, 2, 3, 5])) beamRes = beamRes.concat(beamSearch(opts.beam || 1200, st));
    if (!beamRes.length) beamRes = [{ det: { cq: [0, 0, 0, 0, 0, 0], corners: [0, 1, 2, 3, 4, 5, 6, 7].map(i => [i, 0]), edges: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => [i, 0]) }, score: 1e9 }];
    beamRes.sort((a, b) => a.score - b.score);
    let seeds = beamRes.slice(0, opts.beamKeep || 16).map(r => ({ det: r.det, score: descend(r.det) }))
      .sort((a, b) => a.score - b.score);
    if (AV) { const fresh = seeds.filter(x => !avoided(x.det)); if (fresh.length) seeds = fresh; else { const more = beamRes.slice(16, 120).filter(r => !avoided(r.det)).slice(0, 8).map(r => { const d = clone(r.det); const sc = descend(d); return { det: avoided(d) ? clone(r.det) : d, score: avoided(d) ? score(homeImages(r.det)) : sc }; }); if (more.length) seeds = more; } }
    if (opts.debug) console.log('  [beam] best', beamRes[0].score.toFixed(2), 'after descend', seeds[0].score.toFixed(2));
    // 3) iterated local search: perturb (centres / edges / corners), re-optimise exactly, keep if better
    const results = [];
    const t0 = Date.now(), budget = opts.timeMs || 2500;
    for (let r = 0; r < Math.min(seeds.length, opts.polish || 4); r++) {
      let cur = clone(seeds[r].det), curS = seeds[r].score;
      let it = 0;
      while (Date.now() - t0 < budget * (r + 1) / Math.min(seeds.length, opts.polish || 4) && it < (opts.ilsIters || 4000)) {
        it++;
        const d = clone(cur); const k = rnd();
        if (k < 0.4) { const f = ri(6); d.cq[f] = (d.cq[f] + 1 + ri(3)) % 4; if (rnd() < 0.5) { const g = ri(6); d.cq[g] = (d.cq[g] + 1 + ri(3)) % 4; } if (FQ) for (let x = 0; x < 6; x++) if (FQ[x] != null) d.cq[x] = FQ[x]; }
        else if (k < 0.7) { const a = ri(12), b = ri(12); const t = d.edges[a]; d.edges[a] = [d.edges[b][0], ri(2)]; d.edges[b] = [t[0], ri(2)]; }
        else { const a = ri(8), b = ri(8); const t = d.corners[a]; d.corners[a] = [d.corners[b][0], ri(3)]; d.corners[b] = [t[0], ri(3)]; }
        // after a centre change, edges are re-fit first from centres + corners
        const sc = descend(d);
        if (sc < curS - 1e-9 && detOk(d) && !avoided(d)) { cur = d; curS = sc; }
      }
      if (opts.debug) console.log("  [ils] seed", r, "iters", it, "score", curS.toFixed(2)); results.push({ det: cur, score: curS });
    }
    results.sort((a, b) => a.score - b.score);
    // final: best LEGAL candidate among (a) legal beam solutions, (b) descended / ILS results (repaired if needed)
    let chosen = null;
    let skipAvoid = !!AV;
    const consider = c => { if (c && detOk(c.det) && !(skipAvoid && avoided(c.det)) && (!chosen || c.score < chosen.score - 1e-9)) chosen = c; };
    let nLegal = 0;
    for (const r of beamRes) { if (nLegal >= (AV ? 300 : 40)) break; if (checkState(buildState(r.det)).ok) { nLegal++; const d = clone(r.det); const sc = score(homeImages(d)); consider({ det: d, score: sc }); } }
    const pool = results.concat(seeds).sort((a, b) => a.score - b.score).slice(0, 6);
    for (const r of pool) {
      if (checkState(buildState(r.det)).ok) consider({ det: r.det, score: score(homeImages(r.det)) });
      else consider(repair(r.det));
    }
    let noAlt = false;
    if (!chosen && AV) { noAlt = true; skipAvoid = false; for (const r of pool) { if (checkState(buildState(r.det)).ok) consider({ det: r.det, score: score(homeImages(r.det)) }); else consider(repair(r.det)); } }
    if (!chosen) chosen = { det: results[0].det, score: results[0].score, invalid: true };
    const state = buildState(chosen.det);
    const img = homeImages(chosen.det);
    const truthScore = opts.truthDet ? score(homeImages(opts.truthDet)) / scale : null;
    // per home facelet confidence: its worst seam cost (normalised)
    const conf = new Array(54).fill(0);
    for (let fi = 0; fi < 54; fi++) conf[fi] = localCost(img, [[fi, img[fi]]], []) / (NB[fi].length * scale);
    return { faceRot, homeImgCap: img.map(id => MAP ? MAP[id] : id), truthImg: opts.truthDet ? homeImages(opts.truthDet) : null, truthScore, state, homeImg: img, score: chosen.score / scale, valid: checkState(state).ok, conf, det: chosen.det, noAlt };

    function buildState(det) {
      const st = [];
      det.corners.forEach(([c, t], s) => { for (const [sf, rf, q, up] of CPL[s][c][t]) st.push({ id: rf, pos: slotPos(sf), n: NRM[FACES[Math.floor(sf / 9)]].slice(), up: up.slice() }); });
      det.edges.forEach(([e, t], s) => { for (const [sf, rf, q, up] of EPL[s][e][t]) st.push({ id: rf, pos: slotPos(sf), n: NRM[FACES[Math.floor(sf / 9)]].slice(), up: up.slice() }); });
      for (let f = 0; f < 6; f++) st.push({ id: f * 9 + 4, pos: slotPos(f * 9 + 4), n: NRM[FACES[f]].slice(), up: vecOfQ(FACES[f], det.cq[f]) });
      return st;
    }
    function repair(det0) {
      const base = JSON.parse(JSON.stringify(det0)); const cand = [];
      for (let s = 0; s < 8; s++) for (let t = 0; t < 3; t++) if (t !== base.corners[s][1]) cand.push(['ct', s, t]);
      for (let s = 0; s < 12; s++) cand.push(['ef', s, 1 - base.edges[s][1]]);
      for (let f = 0; f < 6; f++) if (!FQ || FQ[f] == null) for (const dq of [1, 2, 3]) cand.push(['cq', f, (base.cq[f] + dq) % 4]);
      for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) for (const fl of [0, 1]) cand.push(['es', a, b, fl]);
      for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) for (const tw of [0, 1, 2]) cand.push(['cs', a, b, tw]);
      const applyC = (d, [k, a, b, x]) => {
        if (k === 'ct') d.corners[a][1] = b; else if (k === 'ef') d.edges[a][1] = b; else if (k === 'cq') d.cq[a] = b;
        else if (k === 'es') { const t = d.edges[a]; d.edges[a] = [d.edges[b][0], (d.edges[b][1] + x) % 2]; d.edges[b] = [t[0], (t[1] + x) % 2]; }
        else if (k === 'cs') { const t = d.corners[a]; d.corners[a] = [d.corners[b][0], (d.corners[b][1] + x) % 3]; d.corners[b] = [t[0], (t[1] + 3 - x) % 3]; }
      };
      const sc = d => score(homeImages(d));
      const singles = cand.map(c => { const d = JSON.parse(JSON.stringify(base)); applyC(d, c); return [sc(d), c]; }).sort((a, b) => a[0] - b[0]);
      let best = null;
      const consider = list => { const d = JSON.parse(JSON.stringify(base)); for (const c of list) applyC(d, c); if (checkState(buildState(d)).ok && detOk(d)) { const v = sc(d); if (!best || v < best.score) best = { det: d, score: v }; } };
      const top = singles.slice(0, 60);
      for (let i = 0; i < top.length; i++) { consider([top[i][1]]); for (let j = i + 1; j < top.length; j++) consider([top[i][1], top[j][1]]); }
      if (!best) { const t2 = singles.slice(0, 18); for (let i = 0; i < t2.length; i++) for (let j = i + 1; j < t2.length; j++) for (let l = j + 1; l < t2.length; l++) consider([t2[i][1], t2[j][1], t2[l][1]]); }
      return best;
    }
  }
  E.jigsaw = jigsaw; E.JW = JW; E._strips = strips; E._dis = dis;
})();
// ---- seam-based grid alignment (no reference needed): snaps the 3x3 box onto the dark gaps between stickers ----
(function(){
  const E = (typeof module !== 'undefined' && module.exports) ? module.exports : (typeof window !== 'undefined' ? window.CubeEngine : globalThis.CubeEngine);
  function lumaOf(rgba, W, H) { const L = new Float32Array(W * H); for (let i = 0; i < W * H; i++) L[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255; return L; }
  function gridScore(L, W, H, x0, y0, s) {
    const at = (x, y) => { x = Math.max(0, Math.min(W - 1, Math.round(x))); y = Math.max(0, Math.min(H - 1, Math.round(y))); return L[y * W + x]; };
    const e = Math.max(2.5, s * 0.022); let tot = 0;
    const P = E.GRID_P == null ? 0.35 : E.GRID_P;
    const lineScore = (vals) => { vals.sort((a, b) => a - b); return vals[Math.floor(vals.length * P)]; };
    for (const k of [0, 1, 2, 3]) {
      const xv = x0 + s * k / 3, yh = y0 + s * k / 3; const sv = [], sh = [];
      for (let t = 0.03; t < 0.97; t += 0.015) {
        const yy = y0 + s * t, xx = x0 + s * t;
        const c = Math.min(at(xv, yy), at(xv - 1, yy), at(xv + 1, yy)), l = at(xv - e, yy), r = at(xv + e, yy);
        const c2 = Math.min(at(xx, yh), at(xx, yh - 1), at(xx, yh + 1)), u = at(xx, yh - e), b = at(xx, yh + e);
        if (k === 0) { sv.push(r - c); sh.push(b - c2); }              // outer border: inside brighter than the rim
        else if (k === 3) { sv.push(l - c); sh.push(u - c2); }
        else { sv.push(Math.min(l, r) - c); sh.push(Math.min(u, b) - c2); } // inner seam: darker than both sides
      }
      tot += (k === 0 || k === 3 ? 0.5 : 1) * (lineScore(sv) + lineScore(sh));
    }
    return tot;
  }
  function alignGrid(rgba, W, H, box, opts) {
    opts = opts || {}; const L = lumaOf(rgba, W, H);
    let best = { x: box.x, y: box.y, s: box.s }, bs = gridScore(L, W, H, box.x, box.y, box.s);
    const R = opts.range || 0.08, st = box.s * 0.012;
    for (let sc = 0.92; sc <= 1.081; sc += 0.016) {
      const s = box.s * sc;
      for (let oy = -R * box.s; oy <= R * box.s; oy += st) for (let ox = -R * box.s; ox <= R * box.s; ox += st) {
        const x = box.x + ox - (s - box.s) / 2, y = box.y + oy - (s - box.s) / 2;
        const v = gridScore(L, W, H, x, y, s); if (v > bs) { bs = v; best = { x, y, s }; }
      }
    }
    // fine refine
    let step = box.s * 0.006;
    for (let it = 0; it < 40 && step > 0.4; it++) {
      let imp = false;
      for (const [dx, dy, ds] of [[step, 0, 0], [-step, 0, 0], [0, step, 0], [0, -step, 0], [-step / 2, -step / 2, step], [step / 2, step / 2, -step]]) {
        const c = { x: best.x + dx, y: best.y + dy, s: best.s + ds }; const v = gridScore(L, W, H, c.x, c.y, c.s); if (v > bs) { bs = v; best = c; imp = true; }
      }
      if (!imp) step /= 2;
    }
    // confidence: compare with score at a third-cell offset (definitely misaligned)
    const off = gridScore(L, W, H, best.x + best.s / 6, best.y + best.s / 6, best.s);
    return { box: best, score: bs, contrast: bs / (off + 1e-6) };
  }
  E.alignGrid = alignGrid; E.gridScore = gridScore;
})();
// ---- per-sticker seam detection: each of the 9 stickers finds its own 4 borders near the expected grid ----
(function(){
  const E = (typeof module !== 'undefined' && module.exports) ? module.exports : (typeof window !== 'undefined' ? window.CubeEngine : globalThis.CubeEngine);
  function lumaOf(rgba, W, H) { const L = new Float32Array(W * H); for (let i = 0; i < W * H; i++) L[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255; return L; }
  function cellBoxes(rgba, W, H, box, opts) {
    opts = opts || {}; const L = lumaOf(rgba, W, H); const s = box.s, c3 = s / 3;
    const at = (x, y) => { x = Math.max(0, Math.min(W - 1, Math.round(x))); y = Math.max(0, Math.min(H - 1, Math.round(y))); return L[y * W + x]; };
    const e = Math.max(2, c3 * 0.07), rng = c3 * (opts.range || 0.16), P = 0.3;
    const pct = v => { v.sort((a, b) => a - b); return v[Math.floor(v.length * P)]; };
    // valley score of a vertical line x over y in [ya,yb]; side: 0 inner seam, -1 left outer (inside is right), +1 right outer
    const vline = (x, ya, yb, side) => { const v = []; for (let t = 0; t <= 20; t++) { const y = ya + (yb - ya) * t / 20; const c = Math.min(at(x, y), at(x - 1, y), at(x + 1, y)); const l = at(x - e, y), r = at(x + e, y); v.push(side < 0 ? r - c : side > 0 ? l - c : Math.min(l, r) - c); } return pct(v); };
    const hline = (y, xa, xb, side) => { const v = []; for (let t = 0; t <= 20; t++) { const x = xa + (xb - xa) * t / 20; const c = Math.min(at(x, y), at(x, y - 1), at(x, y + 1)); const u = at(x, y - e), b = at(x, y + e); v.push(side < 0 ? b - c : side > 0 ? u - c : Math.min(u, b) - c); } return pct(v); };
    const best1 = (f, x0) => { let bx = x0, bv = -1e9; for (let d = -rng; d <= rng; d += 0.5) { const v = f(x0 + d) - 0.002 * Math.abs(d) / c3 * 10; if (v > bv) { bv = v; bx = x0 + d; } } return bx; };
    const out = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const ex0 = box.x + c * c3, ex1 = ex0 + c3, ey0 = box.y + r * c3, ey1 = ey0 + c3;
      const ya = ey0 + c3 * 0.2, yb = ey1 - c3 * 0.2, xa = ex0 + c3 * 0.2, xb = ex1 - c3 * 0.2;
      const x0 = best1(x => vline(x, ya, yb, c === 0 ? -1 : 0), ex0), x1 = best1(x => vline(x, ya, yb, c === 2 ? 1 : 0), ex1);
      const y0 = best1(y => hline(y, xa, xb, r === 0 ? -1 : 0), ey0), y1 = best1(y => hline(y, xa, xb, r === 2 ? 1 : 0), ey1);
      // sanity: keep size plausible
      const okW = x1 - x0 > c3 * 0.75 && x1 - x0 < c3 * 1.25, okH = y1 - y0 > c3 * 0.75 && y1 - y0 < c3 * 1.25;
      out.push({ x0: okW ? x0 : ex0, x1: okW ? x1 : ex1, y0: okH ? y0 : ey0, y1: okH ? y1 : ey1 });
    }
    return out;
  }
  // resample each sticker's own rectangle to an SxS patch (RGB 0..1)
  function cellsFromBoxes(rgba, W, H, boxes, S) {
    S = S || 48; return boxes.map(b => {
      const d = new Float32Array(S * S * 3), sw = (b.x1 - b.x0) / S, sh = (b.y1 - b.y0) / S;
      for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) {
        let R = 0, G = 0, B = 0, n = 0;
        for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) { const x = Math.min(W - 1, Math.max(0, Math.floor(b.x0 + (c + 0.25 + xx * 0.5) * sw))), y = Math.min(H - 1, Math.max(0, Math.floor(b.y0 + (r + 0.25 + yy * 0.5) * sh))); const o = (y * W + x) * 4; R += rgba[o]; G += rgba[o + 1]; B += rgba[o + 2]; n++; }
        const o = (r * S + c) * 3; d[o] = R / n / 255; d[o + 1] = G / n / 255; d[o + 2] = B / n / 255;
      }
      return { S, data: d };
    });
  }
  E.cellBoxes = cellBoxes; E.cellsFromBoxes = cellsFromBoxes;
})();
// ---- multi-frame stacking: align a burst of hand-held frames and average them ----
(function(){
  const E = (typeof module !== 'undefined' && module.exports) ? module.exports : (typeof window !== 'undefined' ? window.CubeEngine : globalThis.CubeEngine);
  function gray(d, w, h, k) { const W = Math.floor(w / k), H = Math.floor(h / k), g = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) { const i = ((y * k + yy) * w + x * k + xx) * 4; s += d[i] + d[i + 1] + d[i + 2]; } g[y * W + x] = s / (k * k * 3); }
    return { g, W, H }; }
  // sharpness: mean squared Laplacian of a coarse gray image
  function sharpness(fr) { const { g, W, H } = gray(fr.d, fr.w, fr.h, 2); let s = 0, n = 0;
    for (let y = 2; y < H - 2; y += 2) for (let x = 2; x < W - 2; x += 2) { const i = y * W + x; const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - W] - g[i + W]; s += l * l; n++; } return s / n; }
  // best shift (dx,dy) so that B(x+dx,y+dy) ~ A(x,y); returns shift in level units and residual
  function shiftSearch(A, B, R, cx, cy, rad) {
    let best = [0, 0], bv = Infinity; const { W, H } = A;
    for (let dy = cy - rad; dy <= cy + rad; dy++) for (let dx = cx - rad; dx <= cx + rad; dx++) {
      let s = 0, n = 0;
      for (let y = R; y < H - R; y += 2) { const yb = y + dy; if (yb < 0 || yb >= H) continue; for (let x = R; x < W - R; x += 2) { const xb = x + dx; if (xb < 0 || xb >= W) continue; s += Math.abs(A.g[y * W + x] - B.g[yb * W + xb]); n++; } }
      const v = s / Math.max(1, n); if (v < bv) { bv = v; best = [dx, dy]; }
    }
    return { dx: best[0], dy: best[1], res: bv };
  }
  // frames: [{d (RGBA), w, h}] same size. returns {d,w,h,used,shifts}
  function stackFrames(frames, opts) {
    opts = opts || {}; if (frames.length === 1) return Object.assign({ used: 1 }, frames[0]);
    const sh = frames.map(sharpness); let ri = 0; sh.forEach((v, i) => { if (v > sh[ri]) ri = i; });
    const ref = frames[ri], w = ref.w, h = ref.h;
    const A4 = gray(ref.d, w, h, 4), A2 = gray(ref.d, w, h, 2), A1 = gray(ref.d, w, h, 1);
    const R4 = Math.round(Math.min(A4.W, A4.H) * 0.12), R2 = R4 * 2;
    const cand = frames.map((fr, i) => {
      if (i === ri) return { i, dx: 0, dy: 0, res: 0, sharp: sh[i] };
      const c = shiftSearch(A4, gray(fr.d, w, h, 4), R4, 0, 0, Math.max(3, Math.round(R4 * 0.8)));
      const f = shiftSearch(A2, gray(fr.d, w, h, 2), R2, c.dx * 2, c.dy * 2, 2);
      const g = shiftSearch(A1, gray(fr.d, w, h, 1), R2 * 2, f.dx * 2, f.dy * 2, 1);
      return { i, dx: g.dx, dy: g.dy, res: f.res, sharp: sh[i] };
    });
    // keep frames that are sharp enough and line up well
    const resMed = cand.map(c => c.res).sort((a, b) => a - b)[Math.floor(cand.length / 2)];
    const keep = cand.filter(c => c.sharp >= sh[ri] * (opts.minSharp || 0.45) && c.res <= Math.max(resMed * 1.5, 6));
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (const c of keep) { const xx = x + c.dx, yy = y + c.dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const j = (yy * w + xx) * 4, fd = frames[c.i].d; r += fd[j]; g += fd[j + 1]; b += fd[j + 2]; n++; }
      const o = (y * w + x) * 4; if (n) { out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; } else { const j = o; out[o] = ref.d[j]; out[o + 1] = ref.d[j + 1]; out[o + 2] = ref.d[j + 2]; } out[o + 3] = 255;
    }
    return { d: out, w, h, used: keep.length, shifts: keep.map(c => [c.dx, c.dy]) };
  }
  E.stackFrames = stackFrames; E.sharpness = sharpness;
})();
// quick "is a 3x3 cube face in the box?" test: seams present at the grid lines vs. at shifted lines
(function(){
  const E = (typeof module !== 'undefined' && module.exports) ? module.exports : (typeof window !== 'undefined' ? window.CubeEngine : globalThis.CubeEngine);
  E.gridPresence = function(rgba, W, H, box){
    const k = 2, w = Math.floor(W / k), h = Math.floor(H / k), L = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = ((y * k) * W + x * k) * 4; L[y * w + x] = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) / 255; }
    const b = { x: box.x / k, y: box.y / k, s: box.s / k };
    let best = -1e9, bb = null;
    for (const sc of [0.94, 1, 1.06]) for (let oy = -0.06; oy <= 0.061; oy += 0.02) for (let ox = -0.06; ox <= 0.061; ox += 0.02) {
      const s = b.s * sc, x = b.x + ox * b.s - (s - b.s) / 2, y = b.y + oy * b.s - (s - b.s) / 2;
      const v = E.gridScore(L, w, h, x, y, s); if (v > best) { best = v; bb = { x, y, s }; }
    }
    const off = (E.gridScore(L, w, h, bb.x + bb.s / 6, bb.y, bb.s) + E.gridScore(L, w, h, bb.x, bb.y + bb.s / 6, bb.s)) / 2;
    return { score: best, ratio: best / (Math.abs(off) + 0.004) };
  };
})();
// ---- cube-face locking: find the 4 straight outer edges of the face near the guide box ----
(function(){
  const E = (typeof module !== 'undefined' && module.exports) ? module.exports : (typeof window !== 'undefined' ? window.CubeEngine : globalThis.CubeEngine);
  // gray + |gx|,|gy| (Sobel) of an RGBA buffer, downscaled by k
  function gradients(rgba, W, H, k) {
    const w = Math.floor(W / k), h = Math.floor(H / k), g = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) { const i = ((y * k + yy) * W + x * k + xx) * 4; s += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]; } g[y * w + x] = s / (k * k); }
    // light blur
    const b = Float32Array.from(g); // borders keep their own value (no fake edges at the region boundary)
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; b[i] = (g[i] * 4 + g[i - 1] + g[i + 1] + g[i - w] + g[i + w]) / 8; }
    const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x;
      gx[i] = Math.abs((b[i - w + 1] + 2 * b[i + 1] + b[i + w + 1]) - (b[i - w - 1] + 2 * b[i - 1] + b[i + w - 1]));
      gy[i] = Math.abs((b[i + w - 1] + 2 * b[i + w] + b[i + w + 1]) - (b[i - w - 1] + 2 * b[i - w] + b[i - w + 1])); }
    // thin-line response (|2nd derivative|, spacing 2): seams are thin dark/glare lines, picture edges are steps
    const lx = new Float32Array(w * h), ly = new Float32Array(w * h);
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) { const i = y * w + x;
      lx[i] = Math.max(0, Math.abs(b[i - 2] + b[i + 2] - 2 * b[i]) - 0.5 * Math.abs(b[i + 2] - b[i - 2]));
      ly[i] = Math.max(0, Math.abs(b[i - 2 * w] + b[i + 2 * w] - 2 * b[i]) - 0.5 * Math.abs(b[i + 2 * w] - b[i - 2 * w])); }
    return { w, h, gx, gy, lx, ly, b };
  }
  function pct(arr, p) { const a = Array.from(arr).sort((x, y) => x - y); return a[Math.floor(a.length * p)]; }
  // box in full-res coords; returns {quad:[[x,y]x4] (TL,TR,BR,BL) full-res, score}
  function lockQuad(rgba, W, H, box, opts) {
    opts = opts || {}; const k = opts.k || Math.max(1, Math.round(box.s / 260));
    const G = gradients(rgba, W, H, k); const x0 = box.x / k, y0 = box.y / k, s = box.s / k;
    const R = s * (opts.range || 0.16), N = opts.steps || 29, offs = []; for (let i = 0; i < N; i++) offs.push(-R + 2 * R * i / (N - 1));
    const n = 72, buf = new Float32Array(n);
    const sides = [
      { A: [x0, y0], B: [x0 + s, y0], nv: [0, 1], M: G.gy }, { A: [x0 + s, y0], B: [x0 + s, y0 + s], nv: [1, 0], M: G.gx },
      { A: [x0, y0 + s], B: [x0 + s, y0 + s], nv: [0, 1], M: G.gy }, { A: [x0, y0], B: [x0, y0 + s], nv: [1, 0], M: G.gx } ];
    const lineScore = (M, p0, p1) => { for (let i = 0; i < n; i++) { const t = 0.08 + 0.84 * i / (n - 1); const x = Math.round(p0[0] * (1 - t) + p1[0] * t), y = Math.round(p0[1] * (1 - t) + p1[1] * t); buf[i] = (x < 3 || y < 3 || x >= G.w - 3 || y >= G.h - 3) ? 0 : M[y * G.w + x]; } return pct(buf, 0.4); };
    // top-K distinct candidate lines per side
    const K = opts.topK || 4, cands = [];
    for (const sd of sides) {
      const all = [];
      for (const da of offs) for (const db of offs) {
        if (Math.abs(da - db) > 0.35 * s) continue;
        const p0 = [sd.A[0] + sd.nv[0] * da, sd.A[1] + sd.nv[1] * da], p1 = [sd.B[0] + sd.nv[0] * db, sd.B[1] + sd.nv[1] * db];
        all.push([lineScore(sd.M, p0, p1), p0, p1, da, db]);
      }
      all.sort((x, y) => y[0] - x[0]); const pick = [];
      for (const c of all) { if (pick.every(p => Math.abs(p[3] - c[3]) + Math.abs(p[4] - c[4]) > 0.07 * s)) pick.push(c); if (pick.length >= K) break; }
      cands.push(pick);
    }
    const inter = (l1, l2) => { const p = l1[1], d1 = [l1[2][0] - p[0], l1[2][1] - p[1]], r = l2[1], d2 = [l2[2][0] - r[0], l2[2][1] - r[1]]; const det = d1[0] * (-d2[1]) - (-d2[0]) * d1[1]; if (Math.abs(det) < 1e-9) return [p[0], p[1]]; const u = ((r[0] - p[0]) * (-d2[1]) - (-d2[0]) * (r[1] - p[1])) / det; return [p[0] + u * d1[0], p[1] + u * d1[1]]; };
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    let best = null;
    for (const t of cands[0]) for (const r of cands[1]) for (const bo of cands[2]) for (const l of cands[3]) {
      const q = [inter(t, l), inter(t, r), inter(bo, r), inter(bo, l)];
      const L = [dist(q[0], q[1]), dist(q[1], q[2]), dist(q[2], q[3]), dist(q[3], q[0])], m = (L[0] + L[1] + L[2] + L[3]) / 4;
      if (L.some(x => x < m * 0.85 || x > m * 1.18)) continue;
      // inner seams at 1/3 and 2/3 (vertical seams use gx, horizontal use gy)
      let seam = 0;
      const SX = opts.seamMode === 'line' ? G.lx : G.gx, SY = opts.seamMode === 'line' ? G.ly : G.gy;
      for (const f of [1 / 3, 2 / 3]) { seam += lineScore(SX, lerp(q[0], q[1], f), lerp(q[3], q[2], f)); seam += lineScore(SY, lerp(q[0], q[3], f), lerp(q[1], q[2], f)); }
      const edge = t[0] + r[0] + bo[0] + l[0];
      // dark plastic rim just outside each edge (hands / desk / background are lighter)
      let rim = 0;
      if (opts.rimW) {
        const ctr = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2];
        const band = (a, b, off) => { let sm = 0, n = 0; for (let i = 1; i < 12; i++) { const tt = i / 12; let x = a[0] + (b[0] - a[0]) * tt, y = a[1] + (b[1] - a[1]) * tt; x += (x - ctr[0]) * off; y += (y - ctr[1]) * off; const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= G.w || yi >= G.h) continue; sm += G.b[yi * G.w + xi]; n++; } return n ? sm / n : 0; };
        for (const [a, b] of [[q[0], q[1]], [q[1], q[2]], [q[2], q[3]], [q[3], q[0]]]) rim += Math.max(-40, Math.min(60, band(a, b, -0.08) - band(a, b, 0.035)));
        rim /= 4;
      }
      const sizePen = Math.abs(Math.log(m / s)) * 2;
      const sc = ((opts.edgeW == null ? 1 : opts.edgeW) * edge / 4 + (opts.seamW == null ? 2 : opts.seamW) * seam / 4 + (opts.rimW || 0) * rim) * (1 - sizePen);
      if (!best || sc > best.sc) best = { sc, q, edge: edge / 4, seam: seam / 4, m };
    }
    if (!best) { // fall back to the single best line per side
      const q = [inter(cands[0][0], cands[3][0]), inter(cands[0][0], cands[1][0]), inter(cands[2][0], cands[1][0]), inter(cands[2][0], cands[3][0])];
      best = { sc: 0, q, edge: 0, seam: 0, m: s };
    }
    const q = best.q.map(([x, y]) => [x * k, y * k]); const total = best.edge * 4;
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const sidesLen = [d(q[0], q[1]), d(q[1], q[2]), d(q[2], q[3]), d(q[3], q[0])]; const mean = sidesLen.reduce((a, b) => a + b) / 4;
    const ok = best.sc > 0 && mean > box.s * 0.6 && mean < box.s * 1.4;
    // background edge level for a confidence ratio
    const bg = pct(G.gx.filter((_, i) => i % 7 === 0), 0.6) + 1e-3;
    return { quad: q, score: best.sc, conf: best.sc / bg, seam: best.seam / bg, ok, size: mean };
  }
  // perspective warp of an RGBA buffer quad -> size x size RGBA
  function warpQuad(rgba, W, H, quad, size) {
    const [x0, y0] = quad[0], [x1, y1] = quad[1], [x2, y2] = quad[2], [x3, y3] = quad[3];
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    let a, b, c, d, e, f, g, h;
    if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) { a = x1 - x0; b = x2 - x1; c = x0; d = y1 - y0; e = y2 - y1; f = y0; g = 0; h = 0; }
    else { const den = dx1 * dy2 - dx2 * dy1; g = (dx3 * dy2 - dx2 * dy3) / den; h = (dx1 * dy3 - dx3 * dy1) / den; a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0; d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0; }
    const out = new Uint8ClampedArray(size * size * 4);
    for (let yy = 0; yy < size; yy++) for (let xx = 0; xx < size; xx++) {
      const u = (xx + 0.5) / size, v = (yy + 0.5) / size, w = g * u + h * v + 1; let sx = (a * u + b * v + c) / w - 0.5, sy = (d * u + e * v + f) / w - 0.5;
      sx = Math.max(0, Math.min(W - 2, sx)); sy = Math.max(0, Math.min(H - 2, sy)); const ix = sx | 0, iy = sy | 0, fx = sx - ix, fy = sy - iy, o = (yy * size + xx) * 4, i0 = (iy * W + ix) * 4;
      for (let ch = 0; ch < 3; ch++) out[o + ch] = (rgba[i0 + ch] * (1 - fx) + rgba[i0 + 4 + ch] * fx) * (1 - fy) + (rgba[i0 + W * 4 + ch] * (1 - fx) + rgba[i0 + W * 4 + 4 + ch] * fx) * fy;
      out[o + 3] = 255;
    }
    return out;
  }
  // per-pixel median of aligned faces (removes a moving finger, reflections, noise)
  function medianStack(faces, size) {
    const n = faces.length, out = new Uint8ClampedArray(size * size * 4), v = new Array(n);
    for (let i = 0; i < size * size * 4; i += 4) { for (let ch = 0; ch < 3; ch++) { for (let j = 0; j < n; j++) v[j] = faces[j][i + ch]; v.sort((a, b) => a - b); out[i + ch] = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2; } out[i + 3] = 255; }
    return out;
  }
  // fine alignment: measure where the dark gaps between stickers really are, then fit the 4 corners to them
  function refineQuad(rgba, W, H, quad, opts) {
    opts = opts || {};
    const L = new Float32Array(W * H); for (let i = 0, j = 0; j < W * H; i += 4, j++) L[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    const at = (x, y) => { if (x < 0 || y < 0 || x >= W - 1 || y >= H - 1) return NaN; const ix = x | 0, iy = y | 0, fx = x - ix, fy = y - iy, i = iy * W + ix; return (L[i] * (1 - fx) + L[i + 1] * fx) * (1 - fy) + (L[i + W] * (1 - fx) + L[i + W + 1] * fx) * fy; };
    const map = q => { const [x0, y0] = q[0], [x1, y1] = q[1], [x2, y2] = q[2], [x3, y3] = q[3];
      const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3; let a, b, c, d, e, f, g, h;
      if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) { a = x1 - x0; b = x2 - x1; c = x0; d = y1 - y0; e = y2 - y1; f = y0; g = 0; h = 0; }
      else { const den = dx1 * dy2 - dx2 * dy1; g = (dx3 * dy2 - dx2 * dy3) / den; h = (dx1 * dy3 - dx3 * dy1) / den; a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0; d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0; }
      return (u, v) => { const w = g * u + h * v + 1; return [(a * u + b * v + c) / w, (d * u + e * v + f) / w]; }; };
    const side = Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]);
    const R = opts.search || 0.07, NO = 43, SEG = [[0.04, 0.33], [0.36, 0.64], [0.67, 0.96]];
    const lim = side * (opts.range || 0.08);
    let q = quad.map(p => p.slice()); let nMeas = 0;
    for (let iter = 0; iter < (opts.iters || 4); iter++) {
      const M = map(q), meas = [];
      for (const t of [1 / 3, 2 / 3]) for (const vert of [true, false]) for (const [w0, w1] of SEG) {
        const prof = new Float64Array(NO); let bad = false;
        for (let k = 0; k < NO; k++) { const o = -R + 2 * R * k / (NO - 1); let sm = 0, n = 0;
          for (let j = 0; j < 12; j++) { const w = w0 + (w1 - w0) * (j + 0.5) / 12; const [x, y] = vert ? M(t + o, w) : M(w, t + o); const v = at(x, y); if (!isNaN(v)) { sm += v; n++; } }
          if (!n) { bad = true; break; } prof[k] = sm / n; }
        if (bad) continue;
        // darkest valley, then its dark-weighted centre (robust to a flat-bottomed gap)
        const sorted = Array.from(prof).sort((a, b) => a - b);
        let kmin = 0, kmax = 0; for (let k = 1; k < NO; k++) { if (prof[k] < prof[kmin]) kmin = k; if (prof[k] > prof[kmax]) kmax = k; }
        const dDark = sorted[Math.floor(NO * 0.75)] - prof[kmin], dLight = prof[kmax] - sorted[Math.floor(NO * 0.25)];
        const light = dLight > dDark * 1.15, depth = light ? dLight : dDark, km = light ? kmax : kmin, sg = light ? -1 : 1; // sg: work on a valley
        if (depth < (opts.minDepth || 18)) continue;
        const pv = k => sg * prof[k];
        const thr = pv(km) + depth * 0.5; let a = km, b = km; while (a > 0 && pv(a - 1) < thr) a--; while (b < NO - 1 && pv(b + 1) < thr) b++;
        if (a === 0 || b === NO - 1) continue; // valley runs off the search window: not a clean gap
        let sw = 0, so = 0; for (let k = a; k <= b; k++) { const wt = thr - pv(k) + 1e-3; sw += wt; so += wt * (-R + 2 * R * k / (NO - 1)); }
        const o = so / sw, wm = (w0 + w1) / 2;
        meas.push({ t, vert, wm, P: vert ? M(t + o, wm) : M(wm, t + o), wt: depth });
      }
      nMeas = meas.length; if (meas.length < 6) break;
      const cost = qq => { const MM = map(qq); let s = 0; for (const m of meas) { const [x, y] = m.vert ? MM(m.t, m.wm) : MM(m.wm, m.t); s += m.wt * ((x - m.P[0]) ** 2 + (y - m.P[1]) ** 2); } return s; };
      let best = cost(q);
      for (const step of [side * 0.01, side * 0.004, side * 0.0015, side * 0.0005]) {
        let improved = true, it = 0;
        while (improved && it++ < 20) { improved = false;
          for (let c = 0; c < 4; c++) for (let ax = 0; ax < 2; ax++) for (const sg of [-1, 1]) {
            const t2 = q.map(p => p.slice()); t2[c][ax] += sg * step; if (Math.abs(t2[c][ax] - quad[c][ax]) > lim) continue;
            const v = cost(t2); if (v < best - 1e-9) { best = v; q = t2; improved = true; } }
        }
      }
    }
    const moved = q.reduce((a, p, i) => a + Math.hypot(p[0] - quad[i][0], p[1] - quad[i][1]), 0) / 4 / side;
    return { quad: q, n: nMeas, moved };
  }
  E.refineQuad = refineQuad;
  // coarse re-grid: look in a 1.35x larger area for two evenly spaced vertical seams and two horizontal
  // seams (the dark gaps between stickers) and rebuild the grid from them. Fixes locks that are off by
  // 10-25% (picked up background / the cube body edge), which refineQuad's small window cannot.
  function regridQuad(rgba, W, H, quad, opts) {
    opts = opts || {}; const N = 300, X = opts.expand || 1.35;
    const cx = quad.reduce((a, p) => a + p[0], 0) / 4, cy = quad.reduce((a, p) => a + p[1], 0) / 4;
    const big = quad.map(([x, y]) => [cx + (x - cx) * X, cy + (y - cy) * X]);
    const img = warpQuad(rgba, W, H, big, N);
    const L = new Float32Array(N * N); for (let i = 0; i < N * N; i++) L[i] = 0.299 * img[i * 4] + 0.587 * img[i * 4 + 1] + 0.114 * img[i * 4 + 2];
    const dl = 4;
    // valley strength of each column / row: neighbours on both sides brighter than the line (median over the line)
    const prof = (vert, dd) => { const v = new Float32Array(N), buf = [];
      for (let k = dd; k < N - dd; k++) { buf.length = 0;
        for (let t = Math.round(N * 0.12); t < N * 0.88; t += 2) { const c = vert ? L[t * N + k] : L[k * N + t], a = vert ? L[t * N + k - dd] : L[(k - dd) * N + t], b = vert ? L[t * N + k + dd] : L[(k + dd) * N + t]; buf.push(Math.max(Math.min(a, b) - c, c - Math.max(a, b))); }
        buf.sort((x, y) => x - y); v[k] = Math.max(v[k], Math.max(0, buf[Math.floor(buf.length * 0.5)]) + 0.5 * Math.max(0, buf[Math.floor(buf.length * 0.75)])); }
      const sm = new Float32Array(N); for (let k = 1; k < N - 1; k++) sm[k] = Math.max(v[k - 1], v[k], v[k + 1]); return sm; };
    const pick = (V) => {
      const n0 = N / X; let best = null;
      for (let d = Math.round(n0 * 0.27); d <= Math.round(n0 * 0.42); d++) for (let a = d; a + 2 * d <= N; a++) {
        const b = a + d; const s = V[a] + V[b] - 0.15 * Math.abs((a - d + b + d) / 2 - N / 2) / N * 10; // mild pull to centre
        if (!best || s > best.s) best = { s, a, b, d };
      }
      return best;
    };
    const med = V => { const a = Array.from(V).sort((x, y) => x - y); return a[Math.floor(a.length / 2)] + 1; };
    const bestAxis = vert => { let r = null; for (const dd of [dl]) { const V = prof(vert, dd), p = pick(V); if (!p) continue; const z = p.s / med(V); if (!r || z > r.z) r = { V, p, z }; } return r; };
    const ax = bestAxis(true), ay = bestAxis(false); if (!ax || !ay) return { quad, ok: false };
    const cv = ax.V, rv = ay.V, pc = ax.p, pr = ay.p;
    if (!pc || !pr) return { quad, ok: false };
    // evidence must beat what the current grid gives
    const n0 = N / X, o = (N - n0) / 2;
    const cur = (V) => Math.max(V[Math.round(o + n0 / 3)], V[Math.round(o + n0 / 3) - 1], V[Math.round(o + n0 / 3) + 1]) + Math.max(V[Math.round(o + 2 * n0 / 3)], V[Math.round(o + 2 * n0 / 3) - 1], V[Math.round(o + 2 * n0 / 3) + 1]);
    const gain = (pc.s - cur(cv)) + (pr.s - cur(rv));
    const ratio = Math.min(pc.d, pr.d) / Math.max(pc.d, pr.d);
    const M = (u, v) => { const [x0, y0] = big[0], [x1, y1] = big[1], [x2, y2] = big[2], [x3, y3] = big[3];
      const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3; let A, B, C, D, Ee, Ff, G, Hh;
      if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) { A = x1 - x0; B = x2 - x1; C = x0; D = y1 - y0; Ee = y2 - y1; Ff = y0; G = 0; Hh = 0; }
      else { const den = dx1 * dy2 - dx2 * dy1; G = (dx3 * dy2 - dx2 * dy3) / den; Hh = (dx1 * dy3 - dx3 * dy1) / den; A = x1 - x0 + G * x1; B = x3 - x0 + Hh * x3; C = x0; D = y1 - y0 + G * y1; Ee = y3 - y0 + Hh * y3; Ff = y0; }
      const w = G * u + Hh * v + 1; return [(A * u + B * v + C) / w, (D * u + Ee * v + Ff) / w]; };
    const u0 = (pc.a - pc.d) / N, u1 = (pc.b + pc.d) / N, v0 = (pr.a - pr.d) / N, v1 = (pr.b + pr.d) / N;
    const q = [M(u0, v0), M(u1, v0), M(u1, v1), M(u0, v1)];
    const ok = ratio > 0.85 && gain > (opts.minGain == null ? 3 : opts.minGain) && pc.s > 6 && pr.s > 6;
    return { quad: ok ? q : quad, ok, gain, ratio, cols: [pc.a, pc.b, pc.d], rows: [pr.a, pr.b, pr.d] };
  }
  // fit the grid to a KNOWN design: move the quad so each of the 9 cells looks as much as possible like
  // one of the 54 design stickers (any rotation). Independent of how visible the seams are.
  function designFitQuad(rgba, W, H, quad, ref, opts) {
    opts = opts || {}; const N = opts.N || 120;
    const cost = q => {
      const face = warpQuad(rgba, W, H, q, N); const pats = E.extractPatches(face, N, N, 0, 0, N);
      let s = 0;
      for (const p of pats) { const d = E.descriptor(p, null, true); let b = 1e18; for (let j = 0; j < 54; j++) for (let k = 0; k < 4; k++) { const v = E.dist2(d, ref.ldesc[j][k]); if (v < b) b = v; } s += b; }
      return s / (9 * ref.lscale);
    };
    const side = Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]);
    const lim = side * (opts.range == null ? 0.25 : opts.range);
    let q = quad.map(p => p.slice()), best = cost(q); const start = best; let evals = 1;
    const tryQ = t => { if (t.some((p, i) => Math.abs(p[0] - quad[i][0]) > lim || Math.abs(p[1] - quad[i][1]) > lim)) return false; const v = cost(t); evals++; if (v < best - 1e-6) { best = v; q = t; return true; } return false; };
    const ctr = () => [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4];
    // coarse sweep over shift x shift x scale (the lock can be 10-25% off), then local descent
    if (opts.sweep !== false) {
      const q0 = q.map(p => p.slice()), [cx0, cy0] = ctr(); const R = opts.sweepR || 0.15, St = opts.sweepStep || 0.03;
      for (const f of [0.86, 0.93, 1, 1.07, 1.15]) for (let dy = -R; dy <= R + 1e-9; dy += St) for (let dx = -R; dx <= R + 1e-9; dx += St) {
        tryQ(q0.map(([x, y]) => [cx0 + (x - cx0) * f + dx * side, cy0 + (y - cy0) * f + dy * side]));
      }
    }
    for (const st of [0.02, 0.01, 0.005]) {
      const step = side * st; let improved = true, it = 0;
      while (improved && it++ < 8) { improved = false;
        // whole-grid moves first (shift / scale), then single corners
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (tryQ(q.map(([x, y]) => [x + dx * step, y + dy * step]))) improved = true;
        for (const sg of [1, -1]) { const [cx, cy] = ctr(); const f = 1 + sg * st; if (tryQ(q.map(([x, y]) => [cx + (x - cx) * f, cy + (y - cy) * f]))) improved = true; }
        for (let c = 0; c < 4; c++) for (let ax = 0; ax < 2; ax++) for (const sg of [-1, 1]) { const t = q.map(p => p.slice()); t[c][ax] += sg * step; if (tryQ(t)) improved = true; }
      }
    }
    return { quad: q, cost: best, start, gain: start - best, evals };
  }
  E.designFitQuad = designFitQuad;
  E.regridQuad = function (rgba, W, H, quad, opts) {
    const a = regridQuad(rgba, W, H, quad, Object.assign({}, opts, { expand: 1.35 }));
    if (!a.ok) return a;
    const b = regridQuad(rgba, W, H, quad, Object.assign({}, opts, { expand: 1.22 }));
    const side = Math.hypot(a.quad[1][0] - a.quad[0][0], a.quad[1][1] - a.quad[0][1]);
    const diff = a.quad.reduce((s, p, i) => s + Math.hypot(p[0] - b.quad[i][0], p[1] - b.quad[i][1]), 0) / 4 / side;
    if (!b.ok || diff > 0.025) return Object.assign({}, a, { quad, ok: false, agree: diff });
    return Object.assign({}, a, { agree: diff });
  };
  E.lockQuad = lockQuad; E.warpQuad = warpQuad; E.medianStack = medianStack; E.gradients = gradients;
})();
