import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

// ---------- Maße (Meter) laut Bestandsplan ----------
// Grundriss-Koordinaten: x = links→rechts (0..10,25), y = vorne→hinten (0..8,335)
const W = 10.25, D = 8.335;
const CX = W / 2, CZ = D / 2;
const EG_H = 2.70;            // lichte Raumhöhe EG
const SLAB = 0.30;            // Deckenstärke
const DG0 = EG_H + SLAB;      // Fußboden DG
const KG_H = 2.10;            // lichte Höhe Keller (Annahme)
const KG0 = -(KG_H + SLAB);   // Fußboden Keller
const GROUND = -0.30;         // Gelände
const KNEE = 0.5;             // Kniestock (Annahme)
const PITCH = THREE.MathUtils.degToRad(42); // Dachneigung (Annahme)
const T = Math.tan(PITCH);
const CAP = 2.55;             // Kehlbalkenlage DG

const roofH = (y) => KNEE + Math.max(0, Math.min(y - 0.45, 7.885 - y)) * T;

// ---------- Szene ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe6ec);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(12, 20, 14); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
scene.add(sun);

// ---------- Materialien ----------
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
const mat = {
  wall: M(0xf2efe9), wallKG: M(0xd9d5cc), outer: M(0xe9e2d4),
  floor: M(0xd8c3a0), floorKG: M(0xa9a9a9), slab: M(0xbdb7ad),
  steel: M(0x2f3336, { metalness: 0.7, roughness: 0.35 }),
  oak: M(0xc8a06a, { roughness: 0.6 }),
  kgStair: M(0x2bb39a), kgWall: M(0x7fd3c3),
  pipe: M(0xf39c12, { emissive: 0x7a4300 }),
  glass: M(0x5dade2, { transparent: true, opacity: 0.55, metalness: 0.2, roughness: 0.1 }),
  glassNew: M(0x1f5f99, { transparent: true, opacity: 0.75 }),
  roof: M(0x9c4a32, { transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  annexRoof: M(0x6e6e6e),
  bath: M(0xaed6f1), ground: M(0x7f9f6a, { transparent: true, opacity: 0.55 }),
  kitchen: M(0xe5e5e5),
};

const groups = {};
for (const k of ['kg', 'eg', 'dg', 'roof', 'ground', 'labels']) { groups[k] = new THREE.Group(); scene.add(groups[k]); }
const labelGroups = { kg: new THREE.Group(), eg: new THREE.Group(), dg: new THREE.Group() };
groups.kg.add(labelGroups.kg); groups.eg.add(labelGroups.eg); groups.dg.add(labelGroups.dg);

// Box im Grundriss-System: x0..x1, y0..y1, Höhe z0..z1
function box(g, x0, y0, x1, y1, z0, z1, m) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, z1 - z0, y1 - y0), m);
  mesh.position.set((x0 + x1) / 2 - CX, (z0 + z1) / 2, CZ - (y0 + y1) / 2);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh); return mesh;
}
// Wand mit Öffnungen. ops: [[von, bis, unten, oben], ...] entlang der Wandachse
function wall(g, x0, y0, x1, y1, z0, h, m, ops = []) {
  const alongX = (x1 - x0) >= (y1 - y0);
  const a0 = alongX ? x0 : y0, a1 = alongX ? x1 : y1;
  const seg = (s, e, zb, zt, mm = m) => {
    if (e - s < 0.01 || zt - zb < 0.01) return;
    alongX ? box(g, s, y0, e, y1, z0 + zb, z0 + zt, mm) : box(g, x0, s, x1, e, z0 + zb, z0 + zt, mm);
  };
  ops = [...ops].sort((p, q) => p[0] - q[0]);
  let cur = a0;
  for (const [s, e, zb, zt, glass] of ops) {
    seg(cur, s, 0, h);
    seg(s, e, 0, zb);            // Brüstung
    seg(s, e, zt, h);            // Sturz
    if (glass) {                 // Glasscheibe mittig in der Wand
      const t = 0.03;
      alongX ? box(g, s, (y0 + y1) / 2 - t, e, (y0 + y1) / 2 + t, z0 + zb, z0 + zt, glass)
             : box(g, (x0 + x1) / 2 - t, s, (x0 + x1) / 2 + t, e, z0 + zb, z0 + zt, glass);
    }
    cur = e;
  }
  seg(cur, a1, 0, h);
}
const door = (s, e) => [s, e, 0, 2.05];
const win = (s, e, nw = false) => [s, e, 0.9, 2.2, nw ? mat.glassNew : mat.glass];

// Wand im DG, deren Oberkante der Dachschräge folgt (läuft in y-Richtung)
function dgWallY(g, x0, x1, y0, y1, m, cap = CAP, ops = []) {
  const shape = new THREE.Shape();
  shape.moveTo(y0, 0); shape.lineTo(y1, 0);
  const n = 40;
  for (let i = 0; i <= n; i++) { const y = y1 - (y1 - y0) * i / n; shape.lineTo(y, Math.min(roofH(y), cap)); }
  shape.lineTo(y0, 0);
  for (const [s, e] of ops) {
    const hole = new THREE.Path();
    hole.moveTo(s, 0.001); hole.lineTo(e, 0.001); hole.lineTo(e, 2.0); hole.lineTo(s, 2.0); hole.lineTo(s, 0.001);
    shape.holes.push(hole);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false });
  const mesh = new THREE.Mesh(geo, m);
  mesh.rotation.y = Math.PI / 2;
  mesh.position.set(x0 - CX, DG0, CZ);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh); return mesh;
}
// Wand im DG in x-Richtung (konstante y), Höhe = Dachhöhe an dieser Stelle
function dgWallX(g, x0, x1, y0, y1, m, ops = []) {
  const h = Math.min(roofH(y0), roofH(y1), CAP);
  wall(g, x0, y0, x1, y1, DG0, h, m, ops.map(o => [o[0], o[1], 0, Math.min(2.0, h)]));
}

function label(g, text, x, y, z, color = '#1b2631') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath();
  ctx.roundRect(8, 24, 496, 80, 20); ctx.fill();
  ctx.fillStyle = color; ctx.font = 'bold 48px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: true }));
  sp.scale.set(2.2, 0.55, 1); sp.position.set(x - CX, z, CZ - y); sp.renderOrder = 10;
  g.add(sp);
}

