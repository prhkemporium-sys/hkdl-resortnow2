import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { Show, ShowsByDate, ShowType, ShowsApiResponse } from '../models/show.model';

@Injectable({
  providedIn: 'root'
})
export class ShowsDataService {
  private http = inject(HttpClient);
  private cache: { data: ShowsByDate; timestamp: number } | null = null;
  private closuresCache: { data: { [date: string]: string[] }; timestamp: number } | null = null;
  private noticeCache: { data: { transport: string; weather: string; shows: string }; timestamp: number } | null = null;
  private eventsCache: { data: { name: string; date: string }[]; timestamp: number } | null = null;
  private showLogosCache: { data: { emojis: { [name: string]: string }; durations: { [name: string]: number } }; timestamp: number } | null = null;
  private parkHoursCache: { data: { open: string; close: string } | null; timestamp: number } | null = null;
  private headersValidated = false;

  getShows(): Observable<ShowsByDate> {
    const cachedData = this.getCachedData();
    if (cachedData) {
      return of(cachedData);
    }

    return this.fetchFromGoogleSheets().pipe(
      map(response => this.transformData(response)),
      catchError(error => {
        console.error('Error fetching shows from Google Sheets:', error);
        return throwError(() => this.getErrorMessage(error));
      })
    );
  }

  getClosures(): Observable<{ [date: string]: string[] }> {
    const cachedClosures = this.getCachedClosures();
    if (cachedClosures) {
      return of(cachedClosures);
    }

    return this.fetchFromGoogleSheets().pipe(
      map(response => this.transformClosures(response)),
      catchError(error => {
        console.error('Error fetching closures from Google Sheets:', error);
        return throwError(() => this.getErrorMessage(error));
      })
    );
  }

  refreshShows(): Observable<ShowsByDate> {
    this.cache = null;
    this.closuresCache = null;
    this.headersValidated = false;
    return this.getShows();
  }

  refreshClosures(): Observable<{ [date: string]: string[] }> {
    this.closuresCache = null;
    this.headersValidated = false;
    return this.getClosures();
  }

  getNotices(): Observable<{ transport: string; weather: string; shows: string }> {
    const cachedNotices = this.getCachedNotices();
    if (cachedNotices) {
      return of(cachedNotices);
    }

    const noticeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${environment.googleSheetsId}/values/Notice!A2:C2?key=${environment.googleSheetsApiKey}`;

    return this.http.get<any>(noticeUrl).pipe(
      map(response => {
        const values = response.values?.[0] || [];
        const notices = {
          transport: values[0]?.trim() || '',
          weather: values[1]?.trim() || '',
          shows: values[2]?.trim() || ''
        };

        // Cache the notices
        this.noticeCache = {
          data: notices,
          timestamp: Date.now()
        };

        return notices;
      }),
      catchError(error => {
        console.error('Error fetching notices from Google Sheets:', error);
        // Return empty notices on error
        return of({ transport: '', weather: '', shows: '' });
      })
    );
  }

  getEvents(): Observable<{ name: string; date: string }[]> {
    if (this.eventsCache && Date.now() - this.eventsCache.timestamp <= environment.cacheDurationMs) {
      return of(this.eventsCache.data);
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${environment.googleSheetsId}/values/event!A2:B8?key=${environment.googleSheetsApiKey}`;

    return this.http.get<{ values?: string[][] }>(url).pipe(
      map(response => {
        const rows = response.values || [];
        const events = rows
          .map(row => ({
            name: (row[0] || '').trim(),
            date: (row[1] || '').trim()
          }))
          .filter(e => e.name.length > 0);

        this.eventsCache = { data: events, timestamp: Date.now() };
        return events;
      }),
      catchError(error => {
        console.error('Error fetching events from Google Sheets:', error);
        return of([]);
      })
    );
  }

