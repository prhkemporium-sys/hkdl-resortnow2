/**
 * Show Model - Data types for the Show Schedule feature
 * Integrates with Google Sheets API for dynamic scheduling
 */

export interface Show {
  id: string;
  date: Date;
  /** e.g. "ディズニー・フレンズ・ライブ：キャッスル・パーティー" */
  title: string;
  /** Single start time, e.g. "12:00" */
  time: string;
  /** Section: "ステージショー" / "パレード" / "ナイト・エンターテインメント" */
  section: string;
  /** "schedule / スケジュール" or "closure / クローズ" */
  category: string;
  /** Optional description from column J */
  description: string;
  /** Derived from section/category to drive chip filters */
  type: ShowType;
  /** Optional badge text (you can derive something here later if you like) */
  badge: string;
}

export type ShowType = 'nighttime' | 'broadway' | 'interactive' | 'default';

export interface ShowsByDate {
  [date: string]: Show[];
}

export interface ShowsApiResponse {
  range: string;
  majorDimension: string;
  values: string[][];
}

export interface EnvironmentConfig {
  production: boolean;
  googleSheetsApiKey: string;
  googleSheetsId: string;
  googleSheetsRange: string;
  cacheDurationMs: number;
}