// ---------- KELLER ----------
{
  const g = groups.kg, L = labelGroups.kg;
  const KD = 4.30;
  box(g, 0, 0, W, KD, KG0 - 0.15, KG0, mat.floorKG);
  wall(g, 0, 0, W, 0.55, KG0, -KG0, mat.wallKG, [[1.75, 2.5, 1.7, 2.2, mat.glass], [3.25, 4.0, 1.7, 2.2, mat.glass],
    [6.25, 7.0, 1.7, 2.2, mat.glass], [7.75, 8.5, 1.7, 2.2, mat.glass]]);
  wall(g, 0, KD - 0.55, W, KD, KG0, -KG0, mat.wallKG);
  wall(g, 0, 0.55, 0.55, KD - 0.55, KG0, -KG0, mat.wallKG);
  wall(g, W - 0.55, 0.55, W, KD - 0.55, KG0, -KG0, mat.wallKG);
  wall(g, 3.835, 0.55, 4.075, KD - 0.55, KG0, KG_H, mat.wallKG, [door(1.6, 2.4)]);
  wall(g, 6.105, 0.55, 6.345, KD - 0.55, KG0, KG_H, mat.wallKG, [door(1.6, 2.4)]);
  // vorhandene Kellertreppe (bleibt): unten vorne (y 2,25) → oben hinten (y 3,7)
  const n = 12, r = -KG0 / n, y0 = 2.25, y1 = 3.7, gd = (y1 - y0) / (n - 1);
  for (let i = 0; i < n - 1; i++)
    box(g, 5.3, y0 + i * gd, 5.8, y0 + (i + 1) * gd, KG0, KG0 + (i + 1) * r, mat.kgStair);
  label(L, 'Vorrat', 2.2, 2.1, KG0 + 1.4); label(L, 'Vorrat', 8.0, 2.1, KG0 + 1.4);
  label(L, 'Kellerflur', 4.7, 1.2, KG0 + 1.4);
}

