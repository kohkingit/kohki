"use client";

import { useEffect, useState } from "react";
import { postJson, type ApiResult } from "./api";

type State = "loading" | "unsupported" | "not-installed" | "no-key" | "off" | "denied" | "on";

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

export default function NotifyCard() {
  const [state, setState] = useState<State>("loading");
  const [key, setKey] = useState<string | null>(null);
  const [cron, setCron] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<ApiResult | null>(null);
  const [gen, setGen] = useState<{ pub: string; priv: string; cron: string } | null>(null);

  useEffect(() => {
    (async () => {
      const j = await fetch("/api/push/key", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      setKey(j?.publicKey ?? null);
      setCron(!!j?.cron);
      if (!j?.publicKey) return setState("no-key");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
        return setState(isIOS() && !isStandalone() ? "not-installed" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub && Notification.permission === "granted" ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    if (!key) return;
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        setBusy(false);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(key) });
      const r = await postJson("/api/push/subscribe", { subscription: sub.toJSON() });
      if (r.ok) {
        setState("on");
        setMsg({ ok: true, message: "通知をオンにしました。「テスト通知を送る」で確かめられます。" });
      } else setMsg(r);
    } catch {
      setMsg({ ok: false, code: "unknown", message: "通知をオンにできませんでした。アプリを閉じて開き直してから、もう一度押してください。" });
    }
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    const r = await postJson("/api/push/test", {});
    setMsg(r.ok ? { ok: true, message: "テスト通知を送りました。数秒で届きます。" } : r);
    setBusy(false);
  }

  async function makeKeys() {
    const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const pub = b64url(await crypto.subtle.exportKey("raw", kp.publicKey));
    const priv = (await crypto.subtle.exportKey("jwk", kp.privateKey)).d ?? "";
    setGen({ pub, priv, cron: b64url(crypto.getRandomValues(new Uint8Array(24))) });
  }

  return (
    <section className="sec" aria-label="通知" id="notify">
      <h2>通知</h2>
      <p className="hint">新しいやることが出たら、毎日12時台と20時台にiPhoneへお知らせ（インサイトの24h・72h・7dもここで届く）</p>
      <div className="card">
        {state === "loading" && <p className="spots">確認中…</p>}
        {state === "on" && (
          <>
            <p className="title">この端末は通知オン ✓</p>
            <button type="button" onClick={test} disabled={busy}>テスト通知を送る</button>
          </>
        )}
        {state === "off" && (
          <button type="button" className="primary" onClick={turnOn} disabled={busy}>通知をオンにする</button>
        )}
        {state === "denied" && <p className="spots">通知が「許可しない」になっています。iPhoneの 設定 → 通知 → 「やること」で、通知を許可してから開き直してください。</p>}
        {state === "not-installed" && <p className="spots">Safariの共有ボタン（□↑）→「ホーム画面に追加」で追加したアプリから開くと、通知をオンにできます。</p>}
        {state === "unsupported" && <p className="spots">このブラウザは通知に対応していません。iPhoneはiOS 16.4以上で、ホーム画面に追加したアプリから開いてください。</p>}
        {state === "no-key" && (
          <>
            <p className="spots">はじめに通知の鍵を1回だけ作ります。下のボタンで作った3つを、Vercelの Settings → Environment Variables に入れて「Redeploy」してください。</p>
            {!gen ? (
              <button type="button" className="primary" onClick={makeKeys}>通知の鍵を作る</button>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                <KeyRow name="VAPID_PUBLIC_KEY" value={gen.pub} />
                <KeyRow name="VAPID_PRIVATE_KEY" value={gen.priv} />
                <KeyRow name="CRON_SECRET" value={gen.cron} />
                <p className="spots">⚠️ VAPID_PRIVATE_KEY と CRON_SECRET はパスワードと同じ。Vercel以外に貼らないでください。この画面を閉じると消えます（忘れてもまた作り直せばOK）。</p>
              </div>
            )}
          </>
        )}
        {state !== "no-key" && state !== "loading" && !cron && (
          <p className="secerr">定期実行の合言葉（CRON_SECRET）が Vercel に入っていないので、自動の通知は届きません。</p>
        )}
        {msg && <p className={"msg " + (msg.ok ? "ok" : "err")} role={msg.ok ? "status" : "alert"}>{msg.message}</p>}
      </div>
    </section>
  );
}

function KeyRow({ name, value }: { name: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="keyrow">
      <div className="dname">{name}</div>
      <code>{value}</code>
      <button
        type="button"
        className="small"
        onClick={() => navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {})}
      >
        {copied ? "コピーしました ✓" : "コピー"}
      </button>
    </div>
  );
}
