const NETKEIBA_TIMEOUT_MS = 15000;
let lastFetchAt = 0;
let requestTail: Promise<void> = Promise.resolve();

async function serializedRequest<T>(delayMs: number, work: () => Promise<T>): Promise<T> {
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

async function fetchWithTimeout(url: string, timeoutMs = NETKEIBA_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept-Language": "ja,en;q=0.5",
        "User-Agent": "KEIBA-MOBILE/0.2",
      },
    });
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") {
      throw new Error("netkeiba通信がタイムアウトした");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchNetkeibaHtml(url: string, delayMs = 1000) {
  const parsed = new URL(url);
  if (!["race.netkeiba.com","db.netkeiba.com"].includes(parsed.hostname)) {
    throw new Error("netkeiba以外のURLは取得しない");
  }
  return serializedRequest(delayMs, async () => {
    const response = await fetchWithTimeout(url);
    if (response.status === 403 || response.status === 429 || response.status === 503) {
      throw new Error("netkeiba側のアクセス制限を検出したため停止した");
    }
    if (!response.ok) throw new Error("netkeiba HTTP " + response.status);
    const text = await response.text();
    if (/不正なアクセス|アクセスが集中|Access Denied/i.test(text)) {
      throw new Error("netkeiba側の制限ページを検出したため停止した");
    }
    return text;
  });
}