// ---------- ERDGESCHOSS ----------
{
  const g = groups.eg, L = labelGroups.eg, H = EG_H;
  // Fußboden mit Öffnung für Kellertreppe
  for (const [a, b, c, d] of [[0, 0, W, 2.25], [0, 3.7, W, D], [0, 2.25, 5.3, 3.7], [5.8, 2.25, W, 3.7]])
    box(g, a, b, c, d, -SLAB, 0, mat.floor);
  // weiße Decke EG (unter dem DG-Fußboden, mit Treppenloch)
  for (const [a, b, c, d] of [[0.45, 0.45, W - 0.45, 4.545], [0.45, 4.545, 4.95, D - 0.45], [6.075, 4.545, W - 0.45, 6.885], [6.9, 6.885, W - 0.45, D - 0.45]])
    box(groups.dg, a, b, c, d, EG_H - 0.02, EG_H - 0.005, M(0xf7f5f0));
  // Außenwände
  wall(g, 0, 0, W, 0.45, 0, H, mat.outer, [win(1.235, 3.125), [4.585, 5.595, 0, 2.15], win(7.055, 8.945)]);
  wall(g, 0, D - 0.45, W, D, 0, H, mat.outer, [door(4.2, 5.0), win(7.2, 8.6)]);
  wall(g, 0, 0.45, 0.45, D - 0.45, 0, H, mat.outer, [win(5.5, 6.86)]);
  wall(g, W - 0.45, 0.45, W, D - 0.45, 0, H, mat.outer);
  // Innenwände Variante 6 (offener Wohnbereich)
  wall(g, 0.45, 4.0, 3.98, 4.115, 0, H, mat.wall);                                    // Gäste | Wohnen
  wall(g, 2.2, 2.1, 2.3, 4.0, 0, H, mat.wall);                                        // Gästebad
  wall(g, 2.2, 2.1, 3.98, 2.2, 0, H, mat.wall);
  wall(g, 3.98, 0.45, 4.095, 4.115, 0, H, mat.wall, [door(0.6, 1.4), door(2.5, 3.3)]); // nur vorne bleibt
  // Unterzüge (Stahlträger) an der Decke statt der abgerissenen Wände – gehören zur Decke (DG-Gruppe)
  const uz = M(0x9aa0a6, { metalness: 0.5, roughness: 0.4 });
  box(groups.dg, 4.0, 4.115, 4.08, D - 0.45, H - 0.22, H - 0.02, uz);
  box(groups.dg, 6.12, 0.45, 6.2, D - 0.45, H - 0.22, H - 0.02, uz);
  box(groups.dg, 6.22, 4.02, 9.8, 4.1, H - 0.22, H - 0.02, uz);
  // Kellertreppe eingemauert (bis zur Decke) mit eigener Tür
  wall(g, 5.05, 2.05, 5.15, 4.1, 0, H, mat.kgWall);
  wall(g, 5.05, 2.05, 6.2, 2.15, 0, H, mat.kgWall);
  wall(g, 6.105, 2.15, 6.2, 4.1, 0, H, mat.kgWall);
  wall(g, 5.05, 4.0, 6.105, 4.1, 0, H, mat.kgWall, [door(5.2, 6.05)]);
  box(g, 5.15, 2.15, 6.105, 4.0, H - 0.02, H, mat.kgWall);
  // ---- Neue L-Treppe: Stahlwangen + Eichenstufen, Podest hinten ----
  const r = DG0 / 17, gd = 0.26, tread = 0.045;
  // unterer Lauf an der Rückwand (steigt nach links), 6 Stufen
  const xs = 7.76, yb0 = 6.92, yb1 = 7.84;
  for (let i = 1; i <= 6; i++) box(g, xs - i * gd, yb0, xs - (i - 1) * gd + 0.03, yb1, i * r - tread, i * r, mat.oak);
  // Podest
  const hp = 7 * r;
  box(g, 5.15, 6.885, 6.2, 7.86, hp - 0.06, hp, mat.oak); box(g, 5.15, 6.885, 6.2, 7.86, hp - 0.2, hp - 0.06, mat.steel);
  for (const [x, y] of [[5.2, 6.93], [6.15, 6.93]]) box(g, x - 0.04, y - 0.04, x + 0.04, y + 0.04, 0, hp - 0.2, mat.steel);
  // oberer Lauf (steigt nach vorne), 9 Stufen bis DG
  const xL = 5.18, xR = 6.08, yP = 6.885;
  for (let j = 1; j <= 9; j++) box(g, xL + 0.05, yP - j * gd, xR - 0.05, yP - (j - 1) * gd + 0.03, (7 + j) * r - tread, (7 + j) * r, mat.oak);
  const yTop = yP - 9 * gd;
  function stringer(x0, y0, h0, x1, y1, h1, w = 0.03) {
    const dx = x1 - x0, dy = y1 - y0, dh = h1 - h0, L2 = Math.hypot(dx, dy);
    const len = Math.hypot(L2, dh);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.26, len), mat.steel);
    m.position.set((x0 + x1) / 2 - CX, (h0 + h1) / 2 - 0.12, CZ - (y0 + y1) / 2);
    m.rotation.order = 'YXZ'; m.rotation.y = Math.atan2(dx, -dy); m.rotation.x = -Math.atan2(dh, L2);
    m.castShadow = true; g.add(m); return m;
  }
  // Wangen unterer Lauf
  stringer(xs, yb0 - 0.02, 0, 6.2, yb0 - 0.02, hp); stringer(xs, yb1 + 0.02, 0, 6.2, yb1 + 0.02, hp);
  // Wangen oberer Lauf
  stringer(xL, yP, hp, xL, yTop, DG0); stringer(xR, yP, hp, xR, yTop, DG0);
  // Geländer (offene Seiten): Handlauf + Stäbe
  const rail = (x0, y0, h0, x1, y1, h1) => { const m = stringer(x0, y0, h0 + 1.02, x1, y1, h1 + 1.02, 0.04); m.scale.y = 0.16; };
  rail(xs, yb0 - 0.05, 0, 6.2, yb0 - 0.05, hp); rail(xL - 0.03, yP, hp, xL - 0.03, yTop, DG0);
  for (let i = 1; i <= 6; i++) box(g, xs - i * gd + 0.1, yb0 - 0.07, xs - i * gd + 0.12, yb0 - 0.05, i * r, i * r + 0.9, mat.steel);
  for (let j = 1; j <= 9; j++) box(g, xL - 0.05, yP - j * gd + 0.1, xL - 0.03, yP - j * gd + 0.12, (7 + j) * r, (7 + j) * r + 0.9, mat.steel);
  box(g, 5.12, 6.885, 5.15, 7.86, hp, hp + 0.95, mat.steel);
  // Fallleitung DG-Bad → Keller (durch den Kellerschacht)
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, DG0 + 0.8 - KG0, 16), mat.pipe);
  pipe.position.set(5.9 - CX, (DG0 + 0.8 + KG0) / 2, CZ - 2.5); g.add(pipe);

  label(L, 'Gästezimmer', 1.3, 1.0, 1.6); label(L, 'Gästebad', 3.1, 3.1, 1.6);
  label(L, 'Wohnen (offen)', 2.2, 6.0, 1.9); label(L, 'Küche (offen)', 8.0, 2.2, 1.9);
  label(L, 'Essen (offen)', 8.5, 5.5, 1.9); label(L, 'Eingang (offen)', 4.6, 1.2, 1.9);
  label(L, 'Keller ↓', 5.6, 3.0, 2.2, '#117a65'); label(L, 'L-Treppe Stahl/Eiche', 6.8, 7.4, 2.4, '#7b241c');

  // ---- Anbau (unverändert) ----
  const AH = 2.6, y8 = D, y13 = 13.45, y17 = 17.28;
  box(g, 0.15, y8, 5.2, y13, -SLAB, 0, mat.floor); box(g, 0.15, y13, 2.9, y17, -SLAB, 0, mat.floor);
  wall(g, 0.15, y8, 0.45, y13, 0, AH, mat.outer, [win(9.3, 10.1)]);
  wall(g, 4.9, y8, 5.2, y13, 0, AH, mat.outer, [door(9.4, 10.3)]);
  wall(g, 0.15, y13, 5.2, y13 + 0.3, 0, AH, mat.outer);
  wall(g, 0.15, y13 + 0.3, 0.45, y17, 0, AH, mat.outer);
  wall(g, 2.6, y13 + 0.3, 2.9, y17, 0, AH, mat.outer, [door(14.5, 15.5)]);
  wall(g, 0.15, y17 - 0.3, 2.9, y17, 0, AH, mat.outer);
  wall(g, 0.45, 10.75, 4.9, 10.87, 0, AH, mat.wall, [door(3.3, 4.1)]);
  wall(g, 3.0, y8, 3.12, 10.75, 0, AH, mat.wall, [door(9.2, 10.0)]);
  box(groups.roof, 0.0, y8, 5.35, y13, AH, AH + 0.2, mat.annexRoof);
  box(groups.roof, 0.0, y13, 3.05, y17 + 0.15, AH, AH + 0.2, mat.annexRoof);
  label(L, 'Bad', 1.6, 9.6, 1.6); label(L, 'Flur', 4.0, 9.6, 1.6);
  label(L, 'HWR', 2.6, 12.1, 1.6); label(L, 'Geräte', 1.5, 15.4, 1.6);
}

