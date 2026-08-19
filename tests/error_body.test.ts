import { describe, it, expect } from "vitest";
import { errorMessageFromBody, errorMessageFromText } from "../src/pure/error_body";

// Vereinigungsmenge der Testmengen aller sieben Quell-Fassungen:
//   vault-crews/tests/core/chat-response.test.ts:59-76 (6 Assertions)
//   vault-rag/tests/chat_error.test.ts:5-22 + koda-agent/tests/chat_error.test.ts:4-20 (je 6, identisch)
//   paperless-storage/tests/core/errors.test.ts:4-24 (7, string-Eingang)
//   image-to-markdown/tests/vision_client.test.ts:22-52 (10) + markdown-presentation/
//   tests/core/error-envelope.test.ts:4-25 (8, Teilmenge davon) — beide mit choices-Wächter
// obsidian-transmute hatte keine Tests für seine Fassung.
// Dazu die Fälle, die erst durch die Parametrisierung entstehen, und je ein
// Regressionstest pro im Schnitt-Vorschlag gemessenem Bug.

describe("errorMessageFromBody — die Kaskade", () => {
  it("error.message zuerst", () => {
    expect(errorMessageFromBody({ error: { message: "model 'foo' not loaded" } })).toBe("model 'foo' not loaded");
  });
  it("error als String", () => {
    expect(errorMessageFromBody({ error: "bad request" })).toBe("bad request");
  });
  it("message als dritte Quelle", () => {
    expect(errorMessageFromBody({ message: "something failed" })).toBe("something failed");
  });
  it("detail als vierte Quelle (FastAPI/OpenWebUI)", () => {
    expect(errorMessageFromBody({ detail: "Not authenticated" })).toBe("Not authenticated");
  });
  it("unbekannte Felder → null", () => {
    expect(errorMessageFromBody({ foo: "bar" })).toBeNull();
    expect(errorMessageFromBody({ irgendwas: 1 })).toBeNull();
  });
  it("Nicht-Objekte → null", () => {
    expect(errorMessageFromBody("plain text")).toBeNull();
    expect(errorMessageFromBody(null)).toBeNull();
    expect(errorMessageFromBody(undefined)).toBeNull();
    expect(errorMessageFromBody(42)).toBeNull();
  });
  it("Array ist kein Record → null", () => {
    expect(errorMessageFromBody([{ error: "drin" }])).toBeNull();
  });
  it("error.message schlägt detail (paperless-Fall)", () => {
    expect(errorMessageFromBody({ error: { message: "a" }, detail: "b" })).toBe("a");
  });
  it("message schlägt detail — bewusste Entscheidung, 4:2 gegen parseErrorEnvelope", () => {
    expect(errorMessageFromBody({ message: "m", detail: "d" })).toBe("m");
  });
  it("error-Objekt ohne brauchbare message fällt auf message/detail durch", () => {
    expect(errorMessageFromBody({ error: { code: 500 }, message: "trotzdem lesbar" })).toBe("trotzdem lesbar");
    expect(errorMessageFromBody({ error: { message: 7 }, detail: "trotzdem lesbar" })).toBe("trotzdem lesbar");
  });
});

describe("errorMessageFromText — parst selbst", () => {
  it("error.message", () => {
    expect(errorMessageFromText('{"error":{"message":"kaputt"}}')).toBe("kaputt");
  });
  it("error als String", () => {
    expect(errorMessageFromText('{"error":"kaputt"}')).toBe("kaputt");
  });
  it("message", () => {
    expect(errorMessageFromText('{"message":"kaputt"}')).toBe("kaputt");
  });
  it("detail", () => {
    expect(errorMessageFromText('{"detail":"Invalid token."}')).toBe("Invalid token.");
  });
  it("error.message schlägt detail", () => {
    expect(errorMessageFromText('{"error":{"message":"a"},"detail":"b"}')).toBe("a");
  });
  it("kein JSON → null (HTML-Fehlerseite eines Reverse-Proxy)", () => {
    expect(errorMessageFromText("<html>502</html>")).toBeNull();
    expect(errorMessageFromText("<html>oops</html>")).toBeNull();
    expect(errorMessageFromText("not json")).toBeNull();
  });
  it("leerer/whitespace-Text → null", () => {
    expect(errorMessageFromText("")).toBeNull();
    expect(errorMessageFromText("   ")).toBeNull();
    expect(errorMessageFromText("\n\t ")).toBeNull();
  });
  it("gültiges JSON, das kein Objekt ist → null", () => {
    expect(errorMessageFromText("null")).toBeNull();
    expect(errorMessageFromText("[]")).toBeNull();
    expect(errorMessageFromText("123")).toBeNull();
    expect(errorMessageFromText('"nur ein String"')).toBeNull();
  });
  it("pretty-printed JSON bleibt lesbar (D2: firstLine() kollabierte es auf '{')", () => {
    expect(errorMessageFromText('{\n  "error": {\n    "message": "model not found"\n  }\n}')).toBe("model not found");
  });
});

