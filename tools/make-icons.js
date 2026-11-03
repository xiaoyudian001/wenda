/**
 * 生成 tabBar 图标（PNG）
 * 用法：node tools/make-icons.js
 * 依赖：仅 Node 内置模块，手写最小 PNG 编码器（无第三方依赖）
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'miniprogram', 'assets');

// ---------- 极简 PNG 编码器 ----------
function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc((width * 4 + 1) * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raw[p++] = rgba[i];
      raw[p++] = rgba[i + 1];
      raw[p++] = rgba[i + 2];
      raw[p++] = rgba[i + 3];
    }
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 极简光栅器 ----------
const S = 81; // 3x 27px，微信 tabBar 推荐 81x81

function newCanvas() {
  return new Uint8ClampedArray(S * S * 4);
}

function blend(c, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  const sa = a / 255;
  const da = c[i + 3] / 255;
  const outA = sa + da * (1 - sa);
  if (outA === 0) return;
  c[i] = (r * sa + c[i] * da * (1 - sa)) / outA;
  c[i + 1] = (g * sa + c[i + 1] * da * (1 - sa)) / outA;
  c[i + 2] = (b * sa + c[i + 2] * da * (1 - sa)) / outA;
  c[i + 3] = outA * 255;
}

/** 有向距离场填充：f(x,y) < 0 表示在形状内 */
function fill(c, sdf, color, alpha = 255) {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = sdf(x + 0.5, y + 0.5);
      if (d < 0) {
        // 2px 抗锯齿过渡
        const cov = Math.min(1, Math.max(0, 0.5 - d / 2));
        blend(c, x, y, color[0], color[1], color[2], alpha * cov);
      }
    }
  }
}

// 形状 SDF
const sdCircle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
const sdRect = (x0, y0, x1, y1) => (x, y) => {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const hx = (x1 - x0) / 2;
  const hy = (y1 - y0) / 2;
  const dx = Math.abs(x - cx) - hx;
  const dy = Math.abs(y - cy) - hy;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0);
};
const sdRoundRect = (x0, y0, x1, y1, r) => (x, y) => sdRect(x0, y0, x1, y1)(x, y) - r;

/** 线段 SDF（用于多边形） */
function sdSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
  const dx = wx - vx * t;
  const dy = wy - vy * t;
  return Math.hypot(dx, dy);
}

/** 凸多边形 SDF（顶点顺时针） */
function sdPolygon(verts) {
  return (x, y) => {
    let d = Infinity;
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      const [ax, ay] = verts[i];
      const [bx, by] = verts[j];
      d = Math.min(d, sdSegment(x, y, ax, ay, bx, by));
      // 射线法判断内外
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    }
    return inside ? -d : d;
  };
}

/** 房子：屋顶三角 + 主体矩形（合成一个凸多边形，避免接缝） */
function houseSDF() {
  const poly = sdPolygon([
    [40.5, 16],
    [66, 42],
    [57, 42],
    [57, 66],
    [24, 66],
    [24, 42],
    [15, 42],
  ]);
  const body = sdRoundRect(24, 40, 57, 66, 2);
  return (x, y) => Math.min(poly(x, y), body(x, y));
}

/** 加号 */
function plusSDF() {
  const h = sdRoundRect(26, 37, 55, 44, 3.5);
  const v = sdRoundRect(37, 26, 44, 55, 3.5);
  return (x, y) => Math.min(h(x, y), v(x, y));
}

/** 人像：头圆 + 肩 */
function personSDF() {
  const head = sdCircle(40.5, 30, 11);
  const shoulders = (x, y) => {
    // 椭圆底
    const dx = (x - 40.5) / 19;
    const dy = (y - 70) / 20;
    const d = Math.hypot(dx, dy) - 1;
    return d * 19;
  };
  return (x, y) => Math.min(head(x, y), shoulders(x, y));
}

const GREY = [134, 144, 156];
const ORANGE = [255, 107, 74];

const ICONS = [
  { name: 'tab-home', sdf: houseSDF },
  { name: 'tab-home-active', sdf: houseSDF, color: ORANGE },
  { name: 'tab-ask', sdf: plusSDF },
  { name: 'tab-ask-active', sdf: plusSDF, color: ORANGE },
  { name: 'tab-mine', sdf: personSDF },
  { name: 'tab-mine-active', sdf: personSDF, color: ORANGE },
];

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

ICONS.forEach((icon) => {
  const canvas = newCanvas();
  fill(canvas, icon.sdf(), icon.color || GREY, 255);
  const png = encodePNG(S, S, canvas);
  fs.writeFileSync(path.join(OUT_DIR, `${icon.name}.png`), png);
});

console.log(`✅ 已生成 ${ICONS.length} 个 tabBar 图标 → ${OUT_DIR}`);