// ---------- DACHGESCHOSS ----------
{
  const g = groups.dg, L = labelGroups.dg;
  // Decke/Fußboden mit Treppenloch (x 4,95–6,075 / y 4,0–7,885)
  for (const [a, b, c, d] of [[0, 0, W, 4.545], [0, 4.545, 4.95, D], [6.075, 4.545, W, 6.885], [6.9, 6.885, W, D]])
    box(g, a, b, c, d, EG_H, DG0, mat.floor);
  box(g, 3.835, 0.45, 6.075, 2.9, DG0 + 0.001, DG0 + 0.01, mat.bath);
  // Kniestöcke vorne/hinten
  wall(g, 0, 0, W, 0.45, DG0, KNEE, mat.outer);
  wall(g, 0, D - 0.45, W, D, DG0, KNEE, mat.outer);
  // Giebelwände bis zum First
  dgWallY(g, 0, 0.45, 0, D, mat.outer, 99);
  dgWallY(g, W - 0.45, W, 0, D, mat.outer, 99);
  // Fenster Giebel links (vorhanden) und rechts (neu)
  for (const [a, b] of [[1.9, 2.45], [3.7, 4.5], [5.8, 6.3]]) box(g, -0.02, a, 0.47, b, DG0 + 0.9, DG0 + 2.0, mat.glass);
  for (const [a, b] of [[2.0, 3.0], [5.0, 6.0]]) box(g, W - 0.47, a, W + 0.02, b, DG0 + 0.9, DG0 + 2.1, mat.glassNew);
  // Innenwände
  dgWallY(g, 3.72, 3.835, 0.45, 7.885, mat.wall, CAP, [[3.1, 3.9]]);
  dgWallY(g, 6.075, 6.19, 0.45, 6.885, mat.wall, CAP, [[3.1, 3.95]]);
  dgWallX(g, 6.19, 7.0, 6.885, 6.985, mat.wall);
  dgWallY(g, 6.9, 7.0, 6.985, 7.885, mat.wall);
  dgWallY(g, 7.1, 7.2, 2.95, 4.45, mat.wall, CAP, [[3.2, 4.0]]);
  dgWallX(g, 0.45, 3.72, 2.59, 2.705, mat.wall, [[2.6, 3.4]]);
  dgWallX(g, 3.835, 6.075, 2.9, 3.0, mat.wall, [[4.2, 5.0]]);
  dgWallX(g, 6.19, 7.2, 2.95, 3.05, mat.wall);
  dgWallX(g, 6.19, 9.8, 4.45, 4.56, mat.wall, [[6.25, 7.05]]);
  dgWallX(g, 3.835, 4.95, 6.0, 6.1, mat.wall, [[4.0, 4.8]]);
  // Geländer am Treppenloch (Stahl)
  const rail = (x0, y0, x1, y1) => { box(g, x0, y0, x1, y1, DG0 + 0.95, DG0 + 1.0, mat.steel); };
  rail(4.93, 4.545, 4.97, 6.0);
  for (let y = 4.6; y < 6.0; y += 0.3) box(g, 4.935, y, 4.965, y + 0.03, DG0, DG0 + 0.95, mat.steel);

  label(L, 'Schlafen', 2.1, 5.2, DG0 + 1.5); label(L, 'Ankleide', 2.1, 1.5, DG0 + 1.0);
  label(L, 'Bad neu', 4.95, 1.8, DG0 + 1.3, '#1f618d'); label(L, 'Flur', 4.9, 3.6, DG0 + 1.6);
  label(L, 'Zimmer A', 8.3, 2.0, DG0 + 1.4); label(L, 'Zimmer B', 8.0, 6.6, DG0 + 1.4);
  label(L, 'Abstell', 4.4, 7.0, DG0 + 1.0);
}

// ---------- DACH ----------
{
  const g = groups.roof, over = 0.5, th = 0.22;
  const ridgeY = D / 2, ridgeH = DG0 + roofH(ridgeY) + 0.15;
  const eaveH = ridgeH - (ridgeY + over) * T;
  const len = Math.hypot(ridgeY + over, ridgeH - eaveH);
  for (const side of [1, -1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, th, len), mat.roof);
    const yMid = side > 0 ? (ridgeY - over) / 2 : D - (ridgeY - over) / 2;
    m.position.set(0, (ridgeH + eaveH) / 2 + th / 2, CZ - yMid);
    m.rotation.x = side * PITCH; m.castShadow = true; g.add(m);
    // Innenverkleidung (weiß) unter der Dachfläche
    const lin = new THREE.Mesh(new THREE.BoxGeometry(W - 0.9, 0.02, len), M(0xf7f5f0));
    lin.position.set(0, (ridgeH + eaveH) / 2 - 0.14, CZ - yMid); lin.rotation.x = side * PITCH; g.add(lin);
  }
  // Kehlbalkendecke DG (flach, weiß)
  const yc = 0.45 + (CAP - KNEE) / T;
  box(g, 0.45, yc, W - 0.45, D - yc, DG0 + CAP, DG0 + CAP + 0.02, M(0xf7f5f0));
  }


