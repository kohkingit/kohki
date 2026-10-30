// 書き込みAPIを呼ぶ。通信に失敗しても自動でやり直さない。
export type ApiResult = { ok: true; message?: string } | { ok: false; code: string; message: string };

export async function postJson(url: string, body: unknown): Promise<ApiResult> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  } catch {
    return {
      ok: false,
      code: "network",
      message: "通信が途中で切れました。シートに書き込めたか分からないので、「最新にする」で確認してから、必要ならもう一度やってください。",
    };
  }
  if (res.status === 401) {
    location.href = "/login";
    return { ok: false, code: "unauthorized", message: "ログインが切れました。" };
  }
  const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: { code?: string; message?: string } } | null;
  if (res.ok && j?.ok) return { ok: true };
  return {
    ok: false,
    code: j?.error?.code ?? "unknown",
    message: j?.error?.message ?? `サーバーがエラーを返しました（${res.status}）。「最新にする」で確認してから、もう一度やってください。`,
  };
}
