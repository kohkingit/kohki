// SHEETS_MOCK=1 のときに使うサンプルデータ（Googleにつながず画面を試す用）。
// 書き込みはメモリ上だけで、サーバーを止めると消える。
import type { CellUpdate, SheetsBackend } from "./sheets";
import type { Grid } from "./schema";
import { fmtSheetDate, jstNow, type DateKey } from "./jst";
import { TAB_CAL, TAB_LOG, TAB_PERMIT, TAB_SETTINGS } from "./schema";

function addDays(k: DateKey, n: number): DateKey {
  const d = new Date(Date.UTC(Math.floor(k / 10000), (Math.floor(k / 100) % 100) - 1, k % 100) + n * 864e5);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

function build(): Record<string, Grid> {
  const t = jstNow().today;
  const D = (n: number) => fmtSheetDate(addDays(t, n));
  const cal: Grid = [
    ["投稿日", "曜日", "ステータス", "投稿形式", "地域", "スポット", "テーマ・季節", "切り口（1行目のフック）", "キャプション", "ハッシュタグ", "素材URL", "素材の出典・権利", "デザインURL", "投稿URL", "メモ"],
    [D(-30), "", "投稿済み", "カルーセル", "北海道", "美瑛、青い池", "秋", "例", "例", "#例", "", "", "", "", "記入例：この行は無視されます"],
    [D(-9), "", "投稿済み", "カルーセル", "長野", "上高地、大正池", "紅葉", "上高地は朝7時が正解", "キャプション", "#上高地", "", "", "https://www.canva.com/design/x", "https://www.instagram.com/p/AAA111/", ""],
    [D(-5), "", "投稿済み", "カルーセル", "京都", "嵐山、竹林の小径", "紅葉", "竹林は8時前に行け", "キャプション", "#京都", "", "", "https://www.canva.com/design/y", "https://www.instagram.com/p/BBB222/", ""],
    [D(-2), "", "承認済み", "カルーセル", "岐阜", "白川郷", "紅葉", "白川郷の展望台、実は2つある", "キャプション", "#白川郷", "", "", "https://www.canva.com/design/z", "", ""],
    [D(0), "", "承認済み", "カルーセル", "栃木", "日光、華厳の滝", "紅葉", "華厳の滝は11月上旬まで", "キャプション", "#日光", "", "", "https://www.canva.com/design/a", "", ""],
    [D(2), "", "承認待ち", "カルーセル", "山梨", "河口湖、もみじ回廊", "紅葉", "もみじ回廊のライトアップ、混まない時間帯", "\"河口湖のもみじ回廊、夜に行ったことある？\n\nライトアップは17時から。\n18時を過ぎると人が減ってくる🍁\n\n📍河口湖もみじ回廊\n🚗河口湖ICから15分\"", "#河口湖 #もみじ回廊 #紅葉スポット #国内旅行", "", "", "https://www.canva.com/design/b", "", "写真がCanvaにない: もみじ回廊"],
    [D(4), "", "承認待ち", "カルーセル", "神奈川", "箱根、大涌谷、芦ノ湖", "秋", "箱根は逆回りで回ると空いてる", "箱根を1日で回るなら、ロープウェイから。", "#箱根 #国内旅行", "", "", "", "", ""],
    [D(6), "", "画像作成中", "カルーセル", "静岡", "伊豆、河津七滝", "秋", "", "", "", "", "", "", "", ""],
    [D(9), "", "下書き", "カルーセル", "千葉", "鋸山、地獄のぞき", "冬", "", "", "", "", "", "", "", ""],
    [D(11), "", "アイデア", "リール", "茨城", "袋田の滝", "冬", "", "", "", "", "", "", "", ""],
    [D(13), "", "見送り", "カルーセル", "東京", "高尾山", "冬", "", "", "", "", "", "", "", ""],
  ];
  const log: Grid = [
    ["投稿日", "スポット", "投稿形式", "リーチ", "いいね", "保存", "シェア", "コメント", "プロフィールアクセス", "フォロー増", "保存率", "エンゲージ率", "記録日"],
    [D(-9), "上高地、大正池", "カルーセル", "1200", "80", "45", "6", "3", "30", "5", "3.8%", "11.2%", D(-5)],
    ["", "", "", "", "", "", "", "", "", "", "", "", ""],
  ];
  const permit: Grid = [
    ["依頼日", "スポット", "相手", "種別", "連絡手段", "連絡先・URL", "写真URL", "ステータス", "利用条件", "クレジット表記", "証拠の保存先", "メモ", "Canva素材名", "依頼ID", "再利用可否"],
    ["", "もみじ回廊", "富士河口湖町観光課", "自治体", "メール", "kanko@example.jp", "", "候補", "", "", "", "Gmail下書き作成済み", "", "", ""],
    ["", "大涌谷", "@hakone_photo", "個人", "Instagram DM", "@hakone_photo", "", "候補", "", "", "", "", "", "", ""],
    [D(-7), "河津七滝", "@izu_trip", "個人", "Instagram DM", "https://www.instagram.com/izu_trip/", "", "依頼済み", "", "", "", "", "", "", ""],
  ];
  const settings: Grid = [
    ["項目", "値", "説明", "更新日"],
    ["テスト期間", "ON", "ON＝テスト期間中／OFF＝本番運用。アプリから切り替える。AIは毎回ここを読んで動き方を決める", D(-1)],
    ["", "", ""],
    ["ルール", "テスト期間ON", "テスト期間OFF（本番）"],
    ["投稿本数", "週3本（カルーセル）", "週7本（季節4・通年3）"],
    ["投稿曜日・時刻", "月・水・金 20:00", "毎日 20:00"],
    ["リール", "当面なし", "当面なし（生成AIの旅あるある動画を別途検討）"],
    ["使える写真", "こうきの自前写真か許可済みの写真だけ", "こうきの自前写真か許可済みの写真だけ"],
    ["許諾依頼", "木曜の通知で候補3件まで＋送る文面（送信はこうき）", "木曜の通知で候補5件まで＋送る文面（送信はこうき）。返信の確認・お礼の下書きもAIが作る"],
    ["宿の紹介", "しない", "おまけ程度に入れてよい"],
    ["インサイト記録", "24h・72h・7dの3回", "24h・72h・7dの3回"],
    ["型の見直し", "カルーセル12本がそろったら", "週次分析で2週続けて同じ提案が出たら"],
  ];
  return { [TAB_CAL]: cal, [TAB_LOG]: log, [TAB_PERMIT]: permit, [TAB_SETTINGS]: settings };
}

function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseRange(range: string) {
  const m = range.match(/^'((?:[^']|'')+)'!([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/);
  if (!m) throw new Error("mock: bad range " + range);
  const tab = m[1].replace(/''/g, "'");
  const c1 = colIndex(m[2]);
  const r1 = m[3] ? +m[3] - 1 : 0;
  const c2 = m[4] ? colIndex(m[4]) : c1;
  const r2 = m[5] ? +m[5] - 1 : m[4] ? Infinity : r1;
  return { tab, c1, r1, c2, r2 };
}