// ---------- MÖBEL (skandinavischer Stil) ----------
const S = {
  white: M(0xf6f4ef), oak: M(0xdcbc8c, { roughness: 0.7 }), birch: M(0xe8d6b0),
  fabric: M(0xc9c7c1), sage: M(0x9bb59a), mustard: M(0xd9a441), blue: M(0x8fa9bf),
  black: M(0x2b2b2b, { metalness: 0.4, roughness: 0.5 }), rug: M(0xece6da), rug2: M(0xb7c4c9),
  linen: M(0xfbfaf7), green: M(0x5f8f5a), pot: M(0xe0d5c5), ceramic: M(0xffffff, { roughness: 0.3 }),
  glass: M(0xcfe8f5, { transparent: true, opacity: 0.35 }), mirror: M(0xdde7ee, { metalness: 0.9, roughness: 0.1 }),
  steelK: M(0xb8bcbf, { metalness: 0.8, roughness: 0.3 }),
};
const furn = { eg: new THREE.Group(), dg: new THREE.Group() };
groups.eg.add(furn.eg); groups.dg.add(furn.dg);
function cyl(g, x, y, z0, z1, r, m, seg = 24) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, z1 - z0, seg), m);
  c.position.set(x - CX, (z0 + z1) / 2, CZ - y); c.castShadow = true; g.add(c); return c;
}
function sph(g, x, y, z, r, m) {
  const c = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), m);
  c.position.set(x - CX, z, CZ - y); c.castShadow = true; g.add(c);
}
const rug = (g, x0, y0, x1, y1, z, m = S.rug) => box(g, x0, y0, x1, y1, z + 0.002, z + 0.015, m);
function legs(g, x0, y0, x1, y1, z0, z1, r = 0.02, m = S.oak) {
  const i = 0.06;
  for (const [x, y] of [[x0 + i, y0 + i], [x1 - i, y0 + i], [x0 + i, y1 - i], [x1 - i, y1 - i]]) cyl(g, x, y, z0, z1, r, m, 10);
}
function bed(g, x0, y0, x1, y1, z, head, duvet = S.blue) {
  legs(g, x0, y0, x1, y1, z, z + 0.15);
  box(g, x0, y0, x1, y1, z + 0.15, z + 0.30, S.oak);
  box(g, x0 + 0.03, y0 + 0.03, x1 - 0.03, y1 - 0.03, z + 0.30, z + 0.52, S.linen);
  const hb = 0.06;
  if (head === 'w') { box(g, x0 - hb, y0, x0, y1, z, z + 1.0, S.oak); box(g, x0 + 0.6, y0 + 0.03, x1 - 0.03, y1 - 0.03, z + 0.52, z + 0.58, duvet);
    for (const t of [0.25, 0.75]) box(g, x0 + 0.08, y0 + (y1 - y0) * t - 0.3, x0 + 0.5, y0 + (y1 - y0) * t + 0.3, z + 0.52, z + 0.66, S.white); }
  if (head === 'e') { box(g, x1, y0, x1 + hb, y1, z, z + 1.0, S.oak); box(g, x0 + 0.03, y0 + 0.03, x1 - 0.6, y1 - 0.03, z + 0.52, z + 0.58, duvet);
    for (const t of [0.25, 0.75]) box(g, x1 - 0.5, y0 + (y1 - y0) * t - 0.3, x1 - 0.08, y0 + (y1 - y0) * t + 0.3, z + 0.52, z + 0.66, S.white); }
  if (head === 'n') { box(g, x0, y1, x1, y1 + hb, z, z + 1.0, S.oak); box(g, x0 + 0.03, y0 + 0.03, x1 - 0.03, y1 - 0.6, z + 0.52, z + 0.58, duvet);
    for (const t of [0.25, 0.75]) box(g, x0 + (x1 - x0) * t - 0.3, y1 - 0.5, x0 + (x1 - x0) * t + 0.3, y1 - 0.08, z + 0.52, z + 0.66, S.white); }
  if (head === 's') { box(g, x0, y0 - hb, x1, y0, z, z + 1.0, S.oak); box(g, x0 + 0.03, y0 + 0.6, x1 - 0.03, y1 - 0.03, z + 0.52, z + 0.58, duvet);
    for (const t of [0.25, 0.75]) box(g, x0 + (x1 - x0) * t - 0.3, y0 + 0.08, x0 + (x1 - x0) * t + 0.3, y0 + 0.5, z + 0.52, z + 0.66, S.white); }
}
function nightstand(g, x, y, z) { legs(g, x - 0.2, y - 0.2, x + 0.2, y + 0.2, z, z + 0.2); box(g, x - 0.2, y - 0.2, x + 0.2, y + 0.2, z + 0.2, z + 0.5, S.white);
  cyl(g, x, y, z + 0.5, z + 0.75, 0.02, S.black); sph(g, x, y, z + 0.8, 0.09, S.linen); }
function sofa(g, x0, y0, x1, y1, z, back, m = S.fabric) {
  legs(g, x0, y0, x1, y1, z, z + 0.12, 0.02, S.oak);
  box(g, x0, y0, x1, y1, z + 0.12, z + 0.42, m);
  const t = 0.18;
  if (back === 'n') box(g, x0, y1 - t, x1, y1, z + 0.42, z + 0.8, m);
  if (back === 's') box(g, x0, y0, x1, y0 + t, z + 0.42, z + 0.8, m);
  if (back === 'w') box(g, x0, y0, x0 + t, y1, z + 0.42, z + 0.8, m);
  if (back === 'e') box(g, x1 - t, y0, x1, y1, z + 0.42, z + 0.8, m);
  if (back === 'n' || back === 's') { box(g, x0, y0, x0 + 0.15, y1, z + 0.42, z + 0.62, m); box(g, x1 - 0.15, y0, x1, y1, z + 0.42, z + 0.62, m); }
  else { box(g, x0, y0, x1, y0 + 0.15, z + 0.42, z + 0.62, m); box(g, x0, y1 - 0.15, x1, y1, z + 0.42, z + 0.62, m); }
}
function chair(g, x, y, z, back, seat = S.white) {
  legs(g, x - 0.22, y - 0.22, x + 0.22, y + 0.22, z, z + 0.45, 0.015);
  box(g, x - 0.22, y - 0.22, x + 0.22, y + 0.22, z + 0.45, z + 0.49, seat);
  const b = { n: [x - 0.22, y + 0.18, x + 0.22, y + 0.22], s: [x - 0.22, y - 0.22, x + 0.22, y - 0.18],
              e: [x + 0.18, y - 0.22, x + 0.22, y + 0.22], w: [x - 0.22, y - 0.22, x - 0.18, y + 0.22] }[back];
  box(g, b[0], b[1], b[2], b[3], z + 0.49, z + 0.85, seat);
}
function table(g, x0, y0, x1, y1, z, h = 0.75, top = S.oak) { legs(g, x0, y0, x1, y1, z, z + h - 0.03); box(g, x0, y0, x1, y1, z + h - 0.03, z + h, top); }
function roundTable(g, x, y, z, r, h = 0.42) { cyl(g, x, y, z + h - 0.03, z + h, r, S.oak, 32); cyl(g, x, y, z, z + h - 0.03, 0.03, S.black, 10); cyl(g, x, y, z, z + 0.02, 0.2, S.black, 20); }
function cabinet(g, x0, y0, x1, y1, z, h, m = S.white) { box(g, x0, y0, x1, y1, z + 0.08, z + h, m); box(g, x0 + 0.03, y0 + 0.03, x1 - 0.03, y1 - 0.03, z, z + 0.08, S.black); }
function plant(g, x, y, z, s = 1) { cyl(g, x, y, z, z + 0.35 * s, 0.15 * s, S.pot); sph(g, x, y, z + 0.6 * s, 0.32 * s, S.green); sph(g, x + 0.12 * s, y + 0.08 * s, z + 0.85 * s, 0.2 * s, S.green); }
function floorLamp(g, x, y, z) { cyl(g, x, y, z, z + 0.03, 0.16, S.black); cyl(g, x, y, z, z + 1.5, 0.015, S.black, 8);
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 0.25, 24, 1, true), S.linen); sh.position.set(x - CX, z + 1.55, CZ - y); g.add(sh); }
function pendant(g, x, y, zc) { cyl(g, x, y, zc - 0.8, zc, 0.005, S.black, 6);
  const sh = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.22, 24, 1, true), S.white); sh.material.side = THREE.DoubleSide;
  sh.position.set(x - CX, zc - 0.9, CZ - y); g.add(sh); }
