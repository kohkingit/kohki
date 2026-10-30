"use client";

import { useState } from "react";

export default function LoginPage() {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: pass }) });
      if (res.ok) {
        location.href = "/";
        return;
      }
      const j = await res.json().catch(() => null);
      setErr(j?.error?.message ?? "ログインできませんでした。");
    } catch {
      setErr("通信に失敗しました。電波のよいところでもう一度押してください。");
    }
    setBusy(false);
  }

  return (
    <main className="login">
      <form onSubmit={submit}>
        <div>
          <div className="brand">次どこ行く？ @tsugi_doko47</div>
          <h1>こうきのやること</h1>
        </div>
        <label className="field" htmlFor="pass">パスコード</label>
        <input id="pass" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus />
        <button type="submit" className="primary" disabled={busy || !pass}>{busy ? "確認中…" : "開く"}</button>
        {err && <p className="msg err" role="alert">{err}</p>}
      </form>
    </main>
  );
}