  getShowLogos(): Observable<{ emojis: { [name: string]: string }; durations: { [name: string]: number } }> {
    if (this.showLogosCache && Date.now() - this.showLogosCache.timestamp <= environment.cacheDurationMs) {
      return of(this.showLogosCache.data);
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${environment.googleSheetsId}/values/showlogo!A2:C20?key=${environment.googleSheetsApiKey}`;

    return this.http.get<{ values?: string[][] }>(url).pipe(
      map(response => {
        const rows = response.values || [];
        const emojis: { [name: string]: string } = {};
        const durations: { [name: string]: number } = {};
        rows.forEach(row => {
          const name = (row[0] || '').trim();
          const emoji = (row[1] || '').trim();
          const durationRaw = (row[2] || '').trim();
          if (!name) return;
          if (emoji) emojis[name] = emoji;
          const durationNum = parseInt(durationRaw, 10);
          if (!isNaN(durationNum) && durationNum > 0) {
            durations[name] = durationNum;
          }
        });

        const data = { emojis, durations };
        this.showLogosCache = { data, timestamp: Date.now() };
        return data;
      }),
      catchError(error => {
        console.error('Error fetching show logos from Google Sheets:', error);
        return of({ emojis: {}, durations: {} });
      })
    );
  }

  getParkHours(): Observable<{ open: string; close: string } | null> {
    if (this.parkHoursCache && Date.now() - this.parkHoursCache.timestamp <= environment.cacheDurationMs) {
      return of(this.parkHoursCache.data);
    }

    return this.fetchFromGoogleSheets().pipe(
      map(response => {
        const hours = this.extractTodaysHours(response);
        this.parkHoursCache = { data: hours, timestamp: Date.now() };
        return hours;
      }),
      catchError(error => {
        console.error('Error fetching park hours from Google Sheets:', error);
        return of(null);
      })
    );
  }

  private extractTodaysHours(response: ShowsApiResponse): { open: string; close: string } | null {
    if (!response.values || !Array.isArray(response.values)) {
      return null;
    }

    const todayKey = this.formatDateKey(new Date());

    for (let i = 1; i < response.values.length; i++) {
      const row = response.values[i];
      if (!row || row.length < 3) continue;

      const dateStr = row[0];
      const open = (row[1] || '').trim();
      const close = (row[2] || '').trim();

      if (!dateStr || !open || !close) continue;

      const date = new Date(dateStr);
      if (isNaN(date.getTime())) continue;

      if (this.formatDateKey(date) === todayKey) {
        return { open, close };
      }
    }

    return null;
  }

  private getCachedNotices(): { transport: string; weather: string; shows: string } | null {
    if (!this.noticeCache) return null;

    const age = Date.now() - this.noticeCache.timestamp;
    if (age > environment.cacheDurationMs) {
      this.noticeCache = null;
      return null;
    }

    return this.noticeCache.data;
  }

  private getCachedData(): ShowsByDate | null {
    if (!this.cache) return null;

    const age = Date.now() - this.cache.timestamp;
    if (age > environment.cacheDurationMs) {
      this.cache = null;
      return null;
    }

    return this.cache.data;
  }

  private getCachedClosures(): { [date: string]: string[] } | null {
    if (!this.closuresCache) return null;

    const age = Date.now() - this.closuresCache.timestamp;
    if (age > environment.cacheDurationMs) {
      this.closuresCache = null;
      return null;
    }

    return this.closuresCache.data;
  }

  private fetchFromGoogleSheets(): Observable<ShowsApiResponse> {
    if (!environment.googleSheetsApiKey || !environment.googleSheetsId) {
      throw new Error(
        'Google Sheets API credentials not configured. Please set googleSheetsApiKey and googleSheetsId in environment files.'
      );
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${environment.googleSheetsId}/values/${environment.googleSheetsRange}?key=${environment.googleSheetsApiKey}`;

    return this.http.get<ShowsApiResponse>(url);
  }

  private transformData(response: ShowsApiResponse): ShowsByDate {
    const shows: ShowsByDate = {};

    if (!response.values || !Array.isArray(response.values)) {
      console.warn('No data in Google Sheets response');
      return shows;
    }

    // Validate headers (optional)
    if (!this.headersValidated && response.values.length > 0) {
      const headers = response.values[0];
      if (!this.validateHeaders(headers)) {
        console.warn('Warning: Sheet headers may not match expected format. Continuing anyway.');
      }
      this.headersValidated = true;
    }

    // Skip header row (index 0)
    response.values.forEach((row, index) => {
      if (index === 0) return;

      const rowShows = this.parseRow(row);
      if (rowShows.length > 0) {
        rowShows.forEach(show => {
          const dateStr = this.formatDateKey(show.date);
          if (!shows[dateStr]) {
            shows[dateStr] = [];
          }
          shows[dateStr].push(show);
        });
      }
    });

    const filteredShows = this.filterNext7Days(shows);

    this.cache = {
      data: filteredShows,
      timestamp: Date.now()
    };

    return filteredShows;
  }

  /**
   * Convert a single Google Sheets row into one or more Show entries.
   * - Expands "12:00, 14:15, 16:00, 17:45" into 4 separate shows.
   */
  private parseRow(row: string[]): Show[] {
    // We expect at least 8 columns for schedule rows
    if (!row || row.length < 8) {
      console.warn('Invalid row format:', row);
      return [];
    }

    const [
      dateStr,        // 0: date / 日付
      open,           // 1: open / 開園時間 (unused)
      close,          // 2: close / 閉園時間 (unused)
      status,         // 3: status / ステータス (unused)
      category,       // 4: category / 区分  e.g. "schedule / スケジュール" or "closure / クローズ"
      section,        // 5: section / セクション
      name,           // 6: name / 名前
      timeStr,        // 7: time / 時間
      closureType,    // 8: closure_type / クローズ種別 (optional)
      description     // 9: description / 説明 (optional)
    ] = row;

    // Only interested in "schedule" rows for this component
    if (!category || !category.toLowerCase().includes('schedule')) {
      return [];
    }

    if (!dateStr || !name || !timeStr) {
      console.warn('Missing required fields in row:', row);
      return [];
    }

    // Omit specific show from display
    if (name.trim() === 'プレイハウス・イン・ザ・ウッズ') {
      return [];
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date format: ${dateStr}`);
      return [];
    }

    // timeStr might be: "12:00, 14:15, 16:00, 17:45" OR "11:30 ~ 19:00"
    // We will:
    // - Split by comma.
    // - For each part, take the first HH:MM found.
    const times: string[] = [];

    timeStr.split(',').forEach(part => {
      const trimmed = part.trim();
      const match = trimmed.match(/(\d{1,2}:\d{2})/);
      if (match) {
        // Normalize to 2-digit hour:minute
        const [h, m] = match[1].split(':');
        const normalizedTime = `${h.padStart(2, '0')}:${m}`;
        times.push(normalizedTime);
      }
    });

    if (times.length === 0) {
      console.warn('No valid times found in row:', row);
      return [];
    }

    const type = this.deriveShowType(section, category);

    // Create one Show per time
    const shows: Show[] = times.map(t => {
      const idBase = `${dateStr}-${name}-${t}`;
      const id = idBase
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]/g, '');

      return {
        id,
        date,
        title: name.trim(),
        time: t,
        section: section?.trim() || '',
        category: category?.trim() || '',
        description: description?.trim() || '',
        type,
        badge: this.deriveBadge(section, category)
      };
    });

    return shows;
  }

  private deriveShowType(section: string, category: string): ShowType {
    const sec = (section || '').toLowerCase();
    const cat = (category || '').toLowerCase();

    if (sec.includes('ナイト') || sec.includes('night')) {
      return 'nighttime';
    }
    if (sec.includes('ステージショー')) {
      return 'broadway';
    }
    if (sec.includes('パレード')) {
      return 'interactive';
    }

    // Fallback
    if (cat.includes('schedule')) return 'default';
    return 'default';
  }

  private deriveBadge(section: string, category: string): string {
    const sec = (section || '').toLowerCase();
    const cat = (category || '').toLowerCase();

    if (sec.includes('パレード')) return 'Parade';
    if (sec.includes('ナイト')) return 'Nighttime Show';
    if (sec.includes('ステージショー')) return 'Stage Show';
    if (cat.includes('schedule')) return 'Scheduled';

    return '';
  }

  /**
   * Validates that Google Sheets headers match expected format for THIS sheet
   */
  private validateHeaders(headers: string[]): boolean {
    const expectedHeaders = [
      'date / 日付',
      'open / 開園時間',
      'close / 閉園時間',
      'status / ステータス',
      'category / 区分',
      'section / セクション',
      'name / 名前',
      'time / 時間',
      'closure_type / クローズ種別',
      'description / 説明'
    ];

    if (headers.length < expectedHeaders.length) {
      console.error(`Expected ${expectedHeaders.length} columns, found ${headers.length}`);
      return false;
    }

    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
    const normalizedExpected = expectedHeaders.map(h => h.toLowerCase().trim());

    for (let i = 0; i < normalizedExpected.length; i++) {
      if (normalizedHeaders[i] !== normalizedExpected[i]) {
        console.error(
          `Column ${i} mismatch: expected "${normalizedExpected[i]}", found "${normalizedHeaders[i]}"`
        );
        return false;
      }
    }

    return true;
  }

  private filterNext7Days(shows: ShowsByDate): ShowsByDate {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    const filtered: ShowsByDate = {};

    Object.keys(shows).forEach(dateKey => {
      const date = new Date(dateKey);
      date.setHours(0, 0, 0, 0);

      if (date >= today && date < sevenDaysLater) {
        filtered[dateKey] = shows[dateKey];
      }
    });

    return filtered;
  }

  private formatDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Transform closure data from Google Sheets
   * Looks for rows where category contains "closure"
   */
  private transformClosures(response: ShowsApiResponse): { [date: string]: string[] } {
    const closures: { [date: string]: string[] } = {};

    if (!response.values || !Array.isArray(response.values)) {
      return closures;
    }

    // Skip header row (index 0)
    response.values.forEach((row, index) => {
      if (index === 0) return;

      if (!row || row.length < 8) return;

      const [
        dateStr,        // 0: date
        open,           // 1: open (unused)
        close,          // 2: close (unused)
        status,         // 3: status (unused)
        category,       // 4: category
        section,        // 5: section (unused)
        name,           // 6: name - facility name
        timeStr,        // 7: time (unused)
        closureType,    // 8: closure_type
        description     // 9: description (unused)
      ] = row;

      // Only process "closure" rows
      if (!category || !category.toLowerCase().includes('closure')) {
        return;
      }

      if (!dateStr || !name) return;

      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        console.warn(`Invalid date format for closure: ${dateStr}`);
        return;
      }

      const dateKey = this.formatDateKey(date);

      if (!closures[dateKey]) {
        closures[dateKey] = [];
      }

      // Add only facility name (no closure_type)
      closures[dateKey].push(name.trim());
    });

    // Filter for next 7 days only
    const filteredClosures = this.filterNext7DaysClosures(closures);

    this.closuresCache = {
      data: filteredClosures,
      timestamp: Date.now()
    };

    return filteredClosures;
  }

  private filterNext7DaysClosures(closures: { [date: string]: string[] }): { [date: string]: string[] } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    const filtered: { [date: string]: string[] } = {};

    Object.keys(closures).forEach(dateKey => {
      const date = new Date(dateKey);
      date.setHours(0, 0, 0, 0);

      if (date >= today && date < sevenDaysLater) {
        filtered[dateKey] = closures[dateKey];
      }
    });

    return filtered;
  }

  private getErrorMessage(error: any): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) {
        return 'Access denied. Check your API key and Sheet ID configuration.';
      }
      if (error.status === 404) {
        return 'Sheet not found. Verify the Google Sheets ID.';
      }
      if (error.status === 400) {
        return 'Invalid request. Check the range and sheet name.';
      }
      return `HTTP Error ${error.status}: ${error.statusText}`;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'An unexpected error occurred while fetching shows.';
  }
}