export function createMockBackend(): SheetsBackend {
  const data = build();
  return {
    async batchGet(ranges) {
      await new Promise((r) => setTimeout(r, 250));
      return ranges.map((range) => {
        const { tab, c1, r1, c2, r2 } = parseRange(range);
        const g = data[tab];
        if (!g) throw new Error("mock: no tab " + tab);
        const rows = g.slice(r1, Math.min(g.length, r2 + 1)).map((row) => row.slice(c1, c2 + 1));
        // Sheets API と同じく、末尾の空セル・空行は返さない
        const trimmed = rows.map((row) => {
          const out = [...row];
          while (out.length && out[out.length - 1] === "") out.pop();
          return out;
        });
        while (trimmed.length && trimmed[trimmed.length - 1].length === 0) trimmed.pop();
        return trimmed;
      });
    },
    async batchUpdate(updates: CellUpdate[]) {
      await new Promise((r) => setTimeout(r, 300));
      for (const u of updates) {
        const { tab, c1, r1 } = parseRange(u.range);
        const g = data[tab];
        u.values.forEach((row, i) => {
          while (g.length <= r1 + i) g.push([]);
          row.forEach((v, j) => {
            const target = g[r1 + i];
            while (target.length <= c1 + j) target.push("");
            target[c1 + j] = String(v).replace(/^'/, "");
          });
        });
      }
    },
  };
}
