import { describe, it, expect } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { Sha256, sha256Hex, sha256HexUtf8 } from "../src/pure/sha256";

// Vereinigung der Testmengen beider Quell-Repos plus die Fälle, die durch das Zusammenführen
// neu entstehen. Die beiden Suiten waren komplementär und keine deckte die andere ab:
//   finance-ledger/tests/core/sha256.test.ts — NIST-Vektoren (inkl. 1 Mio. 'a'), die
//     Blockgrenzen-Batterie gegen node:crypto, 50 Zufallseingaben, UTF-8 mit Umlauten.
//     Es fehlten: Chunk-Äquivalenz und der 2^32-Bit-Längenüberlauf (die Fassung konnte nicht
//     streamen, also gab es dort auch nichts zu testen).
//   local-image-generator/tests/sha256.test.ts — Chunk-Äquivalenz über 1 MB, der
//     Längenüberlauf, "digestHex ist einmalig". Es fehlte die Blockgrenzen-Batterie —
//     also genau 55/56/63/64/65, die der finance-ledger-Kommentar "die klassische
//     Fehlerstelle" nennt.
// Neu hier: der `update`-nach-`digest`-Pfad (im Code seit jeher, nirgends getestet), die
// Teilblock-Pfade von `update`, Chunks mit Versatz, das Hex-Format und die Äquivalenz
// sha256HexUtf8 ↔ sha256Hex, die den neuen String-Wrapper an den Byte-Weg nagelt.

