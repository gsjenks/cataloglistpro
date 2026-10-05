// src/lib/niimbot.ts
// Minimal NIIMBOT B1 label printer driver over Web Bluetooth: connect, then
// print 1-bit pages drawn on a canvas.
//
// A lean port of the B1 path of niimbluelib by MultiMote
// (https://github.com/MultiMote/niimbluelib): packet framing, command ids, the
// B1 print sequence (printStart7b / setPageSize6b) and the row encoder follow
// that library. The package itself is not installed because every release
// depends on Capacitor 8 and its Bluetooth plugin, and this app is pinned to
// Capacitor 7 (installing it would put a v8 native plugin into the Android build).
//
// Web Bluetooth only: Chrome on Android and desktop. Not iPhone Safari, and not
// the Capacitor Android WebView — use the web app in Chrome to print.
//
// ---------------------------------------------------------------------------
// niimbluelib — MIT License
// Copyright (c) 2024 MultiMote
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
// ---------------------------------------------------------------------------

/** B1 print head: 384 dots (48 mm at 203 dpi). A page may be at most this wide. */
export const B1_PRINTHEAD_DOTS = 384;

const SERVICE_UUID = 'e7810a71-73ae-499d-8c15-faa9aef0c3f2';

// Request (TX) and response (RX) command ids.
const TX = {
  Connect: 0xc1,
  PageStart: 0x03,
  PageEnd: 0xe3,
  PrintStart: 0x01,
  PrintEnd: 0xf3,
  PrintStatus: 0xa3,
  SetDensity: 0x21,
  SetLabelType: 0x23,
  SetPageSize: 0x13,
  PrintBitmapRow: 0x85,
  PrintBitmapRowIndexed: 0x83,
  PrintEmptyRow: 0x84,
} as const;

const RX = {
  NotSupported: 0x00,
  Connect: 0xc2,
  PageStart: 0x04,
  PageEnd: 0xe4,
  PrintStart: 0x02,
  PrintEnd: 0xf4,
  PrintStatus: 0xb3,
  SetDensity: 0x31,
  SetLabelType: 0x33,
  SetPageSize: 0x14,
  PrintError: 0xdb,
} as const;

const LABEL_WITH_GAPS = 1;
const PACKET_INTERVAL_MS = 10;
const DEFAULT_TIMEOUT_MS = 1_000;
const PAGE_TIMEOUT_MS = 10_000;
const STATUS_TIMEOUT_MS = 5_000;
const STATUS_POLL_MS = 300;
const FINISH_LIMIT_MS = 30_000;

// --- Minimal Web Bluetooth typings (not in lib.dom) ---------------------------
interface BtCharacteristic extends EventTarget {
  uuid: string;
  properties: { notify: boolean; writeWithoutResponse: boolean };
  value?: DataView;
  startNotifications(): Promise<BtCharacteristic>;
  writeValueWithoutResponse?(data: BufferSource): Promise<void>;
  writeValue(data: BufferSource): Promise<void>;
}
interface BtService {
  uuid: string;
  getCharacteristics(): Promise<BtCharacteristic[]>;
}
interface BtServer {
  connected: boolean;
  connect(): Promise<BtServer>;
  disconnect(): void;
  getPrimaryServices(): Promise<BtService[]>;
}
interface BtDevice extends EventTarget {
  name?: string;
  gatt?: BtServer;
}
interface BtNavigator {
  bluetooth?: {
    requestDevice(options: {
      filters: Array<{ namePrefix?: string; services?: string[] }>;
      optionalServices?: string[];
    }): Promise<BtDevice>;
  };
}

/** Raised when the printer reports an error (out of paper, cover open, ...). */
export class PrinterError extends Error {}

const u16 = (n: number): [number, number] => [(n >> 8) & 0xff, n & 0xff];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Waiter {
  ids: number[];
  resolve: (data: Uint8Array) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as unknown as BtNavigator).bluetooth;
}