function toilet(g, x, y, z, dir) { // dir: Richtung in die man schaut
  const d = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }[dir];
  cyl(g, x, y, z, z + 0.4, 0.19, S.ceramic); box(g, x - d[0] * 0.3 - 0.18 * Math.abs(d[1]) - 0.07 * Math.abs(d[0]), y - d[1] * 0.3 - 0.18 * Math.abs(d[0]) - 0.07 * Math.abs(d[1]),
    x - d[0] * 0.3 + 0.18 * Math.abs(d[1]) + 0.07 * Math.abs(d[0]), y - d[1] * 0.3 + 0.18 * Math.abs(d[0]) + 0.07 * Math.abs(d[1]), z, z + 0.8, S.ceramic); }
function vanity(g, x0, y0, x1, y1, z) { box(g, x0, y0, x1, y1, z + 0.35, z + 0.82, S.oak); box(g, x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.05, z + 0.82, z + 0.9, S.ceramic); }
function wardrobe(g, x0, y0, x1, y1, z, h = 2.1) { box(g, x0, y0, x1, y1, z + 0.05, z + h, S.white); box(g, x0 + 0.02, y0 + 0.02, x1 - 0.02, y1 - 0.02, z, z + 0.05, S.oak); }
function desk(g, x0, y0, x1, y1, z) { table(g, x0, y0, x1, y1, z, 0.74, S.birch); }
function shelfLow(g, x0, y0, x1, y1, z, h = 0.5) { box(g, x0, y0, x1, y1, z, z + h, S.birch); }
function tv(g, x0, y0, x1, y1, z, face) { cabinet(g, x0, y0, x1, y1, z, 0.45, S.oak);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (face === 'n' || face === 's') box(g, cx - 0.6, cy - 0.02, cx + 0.6, cy + 0.02, z + 0.55, z + 1.25, S.black);
  else box(g, cx - 0.02, cy - 0.6, cx + 0.02, cy + 0.6, z + 0.55, z + 1.25, S.black); }

