import Encoding from "encoding-japanese";

const JRA_ORIGIN = "https://www.jra.go.jp";
const JRA_TIMEOUT_MS = 15000;
let lastFetchAt = 0;
let requestTail: Promise<void> = Promise.resolve();

async function serializedJraRequest<T>(delayMs: number, work: () => Promise<T>): Promise<T> {
  const previous = requestTail;
  let release!: () => void;
  requestTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    const elapsed = Date.now() - lastFetchAt;
    if (elapsed < delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs - elapsed));
    }
    return await work();
  } finally {
    lastFetchAt = Date.now();
    release();
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = JRA_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") {
      throw new Error("JRA通信がタイムアウトした");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function absoluteJraUrl(href: string, base = JRA_ORIGIN + "/"): string | null {
  try {
    const url = new URL(href, base);
    if (!["www.jra.go.jp", "jra.go.jp", "sp.jra.jp"].includes(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function decodeResponse(response: Response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const detected = Encoding.detect(bytes) || "SJIS";
  return Encoding.convert(bytes, {
    to: "UNICODE",
    from: detected,
    type: "string",
  }) as string;
}

export async function fetchJraHtml(url: string, delayMs = 700): Promise<string> {
  return serializedJraRequest(delayMs, async () => {
    const response = await fetchWithTimeout(url, {
      headers: {
        "Accept-Language": "ja,en;q=0.5",
        "User-Agent": "KEIBA-MOBILE/0.1",
      },
    });
    if (response.status === 403 || response.status === 429) {
      throw new Error("JRA側のアクセス制限を検出したため停止した");
    }
    if (!response.ok) throw new Error("JRA HTTP " + response.status);
    const text = await decodeResponse(response);
    if (/アクセス制限|不正なアクセス|通信制限/.test(text)) {
      throw new Error("JRA側の制限ページを検出したため停止した");
    }
    return text;
  });
}

export async function fetchJraPostHtml(
  path: string,
  cname: string,
  delayMs = 700,
): Promise<string> {
  return serializedJraRequest(delayMs, async () => {
    const url = new URL(path, JRA_ORIGIN).toString();
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Accept-Language": "ja,en;q=0.5",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "KEIBA-MOBILE/0.1",
      },
      body: "cname=" + encodeURIComponent(cname),
    });
    if (response.status === 403 || response.status === 429) {
      throw new Error("JRA側のアクセス制限を検出したため停止した");
    }
    if (!response.ok) throw new Error("JRA HTTP " + response.status);
    return decodeResponse(response);
  });
}