export class NiimbotB1 {
  private device?: BtDevice;
  private server?: BtServer;
  private channel?: BtCharacteristic;
  private rxBuf = new Uint8Array(0);
  private waiters: Waiter[] = [];
  // One request/response exchange at a time (the printer answers in order).
  private lock: Promise<unknown> = Promise.resolve();

  /** Called when the printer drops the connection (switched off, out of range). */
  onDisconnect?: () => void;

  get name(): string | undefined {
    return this.device?.name;
  }

  isConnected(): boolean {
    return !!this.server?.connected && !!this.channel;
  }

  /** Opens the browser device picker (must run from a user tap) and connects. */
  async connect(): Promise<string> {
    const bt = (navigator as unknown as BtNavigator).bluetooth;
    if (!bt) throw new Error('This browser cannot reach Bluetooth printers. Use Chrome on Android or a computer.');

    this.disconnect();
    const device = await bt.requestDevice({
      filters: [{ namePrefix: 'B1' }, { services: [SERVICE_UUID] }],
      optionalServices: [SERVICE_UUID],
    });
    if (!device.gatt) throw new Error('That device has no Bluetooth GATT server.');

    const onGone = () => {
      device.removeEventListener('gattserverdisconnected', onGone);
      this.reset();
      this.onDisconnect?.();
    };
    device.addEventListener('gattserverdisconnected', onGone);

    const server = await device.gatt.connect();
    const channel = await findChannel(server);
    if (!channel) {
      server.disconnect();
      throw new Error('This printer did not offer a usable Bluetooth channel.');
    }
    channel.addEventListener('characteristicvaluechanged', (e: Event) => {
      const v = (e.target as BtCharacteristic).value;
      if (v) this.onData(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
    });
    await channel.startNotifications();

    this.device = device;
    this.server = server;
    this.channel = channel;

    try {
      await this.request(TX.Connect, [1], [RX.Connect]);
    } catch (e) {
      this.disconnect();
      throw new Error(`The printer did not answer the connection handshake: ${(e as Error).message}`);
    }
    return device.name ?? 'Printer';
  }

  disconnect() {
    try {
      this.server?.disconnect();
    } catch {
      /* already gone */
    }
    this.reset();
  }

  /**
   * Print one or more pages. Each canvas must be at most 384 dots wide; dark
   * pixels print, white pixels do not. Calls onPage after each page is sent.
   */
  async print(
    pages: HTMLCanvasElement[],
    opts: { density?: number; onPage?: (done: number, total: number) => void } = {},
  ): Promise<void> {
    if (!this.isConnected()) throw new Error('The printer is not connected.');
    const total = pages.length;
    if (total === 0) return;

    await this.request(TX.SetDensity, [opts.density ?? 3], [RX.SetDensity]);
    await this.request(TX.SetLabelType, [LABEL_WITH_GAPS], [RX.SetLabelType]);
    await this.request(TX.PrintStart, [...u16(total), 0, 0, 0, 0, 0], [RX.PrintStart]);
    try {
      for (let i = 0; i < total; i++) {
        const img = encodeCanvas(pages[i]);
        await this.request(TX.PageStart, [1], [RX.PageStart], PAGE_TIMEOUT_MS);
        await this.request(TX.SetPageSize, [...u16(img.rows), ...u16(img.cols), ...u16(1)], [RX.SetPageSize], PAGE_TIMEOUT_MS);
        for (const p of img.packets) await this.request(p.cmd, p.data, null);
        await this.request(TX.PageEnd, [1], [RX.PageEnd], PAGE_TIMEOUT_MS);
        opts.onPage?.(i + 1, total);
      }
      await this.waitUntilPrinted(total);
    } finally {
      await this.request(TX.PrintEnd, [1], [RX.PrintEnd]).catch(() => undefined);
    }
  }

  // Poll the print status until the printer reports every page done.
  private async waitUntilPrinted(total: number) {
    const started = Date.now();
    for (;;) {
      await sleep(STATUS_POLL_MS);
      const d = await this.request(TX.PrintStatus, [1], [RX.PrintStatus], STATUS_TIMEOUT_MS);
      if (d.length < 4) continue;
      const page = (d[0] << 8) | d[1];
      if (d.length === 10 && d[6] !== 0) throw new PrinterError(`Printer error ${d[6]}`);
      if (page >= total) return;
      if (Date.now() - started > FINISH_LIMIT_MS) throw new Error('The printer did not finish in time.');
    }
  }

  // Send a packet; when response ids are given, wait for one of them.
  private request(cmd: number, data: number[], responseIds: number[] | null, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Uint8Array> {
    const run = async () => {
      const channel = this.channel;
      if (!channel) throw new Error('The printer is not connected.');
      const wait = responseIds ? this.waitFor(responseIds, timeoutMs) : null;
      await sleep(PACKET_INTERVAL_MS);
      // frame() builds a fresh array, so its buffer is exactly the packet.
      const bytes = frame(cmd, data).buffer as ArrayBuffer;
      try {
        if (channel.writeValueWithoutResponse) await channel.writeValueWithoutResponse(bytes);
        else await channel.writeValue(bytes);
      } catch (e) {
        wait?.catch(() => undefined);
        this.dropWaiters(new Error('Write failed'));
        throw e;
      }
      return wait ?? new Uint8Array(0);
    };
    const next = this.lock.then(run, run);
    this.lock = next.catch(() => undefined);
    return next;
  }

  private waitFor(ids: number[], timeoutMs: number): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const w: Waiter = {
        ids,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters = this.waiters.filter((x) => x !== w);
          reject(new Error('The printer did not respond.'));
        }, timeoutMs),
      };
      this.waiters.push(w);
    });
  }

  // Reassemble notifications into packets: 55 55 CMD LEN DATA... CHK AA AA.
  private onData(chunk: Uint8Array) {
    const merged = new Uint8Array(this.rxBuf.length + chunk.length);
    merged.set(this.rxBuf);
    merged.set(chunk, this.rxBuf.length);
    let buf = merged;

    while (buf.length >= 2) {
      if (buf[0] !== 0x55 || buf[1] !== 0x55) {
        buf = new Uint8Array(0); // garbage: drop it
        break;
      }
      if (buf.length < 4) break;
      const len = buf[3];
      const size = 4 + len + 3;
      if (buf.length < size) break;
      const cmd = buf[2];
      const data = buf.slice(4, 4 + len);
      let chk = cmd ^ len;
      data.forEach((b) => (chk ^= b));
      if (chk === buf[4 + len] && buf[size - 2] === 0xaa && buf[size - 1] === 0xaa) {
        this.dispatch(cmd, data);
      }
      buf = buf.slice(size);
    }
    this.rxBuf = buf;
  }

  private dispatch(cmd: number, data: Uint8Array) {
    const w = this.waiters.find(
      (x) => x.ids.includes(cmd) || cmd === RX.PrintError || cmd === RX.NotSupported,
    );
    if (!w) return;
    clearTimeout(w.timer);
    this.waiters = this.waiters.filter((x) => x !== w);
    if (cmd === RX.PrintError) w.reject(new PrinterError(`Printer error ${data[0] ?? '?'}${PRINT_ERRORS[data[0]] ? `: ${PRINT_ERRORS[data[0]]}` : ''}`));
    else if (cmd === RX.NotSupported) w.reject(new PrinterError('The printer does not support that command.'));
    else w.resolve(data);
  }

  private dropWaiters(e: Error) {
    for (const w of this.waiters) {
      clearTimeout(w.timer);
      w.reject(e);
    }
    this.waiters = [];
  }

  private reset() {
    this.dropWaiters(new Error('The printer disconnected.'));
    this.server = undefined;
    this.channel = undefined;
    this.rxBuf = new Uint8Array(0);
  }
}

