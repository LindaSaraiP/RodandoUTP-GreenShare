/* Generador QR local, nivel de corrección L, sin servicios externos.
   El contenido es una URL de consulta del pase (no datos personales en texto plano).
   Implementación compacta de codificación QR ISO/IEC 18004. */
(function (root) {
  'use strict';
  const ECC = [-1,7,10,15,20,26,18,20,24,30,18,20,26,30,22,24,28,30,28,28,26,30,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30];
  const BLOCKS = [-1,1,1,1,1,1,2,2,2,2,4,4,4,4,4,4,4,4,4,4,4,5,5,5,5,5,5,6,6,6,6,6,6,6,6,6,6,6,6,6,6];
  function rawModules(version) {
    let n = (16 * version + 128) * version + 64;
    if (version >= 2) { const numAlign = Math.floor(version / 7) + 2; n -= (25 * numAlign - 10) * numAlign - 55; }
    if (version >= 7) n -= 36;
    return n;
  }
  function mul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function divisor(degree) {
    const result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) {
        result[j] = mul(result[j], root);
        if (j + 1 < degree) result[j] ^= result[j + 1];
      }
      root = mul(root, 2);
    }
    return result;
  }
  function remainder(data, div) {
    const result = new Array(div.length).fill(0);
    for (const b of data) {
      const factor = b ^ result.shift();
      result.push(0);
      for (let j = 0; j < div.length; j++) result[j] ^= mul(div[j], factor);
    }
    return result;
  }
  function positionPatterns(version, modules, fn) {
    const size = modules.length;
    function set(x, y, value) {
      if (x >= 0 && y >= 0 && x < size && y < size) { modules[y][x] = !!value; fn[y][x] = true; }
    }
    // Timing first; finder patterns cover intersecting cells.
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    for (const [cx, cy] of [[3,3], [size - 4,3], [3,size - 4]]) {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        set(cx + dx, cy + dy, dist !== 2 && dist !== 4);
      }
    }
    if (version >= 2) {
      const count = Math.floor(version / 7) + 2;
      const step = version === 32 ? 26 : Math.floor((version * 4 + count * 2 + 1) / (count * 2 - 2)) * 2;
      const positions = [6];
      for (let pos = size - 7; pos > 6; pos -= step) positions.splice(1, 0, pos);
      for (let i = 0; i < positions.length; i++) for (let j = 0; j < positions.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === positions.length - 1) || (i === positions.length - 1 && j === 0)) continue;
        const cx = positions[i], cy = positions[j];
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
    // Format bits for ECC level L, mask pattern zero.
    const ecl = 1, mask = 0;
    const data = ecl << 3 | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >>> 9) & 1) * 0x537);
    const bits = (data << 10 | rem) ^ 0x5412;
    const bit = i => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
    if (version >= 7) {
      let n = version;
      for (let i = 0; i < 12; i++) n = (n << 1) ^ (((n >>> 11) & 1) * 0x1f25);
      const vbits = version << 12 | n;
      for (let i = 0; i < 18; i++) {
        const v = ((vbits >>> i) & 1) !== 0;
        const x = size - 11 + (i % 3), y = Math.floor(i / 3);
        set(x, y, v); set(y, x, v);
      }
    }
  }
  function interleave(data, version) {
    const nBlocks = BLOCKS[version], eccLen = ECC[version];
    const raw = Math.floor(rawModules(version) / 8);
    const shortBlocks = nBlocks - raw % nBlocks;
    const shortLen = Math.floor(raw / nBlocks);
    const div = divisor(eccLen);
    const blocks = [];
    let pos = 0;
    for (let b = 0; b < nBlocks; b++) {
      const dataLen = shortLen - eccLen + (b < shortBlocks ? 0 : 1);
      const buf = data.slice(pos, pos + dataLen);
      pos += dataLen;
      const ecc = remainder(buf, div);
      if (b < shortBlocks) buf.push(0);
      blocks.push(buf.concat(ecc));
    }
    const result = [];
    for (let i = 0; i < blocks[0].length; i++) for (let j = 0; j < blocks.length; j++) {
      if (i !== shortLen - eccLen || j >= shortBlocks) result.push(blocks[j][i]);
    }
    return result;
  }
  function encode(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    let version = 1;
    for (; version <= 40; version++) {
      const capacity = Math.floor(rawModules(version) / 8) - ECC[version] * BLOCKS[version];
      const charBits = version <= 9 ? 8 : 16;
      if (bytes.length < (1 << charBits) && 4 + charBits + bytes.length * 8 <= capacity * 8) break;
    }
    if (version > 40) throw new Error('El código QR excede la capacidad máxima.');
    const capacityBits = (Math.floor(rawModules(version) / 8) - ECC[version] * BLOCKS[version]) * 8;
    const bits = [];
    function append(value, length) { for (let i = length - 1; i >= 0; i--) bits.push(((value >>> i) & 1) !== 0); }
    append(4, 4); append(bytes.length, version <= 9 ? 8 : 16);
    for (const b of bytes) append(b, 8);
    append(0, Math.min(4, capacityBits - bits.length));
    while (bits.length % 8 !== 0) bits.push(false);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let k = 0; k < 8; k++) b = (b << 1) | (bits[i + k] ? 1 : 0);
      data.push(b);
    }
    for (let i = data.length; i < capacityBits / 8; i++) data.push(i % 2 === 0 ? 0xec : 0x11);
    const words = interleave(data, version);
    const size = version * 4 + 17;
    const matrix = Array.from({length:size}, () => Array(size).fill(false));
    const reserved = Array.from({length:size}, () => Array(size).fill(false));
    positionPatterns(version, matrix, reserved);
    let pos = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        const up = ((right + 1) & 2) === 0;
        const y = up ? size - 1 - vert : vert;
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          if (!reserved[y][x]) {
            let dark = false;
            if (pos < words.length * 8) dark = ((words[pos >>> 3] >>> (7 - (pos & 7))) & 1) !== 0;
            if ((x + y) % 2 === 0) dark = !dark;
            matrix[y][x] = dark;
            pos++;
          }
        }
      }
    }
    return matrix;
  }
  root.RodandoQR = { encode };
  if (typeof module !== 'undefined' && module.exports) module.exports = { encode };
})(typeof window !== 'undefined' ? window : globalThis);