describe("bodyMayBeSuccess — der choices-Wächter", () => {
  it("ohne choices gelten detail und message weiterhin", () => {
    expect(errorMessageFromText('{"detail":"not found"}', { bodyMayBeSuccess: true })).toBe("not found");
    expect(errorMessageFromText('{"message":"server busy"}', { bodyMayBeSuccess: true })).toBe("server busy");
  });
  it("gültige Completion → null", () => {
    expect(errorMessageFromText('{"choices":[{"message":{"content":"x"}}]}', { bodyMayBeSuccess: true })).toBeNull();
    expect(errorMessageFromText('{"choices":[]}', { bodyMayBeSuccess: true })).toBeNull();
  });
  it("Streufeld neben einer Completion wird NICHT als Fehler gelesen", () => {
    expect(errorMessageFromText('{"choices":[{"message":{"content":"x"}}],"message":"stray"}', { bodyMayBeSuccess: true })).toBeNull();
    expect(errorMessageFromText('{"choices":[],"detail":"stray"}', { bodyMayBeSuccess: true })).toBeNull();
  });
  it("error gilt AUCH neben choices — genau dafür existiert der HTTP-200-Fehlerpfad", () => {
    expect(errorMessageFromText('{"choices":[],"error":{"message":"real error"}}', { bodyMayBeSuccess: true })).toBe("real error");
    expect(errorMessageFromText('{"choices":[],"error":"real error"}', { bodyMayBeSuccess: true })).toBe("real error");
  });
  it("der Wächter greift auch bei nicht-Array-choices ('choices' in body, nicht Array-Test)", () => {
    expect(errorMessageFromBody({ choices: null, message: "stray" }, { bodyMayBeSuccess: true })).toBeNull();
  });
  it("bodyMayBeSuccess: false ist der Default — Aufrufer kam über einen Fehlerpfad", () => {
    // vault-crews/src/core/local-llm-client.ts:252 ruft mit einem Körper, der choices HAT
    // (nur ohne content). Dort MUSS message/detail weiterhin gelesen werden.
    const body = { choices: [{ message: {} }], message: "kein content" };
    expect(errorMessageFromBody(body)).toBe("kein content");
    expect(errorMessageFromBody(body, {})).toBe("kein content");
    expect(errorMessageFromBody(body, { bodyMayBeSuccess: false })).toBe("kein content");
  });
});

describe("Regression: leerer String galt als Treffer (4 von 7 Fassungen)", () => {
  it("{error:'', message:'…'} → die Meldung, nicht ''", () => {
    // Gemessener Schaden: '' ist nicht nullish, der `?? rawBody`-Fallback der Aufrufer
    // griff nicht — der Nutzer sah `HTTP 400: ` ohne Fehlertext.
    expect(errorMessageFromBody({ error: "", message: "model not found" })).toBe("model not found");
  });
  it("{error:{message:''}, detail:'…'} → detail", () => {
    expect(errorMessageFromBody({ error: { message: "" }, detail: "Not authenticated" })).toBe("Not authenticated");
  });
  it("nur-Whitespace-detail → null statt '   '", () => {
    expect(errorMessageFromText('{"detail":"   "}')).toBeNull();
  });
  it("Treffer werden getrimmt", () => {
    expect(errorMessageFromBody({ error: { message: "  model not found\n" } })).toBe("model not found");
    expect(errorMessageFromBody({ error: "  bad request  " })).toBe("bad request");
    expect(errorMessageFromBody({ message: " m " })).toBe("m");
    expect(errorMessageFromBody({ detail: " d " })).toBe("d");
  });
});

describe("Regression: die detail-Quelle fehlte in vault-crews und obsidian-transmute", () => {
  it("HTTP 401 {'detail':'Not authenticated'} ist lesbar, nicht Roh-JSON", () => {
    // vault-crews/src/core/local-llm-client.ts:211 zeigte dafür bisher den Rohbody.
    expect(errorMessageFromText('{"detail":"Not authenticated"}')).toBe("Not authenticated");
  });
  it("schlichtes {message} ist lesbar (obsidian-transmute kannte weder message noch detail)", () => {
    expect(errorMessageFromText('{"message":"server busy"}')).toBe("server busy");
  });
});