// --- EG ---
{
  const g = furn.eg, z = 0;
  // Gästezimmer
  rug(g, 0.7, 1.4, 2.0, 3.0, z, S.rug2);
  bed(g, 0.6, 2.05, 2.0, 3.95, z, 'n', S.sage);
  wardrobe(g, 0.45, 0.5, 1.05, 1.85, z);
  desk(g, 1.5, 0.48, 2.9, 1.05, z); chair(g, 2.2, 1.35, z, 'n');
  plant(g, 3.6, 1.8, z, 0.8);
  // Gäste-WC
  toilet(g, 3.6, 3.65, z, 's'); vanity(g, 2.3, 2.3, 2.75, 2.9, z);
  box(g, 2.3, 3.15, 3.2, 3.18, z, z + 2.0, S.glass); box(g, 2.32, 3.2, 3.18, 3.98, z, z + 0.03, S.ceramic);
  // Wohnen
  rug(g, 0.9, 5.0, 3.3, 7.0, z);
  sofa(g, 0.8, 6.95, 3.3, 7.85, z, 'n');
  roundTable(g, 2.0, 6.0, z, 0.4);
  sofa(g, 0.5, 4.9, 1.3, 5.7, z, 'w', S.mustard);
  tv(g, 1.0, 4.12, 3.0, 4.55, z, 'n');
  floorLamp(g, 3.6, 7.5, z); plant(g, 3.6, 4.5, z);
  // Küche (skandinavisch: weiße Fronten, Eichen-Arbeitsplatte)
  for (const [a, b, c, d] of [[6.8, 0.45, 9.8, 1.05], [9.2, 1.05, 9.8, 3.1]]) {
    box(g, a, b, c, d, z + 0.1, z + 0.86, S.white); box(g, a, b, c, d, z + 0.86, z + 0.9, S.oak); box(g, a + 0.05, b + 0.05, c - 0.05, d - 0.05, z, z + 0.1, S.black);
  }
  box(g, 7.6, 0.55, 8.4, 0.95, z + 0.86, z + 0.92, S.steelK);          // Spüle
  box(g, 9.3, 1.6, 9.7, 2.3, z + 0.9, z + 0.92, S.black);              // Kochfeld
  box(g, 9.45, 1.05, 9.8, 3.1, z + 1.5, z + 2.2, S.white);             // Oberschränke
  box(g, 9.2, 3.15, 9.8, 3.95, z, z + 2.2, S.white);                   // Kühlschrank-Hochschrank
  box(g, 9.6, 1.8, 9.8, 2.1, z + 1.45, z + 1.5, S.black);              // Haube
  // Kochinsel zum offenen Essbereich mit Barhockern
  box(g, 7.1, 2.7, 8.9, 3.6, z + 0.1, z + 0.88, S.white); box(g, 7.05, 2.65, 8.95, 3.65, z + 0.88, z + 0.92, S.oak);
  box(g, 7.15, 2.75, 8.85, 3.55, z, z + 0.1, S.black);
  for (const x of [7.5, 8.1, 8.6]) { cyl(g, x, 3.95, z, z + 0.65, 0.02, S.black, 8); cyl(g, x, 3.95, z + 0.62, z + 0.66, 0.18, S.oak); }
  pendant(g, 7.6, 3.15, z + 2.7); pendant(g, 8.4, 3.15, z + 2.7);
  // Essbereich (ehem. Schlafzimmer)
  rug(g, 7.0, 4.4, 9.7, 6.4, z, S.rug2);
  table(g, 7.6, 4.9, 9.4, 5.9, z);
  for (const [x, y, b] of [[7.95, 4.55, 's'], [8.5, 4.55, 's'], [9.05, 4.55, 's'], [7.95, 6.25, 'n'], [8.5, 6.25, 'n'], [9.05, 6.25, 'n']])
    chair(g, x, y, z, b, b === 's' ? S.white : S.sage);
  pendant(g, 8.2, 5.4, z + 2.7); pendant(g, 8.8, 5.4, z + 2.7);
  // Leseecke + Regal rechts hinten
  box(g, 9.4, 6.5, 9.8, 7.85, z, z + 2.0, S.birch);
  for (const h of [0.5, 0.9, 1.3, 1.7]) box(g, 9.42, 6.6, 9.75, 7.75, z + h, z + h + 0.25, S.fabric);
  sofa(g, 8.2, 6.8, 9.0, 7.6, z, 'n', S.mustard); floorLamp(g, 7.95, 7.6, z);
  plant(g, 6.5, 6.4, z); plant(g, 4.4, 6.0, z, 0.9);
  // Flur
  box(g, 4.12, 0.6, 4.5, 1.7, z + 0.05, z + 0.45, S.oak); box(g, 4.1, 0.6, 4.14, 1.7, z + 1.6, z + 1.65, S.oak);
  rug(g, 4.2, 2.2, 4.95, 4.8, z, S.rug2);
  // Anbau: Bad, HWR
  box(g, 0.5, 8.5, 1.25, 10.2, z, z + 0.55, S.ceramic); toilet(g, 2.6, 9.0, z, 'w'); vanity(g, 2.3, 10.15, 2.95, 10.7, z);
  box(g, 0.5, 11.0, 1.1, 11.6, z, z + 0.85, S.white); box(g, 0.5, 11.65, 1.1, 12.25, z, z + 0.85, S.white);
  shelfLow(g, 0.5, 12.7, 2.5, 13.1, z, 1.8);
}
// --- DG --- (Möbel unter der Schräge niedrig gehalten)
{
  const g = furn.dg, z = DG0;
  // Schlafen
  rug(g, 1.2, 4.0, 3.5, 6.4, z);
  bed(g, 1.72, 4.3, 3.72, 6.1, z, 'e', S.blue); nightstand(g, 3.45, 3.95, z); nightstand(g, 3.45, 6.45, z);
  shelfLow(g, 0.6, 7.0, 3.5, 7.4, z, 0.45); sofa(g, 0.55, 3.0, 1.35, 3.7, z, 'w', S.mustard); plant(g, 0.8, 6.6, z, 0.8);
  // Ankleide
  box(g, 0.7, 2.0, 3.5, 2.5, z, z + 1.7, S.birch); box(g, 1.3, 1.1, 2.6, 1.5, z, z + 0.45, S.fabric);
  // Bad neu (Fliesen salbeigrau, Eichen-Waschtisch, Wanne unter der Schräge)
  const tile = M(0xb9c9c2), tileF = M(0x8a8f8c);
  box(g, 3.835, 0.45, 6.075, 2.9, z + 0.011, z + 0.02, tileF);
  box(g, 3.835, 0.45, 3.86, 2.9, z, z + 1.2, tile); box(g, 6.05, 0.45, 6.075, 2.9, z, z + 1.2, tile);
  box(g, 3.835, 2.875, 6.075, 2.9, z, z + 1.2, tile);
  box(g, 3.95, 0.75, 5.5, 1.55, z, z + 0.55, S.ceramic); box(g, 4.05, 0.85, 5.4, 1.45, z + 0.5, z + 0.56, M(0x9fd3e8));
  toilet(g, 5.75, 2.1, z, 'w');
  vanity(g, 3.86, 1.8, 4.4, 2.7, z); box(g, 3.86, 1.9, 3.88, 2.6, z + 1.1, z + 1.9, S.mirror);
  box(g, 5.6, 2.84, 6.0, 2.87, z + 0.4, z + 1.4, S.black);
  rug(g, 4.6, 1.7, 5.3, 2.5, z + 0.02, S.rug);
  plant(g, 5.7, 1.0, z, 0.5);
  // Podest / Flur
  plant(g, 4.2, 3.3, z, 0.7); rug(g, 3.95, 3.15, 4.85, 5.9, z, S.rug2);
  // Abstell
  shelfLow(g, 3.9, 7.2, 4.9, 7.6, z, 0.9);
  // Zimmer A
  rug(g, 7.4, 1.6, 9.4, 3.0, z, S.rug2);
  bed(g, 7.7, 0.75, 9.7, 1.65, z, 'e', S.sage);
  desk(g, 9.15, 2.0, 9.8, 3.2, z); chair(g, 8.8, 2.6, z, 'w');
  wardrobe(g, 7.35, 3.85, 8.6, 4.45, z, 2.0); plant(g, 9.5, 3.9, z, 0.7);
  // Zimmer B
  rug(g, 7.2, 5.0, 9.0, 6.8, z);
  bed(g, 7.4, 4.56, 8.8, 6.56, z, 's', S.mustard); nightstand(g, 7.15, 4.8, z);
  desk(g, 9.15, 5.0, 9.8, 6.2, z); chair(g, 8.95, 5.6, z, 'w', S.oak);
  shelfLow(g, 6.5, 7.2, 9.5, 7.6, z, 0.4); floorLamp(g, 6.5, 6.6, z);
}

// ---------- Gelände ----------
{
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), mat.ground);
  gr.rotation.x = -Math.PI / 2; gr.position.y = GROUND; gr.receiveShadow = true;
  groups.ground.add(gr);
}

// ---------- UI ----------
const base = { kg: 0, eg: 0, dg: 0, roof: 0 };
function applyExplode(e) {
  groups.kg.position.y = -e * 1.0;
  groups.dg.position.y = e;
  groups.roof.position.y = e * 2;
}
for (const k of ['kg', 'eg', 'dg', 'roof', 'ground']) {
  document.getElementById(k).addEventListener('change', ev => groups[k].visible = ev.target.checked);
}
document.getElementById('furn').addEventListener('change', ev => { furn.eg.visible = furn.dg.visible = ev.target.checked; });
document.getElementById('labels').addEventListener('change', ev => {
  for (const l of Object.values(labelGroups)) l.visible = ev.target.checked;
});
document.getElementById('explode').addEventListener('input', ev => applyExplode(+ev.target.value));
const panel = document.getElementById('panel');
document.getElementById('toggle').onclick = () => panel.style.display = panel.style.display === 'none' ? '' : 'none';
if (innerWidth < 600) panel.style.display = 'none';