describe("NIST-Vektoren", () => {
  it("hasht den leeren String", () => {
    expect(sha256HexUtf8("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("hasht den leeren Puffer", () => {
    expect(sha256Hex(new Uint8Array(0))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("hasht 'abc' — als String wie als Bytes", () => {
    const erwartet = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(sha256HexUtf8("abc")).toBe(erwartet);
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(erwartet);
  });

  it("hasht die 448-Bit-Nachricht", () => {
    expect(sha256HexUtf8("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("hasht die 896-Bit-Nachricht (zwei Blöcke)", () => {
    expect(
      sha256HexUtf8(
        "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmno" +
          "ijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu",
      ),
    ).toBe("cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1");
  });

  it("hasht eine Million 'a'", () => {
    expect(sha256HexUtf8("a".repeat(1_000_000))).toBe(
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    );
  });
});

describe("gegen node:crypto", () => {
  it("stimmt an jeder Blockgrenze überein", () => {
    // 55/56 und 63/64 sind die Längen, an denen die Polsterung einen zusätzlichen Block
    // erzwingt — die klassische Fehlerstelle. 119/120 und 127/128 sind dieselbe Grenze
    // eine bzw. zwei Blocklängen weiter.
    for (const length of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129]) {
      const bytes = randomBytes(length);
      expect(sha256Hex(new Uint8Array(bytes)), `Länge ${length}`).toBe(
        createHash("sha256").update(bytes).digest("hex"),
      );
    }
  });

  it("stimmt für zufällige Eingaben überein", () => {
    for (let i = 0; i < 50; i++) {
      const bytes = randomBytes(1 + ((i * 37) % 500));
      expect(sha256Hex(new Uint8Array(bytes))).toBe(createHash("sha256").update(bytes).digest("hex"));
    }
  });

  it("kodiert Strings als UTF-8 — Umlaute zählen als zwei Byte", () => {
    for (const text of [
      "Gebühr",
      "comp:DE123|2025-08-01|-39.95|festnetz vertragskonto",
      "sref:2025080100000001",
      "Ärger mit Öl und Übermut — 100 % Straße",
    ]) {
      expect(sha256HexUtf8(text)).toBe(createHash("sha256").update(text, "utf8").digest("hex"));
    }
  });
});

describe("chunkweise == am Stück", () => {
  function muster(length: number): Uint8Array {
    const data = new Uint8Array(length);
    for (let i = 0; i < length; i++) data[i] = (i * 31 + 7) & 0xff;
    return data;
  }

  it("1 MB in ungeraden 65-537er-Chunks", () => {
    const data = muster(1_000_003);
    const h = new Sha256();
    for (let off = 0; off < data.length; off += 65_537) {
      h.update(data.subarray(off, Math.min(off + 65_537, data.length)));
    }
    expect(h.digestHex()).toBe(createHash("sha256").update(data).digest("hex"));
  });

  it("byteweise gefüttert (füllt den Restblock 64-mal einzeln)", () => {
    const data = muster(200);
    const h = new Sha256();
    for (let i = 0; i < data.length; i++) h.update(data.subarray(i, i + 1));
    expect(h.digestHex()).toBe(sha256Hex(data));
  });

  it("an jeder kritischen Grenze zweigeteilt", () => {
    // Deckt beide Zweige von update(): Restblock anfüllen + komprimieren (`split % 64 !== 0`)
    // und der Direktweg ohne Restblock (`split % 64 === 0`).
    const data = muster(200);
    const erwartet = sha256Hex(data);
    for (const split of [0, 1, 55, 56, 63, 64, 65, 119, 120, 127, 128, 129, 199, 200]) {
      const h = new Sha256();
      h.update(data.subarray(0, split));
      h.update(data.subarray(split));
      expect(h.digestHex(), `Split bei ${split}`).toBe(erwartet);
    }
  });

  it("leere Chunks sind No-ops", () => {
    const data = muster(100);
    const h = new Sha256();
    h.update(new Uint8Array(0));
    h.update(data.subarray(0, 50));
    h.update(new Uint8Array(0));
    h.update(data.subarray(50));
    h.update(new Uint8Array(0));
    expect(h.digestHex()).toBe(sha256Hex(data));
  });

  it("Chunks mit Versatz werden relativ zum View gelesen", () => {
    // Regression: die Produktions-Aufrufstelle in local-image-generator füttert
    // `reader.read()`-Werte, also Views auf fremde Puffer mit byteOffset ≠ 0. Wer beim
    // Vendoren auf `chunk.buffer` statt auf den View zugreift, hasht still den falschen
    // Bereich — kein Typfehler, kein Testfehler, nur ein falscher Digest.
    const gross = muster(300);
    const ausschnitt = gross.subarray(37, 165);
    expect(ausschnitt.byteOffset).toBe(37);
    const erwartet = createHash("sha256").update(gross.slice(37, 165)).digest("hex");
    expect(sha256Hex(ausschnitt)).toBe(erwartet);
    const h = new Sha256();
    h.update(gross.subarray(37, 100));
    h.update(gross.subarray(100, 165));
    expect(h.digestHex()).toBe(erwartet);
  });

  it(
    "Länge ≥ 2^32 Bit wird korrekt in die 64-Bit-Länge kodiert (512 MB)",
    () => {
      // 2^29 Bytes = 2^32 Bit — der Überlauf des unteren Längenworts (lenLo → lenHi).
      // Die finance-ledger-Fassung rechnete die Bitlänge als Number und war an dieser
      // Stelle nie geprüft.
      const chunk = new Uint8Array(1 << 20);
      const h = new Sha256();
      const ref = createHash("sha256");
      for (let i = 0; i < 512; i++) {
        h.update(chunk);
        ref.update(chunk);
      }
      expect(h.digestHex()).toBe(ref.digest("hex"));
    },
    120_000,
  );
});

describe("Lebenszyklus-Vertrag", () => {
  it("digestHex ist einmalig", () => {
    const h = new Sha256();
    h.digestHex();
    expect(() => h.digestHex()).toThrow(/digest already taken/);
  });

  it("update nach digest wirft, statt still weiterzurechnen", () => {
    const h = new Sha256();
    h.update(new TextEncoder().encode("abc"));
    h.digestHex();
    expect(() => h.update(new TextEncoder().encode("d"))).toThrow(/update after digest/);
  });

  it("zwei Instanzen teilen keinen Zustand", () => {
    const a = new Sha256();
    const b = new Sha256();
    a.update(new TextEncoder().encode("abc"));
    expect(b.digestHex()).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(a.digestHex()).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("Ausgabeformat", () => {
  it("liefert immer 64 Hex-Zeichen in Kleinschreibung", () => {
    // finance-ledger schneidet die ersten 16 Zeichen als Buchungs-Identität ab und muss
    // Pythons `hexdigest()` treffen; local-image-generator vergleicht gegen /^[0-9a-f]{64}$/
    // aus dem Modell-Manifest. Führende Nullen dürfen nicht wegfallen.
    for (let i = 0; i < 200; i++) {
      expect(sha256HexUtf8(`probe-${i}`)).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("sha256HexUtf8 ist genau sha256Hex über die UTF-8-Bytes", () => {
    for (const text of ["", "a", "Ärger", "🜁 mixed 漢字", "x".repeat(1000)]) {
      expect(sha256HexUtf8(text), text).toBe(sha256Hex(new TextEncoder().encode(text)));
    }
  });
});
