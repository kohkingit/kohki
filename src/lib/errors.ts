// 画面に出すエラー。「何が起きたか・どうすればいいか」を日本語で。

export type AppErrorCode =
  | "config" // .env の設定がない・おかしい
  | "auth" // サービスアカウントの鍵が無効
  | "forbidden" // シートが共有されていない
  | "notfound" // シートやタブが見つからない
  | "quota" // 回数制限
  | "network" // Googleにつながらない
  | "header" // 見出しが見つからない
  | "changed" // 画面を出したあとにシートが変わった
  | "duplicate" // もう記録済み
  | "invalid" // 入力がおかしい
  | "unknown";

export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}

export const MSG_CHANGED = "シートが変わっています。「最新にする」を押してから、もう一度やってください。";

export function sheetsHttpError(status: number, detail: string): AppError {
  const d = detail ? `（Googleの応答: ${detail.slice(0, 160)}）` : "";
  if (status === 401)
    return new AppError("auth", "Googleにログインできませんでした。サービスアカウントの鍵（GOOGLE_PRIVATE_KEY）が正しいか、鍵が削除されていないか確認してください。" + d, 502);
  if (status === 403)
    return new AppError("forbidden", "運用管理シートを開く権限がありません。シートの「共有」でサービスアカウントのメールアドレスを「編集者」として追加してください。Google Sheets API が有効になっているかも確認してください。" + d, 502);
  if (status === 404)
    return new AppError("notfound", "運用管理シートが見つかりません。SPREADSHEET_ID が正しいか確認してください。" + d, 502);
  if (status === 400 && /Unable to parse range/i.test(detail))
    return new AppError("notfound", "シートのタブが見つかりません。「投稿カレンダー」「分析ログ」「許諾管理」のタブ名が変わっていないか確認してください。" + d, 502);
  if (status === 400 && /exceeds grid limits/i.test(detail))
    return new AppError("unknown", "分析ログの行が足りません。シートの一番下に空の行を追加してから、もう一度やってください。" + d, 502);
  if (status === 429)
    return new AppError("quota", "Googleへのアクセスが多すぎて一時的に止められています。1分ほど待ってから「最新にする」を押してください。", 503);
  if (status >= 500)
    return new AppError("network", "Google Sheets が一時的に不調です。少し待ってから「最新にする」を押してください。" + d, 503);
  return new AppError("unknown", `Google Sheets がエラーを返しました（${status}）。` + d, 502);
}

export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  if (/invalid_grant|invalid_client|unauthorized_client|DECODER|PEM|private key/i.test(msg))
    return new AppError("auth", "サービスアカウントの鍵が読み込めません。.env の GOOGLE_PRIVATE_KEY と GOOGLE_SERVICE_ACCOUNT_EMAIL を確認してください（改行は \\n のまま、全体を \" で囲む）。", 500);
  if (/fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network|socket/i.test(msg))
    return new AppError("network", "Google につながりませんでした。少し待ってから「最新にする」を押してください。", 503);
  return new AppError("unknown", "予期しないエラーが起きました：" + msg.slice(0, 200), 500);
}