const views = {
  iso: [[13, 11, 17], [0, 1, -2]],
  front: [[0, 4, 22], [0, 2, 0]],
  top: [[0.01, 30, 0.01], [0, 0, -2]],
  stair: [[5.5, 4.0, 2.5], [1.2, 1.2, -2.6]],
};
function setView(v) { const [p, t] = views[v]; camera.position.set(...p); controls.target.set(...t); controls.update(); }
document.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
  if (b.dataset.v === 'stair' || b.dataset.v === 'top') {
    document.getElementById('roof').checked = false; groups.roof.visible = false;
  }
  setView(b.dataset.v);
});
setView('iso');


// ---------- RUNDGANG (Ich-Perspektive) ----------
const EYE = 1.6;
const floorZ = { '-1': KG0, '0': 0, '1': DG0 };
const rooms = [
  ['Eingang', 4.6, 0.9, 0, -Math.PI / 6],
  ['Gästezimmer', 3.4, 0.9, 0, Math.PI / 4],
  ['Gästebad', 3.7, 2.45, 0, Math.PI / 4],
  ['Wohnen', 3.5, 4.5, 0, Math.PI / 4],
  ['Küche', 6.6, 3.7, 0, -3 * Math.PI / 4],
  ['Essbereich', 6.6, 4.4, 0, -Math.PI / 4],
  ['L-Treppe', 9.4, 4.3, 0, Math.PI / 4, 0.05],
  ['Kellerflur', 4.6, 0.9, -1, 0],
  ['DG Flur', 4.4, 3.9, 1, Math.PI],
  ['DG Bad neu', 5.0, 2.7, 1, Math.PI, 0.45],
  ['DG Schlafen', 3.3, 3.4, 1, Math.PI / 4],
  ['DG Zimmer A', 7.5, 2.7, 1, -3 * Math.PI / 4],
  ['DG Zimmer B', 6.7, 5.0, 1, -Math.PI / 4],
  ['Außen (vorne)', 5.1, -7, 0, 0],
];
const sel = document.getElementById('room');
rooms.forEach((r, i) => { const o = document.createElement('option'); o.value = i; o.textContent = r[0]; sel.appendChild(o); });
let walking = false, yaw = 0, pitch = 0, level = 0;
const pos = new THREE.Vector3();
const keys = {};
function placeAt(i) {
  const [, x, y, f, yw, pt = 0.2] = rooms[i];
  level = f; yaw = yw; pitch = pt;
  pos.set(x - CX, floorZ[f] + EYE, CZ - y);
}
function enterWalk(i = 0) {
  walking = true; document.body.classList.add('walk');
  controls.enabled = false;
  const ex = document.getElementById('explode'); ex.value = 0; applyExplode(0);
  for (const k of ['kg', 'eg', 'dg', 'roof']) { groups[k].visible = true; document.getElementById(k).checked = true; }
  for (const l of Object.values(labelGroups)) l.visible = false;
  lamp.visible = true; camera.fov = 70; camera.near = 0.05; camera.updateProjectionMatrix();
  sel.value = i; placeAt(i);
}
function exitWalk() {
  walking = false; document.body.classList.remove('walk');
  lamp.visible = false; controls.enabled = true; camera.fov = 45; camera.near = 0.1; camera.updateProjectionMatrix();
  camera.rotation.set(0, 0, 0);
  for (const l of Object.values(labelGroups)) l.visible = document.getElementById('labels').checked;
  setView('iso');
}
document.getElementById('walkBtn').onclick = () => enterWalk(0);
document.getElementById('exitWalk').onclick = exitWalk;
sel.onchange = () => placeAt(+sel.value);
document.querySelectorAll('#floorBtns button').forEach(b => b.onclick = () => {
  level = +b.dataset.f; pos.y = floorZ[level] + EYE;
});
document.querySelectorAll('#pad button').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); keys[k] = true; }, off = () => keys[k] = false;
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off);
  b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
});
const keyMap = { ArrowUp: 'fw', w: 'fw', ArrowDown: 'bw', s: 'bw', ArrowLeft: 'tl', a: 'sl', ArrowRight: 'tr', d: 'sr', q: 'tl', e: 'tr' };
addEventListener('keydown', e => { if (walking && keyMap[e.key]) { keys[keyMap[e.key]] = true; e.preventDefault(); } });
addEventListener('keyup', e => { if (keyMap[e.key]) keys[keyMap[e.key]] = false; });
// Wischen / Ziehen zum Umschauen
let drag = null;
canvas.addEventListener('pointerdown', e => { if (walking) drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => drag = null);
canvas.addEventListener('pointermove', e => {
  if (!walking || !drag) return;
  yaw += (e.clientX - drag.x) * 0.005; pitch += (e.clientY - drag.y) * 0.004;
  pitch = Math.max(-1.2, Math.min(1.2, pitch)); drag = { x: e.clientX, y: e.clientY };
});
const lamp = new THREE.PointLight(0xfff4e0, 2.5, 8, 1); lamp.visible = false;
camera.add(lamp); scene.add(camera);
const clock = new THREE.Clock();
function walkStep() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!walking) return;
  const sp = 1.6 * dt, tr = 1.6 * dt;
  if (keys.tl) yaw += tr; if (keys.tr) yaw -= tr;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  let mv = 0, st = 0;
  if (keys.fw) mv += 1; if (keys.bw) mv -= 1; if (keys.sl) st -= 1; if (keys.sr) st += 1;
  pos.x += (fx * mv - fz * st) * sp; pos.z += (fz * mv + fx * st) * sp;
  camera.position.copy(pos);
  camera.rotation.set(-pitch, yaw, 0, 'YXZ');
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
renderer.setAnimationLoop(() => { if (walking) walkStep(); else { clock.getDelta(); controls.update(); } renderer.render(scene, camera); });
window.__ready = true;
