export type EndpointStatusKind =
  | "ok" | "refused" | "unknown-host" | "timeout" | "not-an-llm-api" | "unknown";

export interface EndpointStatus {
  reachable: boolean;         // true nur bei kind === "ok"
  kind: EndpointStatusKind;
  klartext: string;           // deutsche, handlungsleitende Meldung (Tooltip-Text)
  raw?: string;               // rohe Fehlermeldung, nur bei kind === "unknown"
}

/** Rohsignal einer Erreichbarkeits-Probe: erfolgreiche Response, gefangener Fehler, oder Timeout. */
export type ProbeInput =
  | { kind: "response"; status: number; body: unknown }
  | { kind: "error"; message: string }
  | { kind: "timeout" };

const KLARTEXT: Record<Exclude<EndpointStatusKind, "unknown">, string> = {
  "ok": "Verbunden",
  "refused": "Verbindung abgelehnt — Server läuft nicht oder Port falsch.",
  "unknown-host": "Hostname unbekannt — Tippfehler in der Adresse?",
  "timeout": "Zeitüberschreitung — Netz nicht erreichbar (falsches Netz / VPN aus?).",
  "not-an-llm-api": "Antwortet, ist aber kein OpenAI-kompatibler Endpunkt — falscher Pfad/Dienst?",
};

function hasModelListForm(body: unknown): boolean {
  return Array.isArray((body as { data?: unknown } | null | undefined)?.data);
}

/** Übersetzt ein Probe-Rohsignal in einen benannten Status + Klartext.
 *  Lesson (vault-crews): bei einer Response ERST die valide API-Form prüfen → "ok";
 *  die Fehler-Klassifikation läuft nur auf dem Nicht-verwertbar-Pfad, nie über eine
 *  legitime Antwort. */
export function classifyEndpointStatus(input: ProbeInput): EndpointStatus {
  if (input.kind === "timeout") {
    return { reachable: false, kind: "timeout", klartext: KLARTEXT["timeout"] };
  }
  if (input.kind === "response") {
    if (input.status === 200 && hasModelListForm(input.body)) {
      return { reachable: true, kind: "ok", klartext: KLARTEXT["ok"] };
    }
    return { reachable: false, kind: "not-an-llm-api", klartext: KLARTEXT["not-an-llm-api"] };
  }
  const m = input.message;
  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED/i.test(m)) {
    return { reachable: false, kind: "refused", klartext: KLARTEXT["refused"] };
  }
  if (/ENOTFOUND|ERR_NAME_NOT_RESOLVED|getaddrinfo/i.test(m)) {
    return { reachable: false, kind: "unknown-host", klartext: KLARTEXT["unknown-host"] };
  }
  if (/ETIMEDOUT|ERR_CONNECTION_TIMED_OUT|timed out/i.test(m)) {
    return { reachable: false, kind: "timeout", klartext: KLARTEXT["timeout"] };
  }
  return { reachable: false, kind: "unknown", klartext: `Nicht erreichbar — ${m}`, raw: m };
}