// Common PrintError codes (niimbluelib PrinterErrorCode).
const PRINT_ERRORS: Record<number, string> = {
  0x01: 'cover open',
  0x02: 'out of labels',
  0x03: 'battery low',
  0x04: 'battery fault',
  0x05: 'cancelled on the printer',
  0x06: 'data error',
  0x07: 'printer too hot',
  0x08: 'paper fault',
  0x09: 'printer busy',
  0x10: 'wrong labels loaded',
  0x11: 'could not set the label type',
  0x13: 'could not set the density',
};

async function findChannel(server: BtServer): Promise<BtCharacteristic | undefined> {
  for (const service of await server.getPrimaryServices()) {
    if (service.uuid.length < 5) continue;
    for (const c of await service.getCharacteristics()) {
      if (c.properties.notify && c.properties.writeWithoutResponse) return c;
    }
  }
  return undefined;
}

/** 55 55 CMD LEN DATA CHK AA AA, CHK = XOR of CMD, LEN and DATA. Connect is prefixed with 03. */
function frame(cmd: number, data: number[]): Uint8Array {
  let chk = cmd ^ data.length;
  for (const b of data) chk ^= b;
  const bytes = [0x55, 0x55, cmd, data.length, ...data, chk, 0xaa, 0xaa];
  return new Uint8Array(cmd === TX.Connect ? [3, ...bytes] : bytes);
}

