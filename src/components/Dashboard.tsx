"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApproveTask, Dashboard as Data, InsightTask, PermitTask, UrlTask } from "@/lib/model";
import { BS_URL, INSTAGRAM_POST_RE } from "@/lib/model";
import { METRICS, type MetricKey } from "@/lib/schema";
import { modeLabel, type Mode, type Settings } from "@/lib/settings";
import { postJson, type ApiResult } from "./api";

const SHEET_URL = "https://docs.google.com/spreadsheets/d/1TqcoHaZjGDk1VMWm5O0uQKHCFJte1Q5oE_Gj6tjF_7U/edit";
const STALE_MS = 5 * 60 * 1000;

function jstTime(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", month: "numeric", day: "numeric" }).format(new Date(iso));
}

type Toast = (text: string) => void;

export default function Dashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoad = useRef(0);

  const showToast: Toast = useCallback((text) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/data", { cache: "no-store" });
      if (res.status === 401) {
        location.href = "/login";
        return;
      }
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.data) throw new Error(j?.error?.message ?? `読み込みに失敗しました（${res.status}）。少し待ってから「最新にする」を押してください。`);
      setData(j.data);
      setLoadedAt(j.loadedAt);
      setError(null);
      lastLoad.current = Date.now();
    } catch (e) {
      const msg = e instanceof TypeError ? "通信に失敗しました。電波のよいところで「最新にする」を押してください。" : (e as Error).message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // アプリに戻ってきたとき、5分以上たっていたら読み直す（読み込みだけ。書き込みは自動でやらない）
    const onVis = () => {
      if (document.visibilityState === "visible" && Date.now() - lastLoad.current > STALE_MS) load();
    };
    document.addEventListener("visibilitychange", onVis);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  const done = useCallback(
    (text: string) => {
      showToast(text);
      load(); // 書き込みのあとはシートを読み直して画面を更新
    },
    [load, showToast],
  );

  const s = data?.summary;

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <div className="brand">次どこ行く？ @tsugi_doko47</div>
          <h1>こうきのやること</h1>
          <p className="sub" aria-live="polite">
            {loading ? "運用管理シートを読み込み中…" : loadedAt ? `最終更新 ${jstTime(loadedAt)}` : "読み込めませんでした"}
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading}>
          ↻ 最新にする
        </button>
      </header>

      {data && <ModeBar settings={data.settings} onDone={done} />}

      {error && (
        <div className="banner" role="alert">
          <div>
            <b>{data ? "最新にできませんでした" : "読み込めません"}</b>
            <br />
            {error}
          </div>
          {data && <div className="sub" style={{ margin: 0 }}>下に出ているのは前回読み込んだ内容です。</div>}
        </div>
      )}

      {s && (
        <div className="summary">
          {s.total === 0 ? <span className="chip done">今やることはありません</span> : <span className="chip hot">やること {s.total}件</span>}
          {s.unscheduledSoon > 0 && <span className="chip hot">3日以内で未予約 {s.unscheduledSoon}件</span>}
          {s.nextScheduled ? <span className="chip done">予約済み：次は {s.nextScheduled}</span> : <span className="chip">予約済みの投稿なし</span>}
        </div>
      )}

      {data && <RulesCard settings={data.settings} />}

      <Section ready={!!data} title="確認して予約する" count={data?.approve.length} hint="AIが作ったデザインとキャプションを見て、Meta Business Suiteで予約する">
        {data && <List items={data.approve} empty="確認待ちの投稿はありません。AIが「承認待ち」にするとここに出ます。" render={(t) => <ApproveCard key={t.row} t={t} onDone={done} />} />}
      </Section>

      <Section ready={!!data} title="投稿URLを入れる" count={data?.url.length} hint="投稿されたら、Instagramで投稿の「…」→「リンクをコピー」して貼る">
        {data && <List items={data.url} empty="入れるURLはありません。" render={(t) => <UrlCard key={t.row} t={t} onDone={done} />} />}
      </Section>

      <Section ready={!!data} title="インサイトを記録する" count={data?.insight.length} hint="投稿から3日たったら、Instagramの「インサイトを見る」の数字を入れる">
        {data?.insightError && <p className="secerr">{data.insightError}</p>}
        {data && !data.insightError && <List items={data.insight} empty="記録が必要な投稿はありません。" render={(t) => <InsightCard key={t.row} t={t} onDone={done} />} />}
      </Section>

      <Section ready={!!data} title="写真の許諾まわり" count={data?.permit.length} hint="DMやメールの送信、Canvaへのアップロードはこうきだけができる作業">
        {data?.permitError && <p className="secerr">{data.permitError}</p>}
        {data && !data.permitError && (
          <List items={data.permit} empty={permitEmpty(data.settings)} render={(t, i) => <PermitCard key={i} t={t} />} />
        )}
      </Section>

      <Section ready={!!data} title="AIが準備中の投稿">
        {data &&
          (data.upcoming.length ? (
            <div className="upcoming">
              {data.upcoming.map((u) => (
                <div className="up" key={u.row}>
                  <span className="d">{u.dateLabel}</span>
                  <span className="s">{u.label || "（スポット未定）"}</span>
                  <span className={"tag" + (u.scheduled ? "" : " warn")}>{u.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty">準備中の投稿はありません。</p>
          ))}
      </Section>

      <Section title="毎週の流れ">
        <div className="card">
          <ul className="week">
            <li>
              <b>日曜</b>：翌週分
              {data?.schedule.days || data?.schedule.count ? `（${[data.schedule.days, data.schedule.count].filter(Boolean).join("・")}）` : ""}
              を確認して予約。3日以上たった投稿のインサイトも記録
            </li>
            <li><b>月曜</b>：AIが週次分析</li>
            <li><b>木曜</b>：AIが翌々週分を企画</li>
            <li><b>金曜</b>：AIがキャプションを執筆。写真の締め切り</li>
            <li><b>毎日</b>：AIがデザインを作って「承認待ち」にする</li>
          </ul>
        </div>
      </Section>

      <footer>
        <span>
          データは <a href={SHEET_URL} target="_blank" rel="noopener noreferrer">運用管理シート</a> から直接読み書きしています。
        </span>
        <button
          type="button"
          className="ghost"
          onClick={async () => {
            await fetch("/api/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
            location.href = "/login";
          }}
        >
          ログアウト
        </button>
      </footer>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function Section({ title, count, hint, ready = true, children }: { title: string; count?: number; hint?: string; ready?: boolean; children: React.ReactNode }) {
  const loading = !ready;
  return (
    <section className="sec" aria-label={title}>
      <h2>
        {title}
        {count !== undefined && <span className={"badge" + (count > 0 ? " hot" : "")} aria-label={`${count}件`}>{count}</span>}
      </h2>
      {hint && <p className="hint">{hint}</p>}
      {loading ? <div className="skeleton" aria-hidden /> : children}
    </section>
  );
}

function List<T>({ items, empty, render }: { items: T[]; empty: string; render: (t: T, i: number) => React.ReactNode }) {
  if (!items.length) return <p className="empty">{empty}</p>;
  return <div className="stack">{items.map(render)}</div>;
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="btn" href={href} target="_blank" rel="noopener noreferrer">
      {children} <span className="ext" aria-hidden>↗</span>
    </a>
  );
}

function Msg({ r }: { r: ApiResult | { info: string } | null }) {
  if (!r) return null;
  if ("info" in r) return <p className="msg info" aria-live="polite">{r.info}</p>;
  return (
    <p className={"msg " + (r.ok ? "ok" : "err")} role={r.ok ? "status" : "alert"}>
      {r.message}
    </p>
  );
}

function daysLabel(d: number) {
  if (d < 0) return "日付が過ぎています";
  if (d === 0) return "今日";
  return `あと${d}日`;
}

// ---------- 1. 確認して予約する ----------
function ApproveCard({ t, onDone }: { t: ApproveTask; onDone: Toast }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<ApiResult | { info: string } | null>(null);
  const [copied, setCopied] = useState<"ok" | "select" | null>(null);
  const capRef = useRef<HTMLPreElement>(null);
  const detRef = useRef<HTMLDetailsElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(t.copyText);
      setCopied("ok");
    } catch {
      // クリップボードが使えないときは全文を選択して、長押しでコピーしてもらう
      if (detRef.current) detRef.current.open = true;
      if (capRef.current) {
        const range = document.createRange();
        range.selectNodeContents(capRef.current);
        const sel = getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      setCopied("select");
    }
    setTimeout(() => setCopied(null), 2500);
  }

  async function submit() {
    setBusy(true);
    setMsg({ info: "シートを更新中…" });
    const r = await postJson("/api/approve", { row: t.row, date: t.date });
    setBusy(false);
    if (r.ok) {
      setConfirming(false);
      setMsg(null);
      onDone(`${t.dateLabel.split(" ")[0]}を「承認済み」にしました`);
    } else setMsg(r);
  }

  return (
    <article className={"card" + (t.urgent ? " urgent" : "")}>
      <div className="row">
        <span className="date">{t.dateLabel}</span>
        <span className="tag">{t.type}</span>
        {t.area && <span className="tag">{t.area}</span>}
        <span className={"tag " + (t.daysLeft <= 1 ? "coral" : t.urgent ? "coral" : "warn")}>{daysLabel(t.daysLeft)}</span>
      </div>
      {t.hook && <p className="title">{t.hook}</p>}
      {t.spots && <p className="spots">{t.spots}</p>}
      <ol className="steps">
        <li>Canvaでデザインを開いて全ページ確認 →「共有」→「ダウンロード」でPNG・全ページ</li>
        <li>キャプションをコピー</li>
        <li>Meta Business Suiteで{t.type}投稿を作り、{t.dateLabel}に予約</li>
        <li>予約できたら「予約した」を押す</li>
      </ol>
      <div className="actions">
        {t.designUrl ? <Ext href={t.designUrl}>Canvaで開く</Ext> : <span className="tag coral" style={{ alignSelf: "center", justifySelf: "start" }}>デザインURLがありません</span>}
        <button type="button" onClick={copy} disabled={!t.copyText}>
          {copied === "ok" ? "コピーしました ✓" : copied === "select" ? "選択したので長押しでコピー" : t.copyText ? "キャプションをコピー" : "キャプションがありません"}
        </button>
        <Ext href={BS_URL}>Business Suite</Ext>
      </div>
      {t.copyText && (
        <details ref={detRef}>
          <summary>キャプション全文を見る</summary>
          <pre className="cap" ref={capRef}>{t.copyText}</pre>
        </details>
      )}
      {!confirming ? (
        <button type="button" className="primary" onClick={() => { setConfirming(true); setMsg(null); }}>
          予約した → 承認済みにする
        </button>
      ) : (
        <div className="confirm">
          <span>{t.dateLabel}の投稿を、Meta Business Suiteで予約しましたか？ シートのステータスを「承認済み」にします。</span>
          <div className="row">
            <button type="button" className="primary" onClick={submit} disabled={busy}>はい</button>
            <button type="button" onClick={() => { setConfirming(false); setMsg(null); }} disabled={busy}>まだ</button>
          </div>
        </div>
      )}
      <Msg r={msg} />
    </article>
  );
}

// ---------- 2. 投稿URLを入れる ----------
function UrlCard({ t, onDone }: { t: UrlTask; onDone: Toast }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<ApiResult | { info: string } | null>(null);
  const id = `url-${t.row}`;
  const invalid = msg !== null && "ok" in msg && !msg.ok && msg.code === "invalid";

  async function save() {
    const url = v.trim();
    if (!INSTAGRAM_POST_RE.test(url)) {
      setMsg({ ok: false, code: "invalid", message: "InstagramのURL（https://www.instagram.com/p/… または /reel/…）を貼ってください。" });
      return;
    }
    setBusy(true);
    setMsg({ info: "保存中…" });
    const r = await postJson("/api/post-url", { row: t.row, date: t.date, url });
    setBusy(false);
    if (r.ok) {
      setMsg(null);
      onDone(`${t.dateLabel.split(" ")[0]}の投稿URLを保存して「投稿済み」にしました`);
    } else setMsg(r);
  }

  return (
    <article className="card">
      <div className="row">
        <span className="date">{t.dateLabel}</span>
        <span className="tag">{t.type}</span>
        {t.area && <span className="tag">{t.area}</span>}
      </div>
      {t.spots && <p className="spots">{t.spots}</p>}
      <label className="field" htmlFor={id}>InstagramのURL</label>
      <div className="urlrow">
        <input
          id={id}
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="https://www.instagram.com/p/…"
          value={v}
          aria-invalid={invalid}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && save()}
        />
        <button type="button" className="primary" onClick={save} disabled={busy || !v.trim()}>保存</button>
      </div>
      <Msg r={msg} />
    </article>
  );
}

// ---------- 3. インサイトを記録する ----------
function InsightCard({ t, onDone }: { t: InsightTask; onDone: Toast }) {
  const [vals, setVals] = useState<Record<MetricKey, string>>(() => Object.fromEntries(METRICS.map((m) => [m.key, ""])) as Record<MetricKey, string>);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<ApiResult | { info: string } | null>(null);
  const [tried, setTried] = useState(false);
  const isBad = (s: string) => !/^\d+$/.test(s.normalize("NFKC").replace(/,/g, "").trim());

  async function save() {
    setTried(true);
    if (METRICS.some((m) => isBad(vals[m.key]))) {
      setMsg({ ok: false, code: "invalid", message: "7つ全部に0以上の整数を入れてください（0でもOK）。" });
      return;
    }
    setBusy(true);
    setMsg({ info: "記録中…" });
    const r = await postJson("/api/insight", { row: t.row, date: t.date, metrics: vals });
    setBusy(false);
    if (r.ok) {
      setMsg(null);
      onDone(`${t.dateLabel}の投稿を分析ログに記録しました`);
    } else setMsg(r);
  }

  return (
    <article className={"card" + (t.urgent ? " urgent" : "")}>
      <div className="row">
        <span className="date">{t.dateLabel}</span>
        <span className={"tag " + (t.urgent ? "coral" : "warn")}>投稿から{t.daysSince}日</span>
        {t.area && <span className="tag">{t.area}</span>}
      </div>
      {t.spots && <p className="spots">{t.spots}</p>}
      {t.postUrl && <Ext href={t.postUrl}>投稿を開く</Ext>}
      <div className="grid">
        {METRICS.map((m) => (
          <label className="field" key={m.key}>
            {m.header}
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              value={vals[m.key]}
              aria-invalid={tried && isBad(vals[m.key])}
              onChange={(e) => setVals((p) => ({ ...p, [m.key]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <button type="button" className="primary" onClick={save} disabled={busy}>分析ログに記録</button>
      <Msg r={msg} />
    </article>
  );
}

// ---------- 4. 写真の許諾まわり ----------
function PermitCard({ t }: { t: PermitTask }) {
  return (
    <article className="card">
      <p className="title">{t.title}</p>
      {t.sub && <p className="spots">{t.sub}</p>}
      {t.link && (
        <div className="row">
          <Ext href={t.link}>{t.linkText}</Ext>
        </div>
      )}
    </article>
  );
}

// ---------- テスト期間 / 本番運用 ----------
function permitEmpty(st: Settings) {
  const photo = st.rules.find((r) => r.name === "使える写真");
  const v = photo ? (st.mode === "test" ? photo.test : photo.live) : "";
  return v ? `やることはありません（${modeLabel(st.mode)}：${v}）。` : "やることはありません。";
}

function ModeBar({ settings: st, onDone }: { settings: Settings; onDone: Toast }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<ApiResult | { info: string } | null>(null);
  const to: Mode = st.mode === "test" ? "live" : "test";
  const canSwitch = !!st.raw && !st.warning?.includes("「テスト期間」の値");

  async function submit() {
    setBusy(true);
    setMsg({ info: "シートを更新中…" });
    const r = await postJson("/api/mode", { shown: st.raw ?? "", to });
    setBusy(false);
    if (r.ok) {
      setOpen(false);
      setMsg(null);
      onDone(`「${modeLabel(to)}」に切り替えました`);
    } else setMsg(r);
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        <span className={"mode " + st.mode}>{modeLabel(st.mode)}</span>
        {st.updated && <span className="sub" style={{ margin: 0 }}>{st.updated} から</span>}
        <button type="button" className="small" onClick={() => { setOpen((v) => !v); setMsg(null); }} disabled={!canSwitch} aria-expanded={open}>
          切り替え
        </button>
      </div>
      {st.warning && <p className="secerr" role="alert">⚠️ {st.warning}</p>}
      {open && (
        <div className="confirm">
          <b>「{modeLabel(st.mode)}」→「{modeLabel(to)}」に切り替えますか？</b>
          {st.rules.length > 0 && (
            <div className="diff">
              {st.rules.map((r) => {
                const from = st.mode === "test" ? r.test : r.live;
                const next = to === "test" ? r.test : r.live;
                const same = from === next;
                return (
                  <div className={"drow" + (same ? " same" : "")} key={r.name}>
                    <div className="dname">{r.name}{same && <span className="tag" style={{ marginLeft: 6 }}>変わらない</span>}</div>
                    {same ? (
                      <div className="dval">{next}</div>
                    ) : (
                      <div className="dval">
                        <span className="dfrom">{from || "（空）"}</span>
                        <span aria-label="から"> → </span>
                        <b>{next || "（空）"}</b>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <span>次のAIの作業（毎朝10:43ほか）から新しい動き方になります。</span>
          <div className="row">
            <button type="button" className={to === "live" ? "coral" : "primary"} onClick={submit} disabled={busy}>切り替える</button>
            <button type="button" onClick={() => { setOpen(false); setMsg(null); }} disabled={busy}>やめる</button>
          </div>
        </div>
      )}
      <Msg r={msg} />
    </div>
  );
}

function RulesCard({ settings: st }: { settings: Settings }) {
  if (!st.rules.length) return null;
  return (
    <section className="sec" aria-label="今のルール">
      <h2>今のルール <span className={"mode " + st.mode} style={{ fontSize: 12 }}>{modeLabel(st.mode)}</span></h2>
      <dl className="rules card">
        {st.rules.map((r) => (
          <div key={r.name}>
            <dt>{r.name}</dt>
            <dd>{(st.mode === "test" ? r.test : r.live) || "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