interface EncodedPage {
  rows: number;
  cols: number;
  packets: { cmd: number; data: number[] }[];
}

/**
 * Encode a canvas as B1 row packets (print direction "top": canvas rows are
 * printed rows). Identical consecutive rows are sent once with a repeat count;
 * blank rows as PrintEmptyRow; rows with up to 6 dots as indexed rows.
 */
export function encodeCanvas(canvas: HTMLCanvasElement): EncodedPage {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available.');
  if (canvas.width > B1_PRINTHEAD_DOTS) throw new Error(`Tag is wider than the print head (${canvas.width} > ${B1_PRINTHEAD_DOTS}).`);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const cols = Math.ceil(canvas.width / 8) * 8;
  const rows = canvas.height;
  const bytesPerRow = cols / 8;

  type Row = { blank: boolean; bytes: Uint8Array; count: number; row: number; repeat: number };
  const out: Row[] = [];

  for (let y = 0; y < rows; y++) {
    const bytes = new Uint8Array(bytesPerRow);
    let count = 0;
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (data[i + 3] > 127 && lum < 128) {
        bytes[x >> 3] |= 1 << (7 - (x & 7));
        count++;
      }
    }
    const prev = out[out.length - 1];
    if (prev && prev.blank === (count === 0) && prev.repeat < 255 && sameBytes(prev.bytes, bytes)) {
      prev.repeat++;
    } else {
      out.push({ blank: count === 0, bytes, count, row: y, repeat: 1 });
    }
  }

  const packets = out.map((r) => {
    if (r.blank) return { cmd: TX.PrintEmptyRow, data: [...u16(r.row), r.repeat] };
    const counts = pixelCounts(r.bytes);
    if (r.count <= 6) {
      const idx: number[] = [];
      r.bytes.forEach((b, byte) => {
        for (let bit = 0; bit < 8; bit++) if (b & (1 << (7 - bit))) idx.push(...u16(byte * 8 + bit));
      });
      return { cmd: TX.PrintBitmapRowIndexed, data: [...u16(r.row), ...counts, r.repeat, ...idx] };
    }
    return { cmd: TX.PrintBitmapRow, data: [...u16(r.row), ...counts, r.repeat, ...r.bytes] };
  });

  return { rows, cols, packets };
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Black-dot counts per third of the print head ("split" mode), or the total in
// the last two bytes when the row is wider than three chunks.
function pixelCounts(bytes: Uint8Array): [number, number, number] {
  const chunk = Math.floor(B1_PRINTHEAD_DOTS / 8 / 3);
  const split = bytes.length <= chunk * 3;
  const parts: [number, number, number] = [0, 0, 0];
  let total = 0;
  bytes.forEach((b, i) => {
    for (let bit = 0; bit < 8; bit++) {
      if (b & (1 << bit)) {
        total++;
        if (split) parts[Math.min(2, Math.floor(i / chunk))]++;
      }
    }
  });
  if (split) return parts;
  const [h, l] = u16(total);
  return [0, l, h];
}
