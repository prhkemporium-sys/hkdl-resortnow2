import { Component, OnInit, OnDestroy, inject, ElementRef, ViewChildren, QueryList, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ShowsDataService } from '../../services/shows-data.service';
import { Show, ShowsByDate, ShowType } from '../../models/show.model';
import { pressPop, springIn } from '../../utils/motion';

@Component({
  selector: 'app-show',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatButtonModule, MatChipsModule, MatButtonToggleModule, MatSlideToggleModule],
  template: `
    <div class="page-shell">
      <div class="page-container">

        <!-- NOTICE BOX -->
        @if (noticeText) {
          <div class="notice-box" role="alert">
            <mat-icon class="notice-icon">info</mat-icon>
            <span class="notice-text">{{ noticeText }}</span>
          </div>
        }

        <!-- HEADER -->
        <header class="shows-header">
          <div>
            <h1 class="title">ショースケジュール</h1>
            <p class="subtitle">
              本日のショースケジュールはHKDL公式アプリにてご確認ください。
            </p>
          </div>

          <div class="header-meta" *ngIf="lastUpdated">
            <mat-icon>update</mat-icon>
            <span>{{ getTimeAgo(lastUpdated) }}更新</span>
          </div>
        </header>

        <!-- NAVIGATION BUTTONS -->
        <div class="nav-buttons">
          <button mat-raised-button color="primary" class="nav-btn" (click)="scrollToSchedule()">
            <mat-icon>event</mat-icon>
            ショースケジュール
          </button>
          <button mat-raised-button color="accent" class="nav-btn" (click)="scrollToClosures()">
            <mat-icon>block</mat-icon>
            休止施設
          </button>
        </div>

        <!-- DATE + FILTER BAR -->
        <section class="controls-shell" id="schedule-section">
          <!-- Date Selector -->
          <div class="date-selector" *ngIf="next7Days.length > 0">
            <button *ngFor="let date of next7Days"
                    class="date-chip"
                    [class.active]="isSameDay(selectedDate, date)"
                    (click)="selectDate(date)">
              <span class="day-name">{{ getJapaneseDayOfWeek(date) }}</span>
              <span class="day-number">{{ date | date:'dd' }}</span>
            </button>
          </div>

          <!-- View Mode Toggle -->
          <div class="view-mode-toggle">
            <mat-button-toggle-group [value]="viewMode" (change)="setViewMode($event.value)" aria-label="表示モード">
              <mat-button-toggle value="byTime">
                <mat-icon>schedule</mat-icon>
                <span>時刻順</span>
              </mat-button-toggle>
              <mat-button-toggle value="byShow">
                <mat-icon>view_agenda</mat-icon>
                <span>ショー別</span>
              </mat-button-toggle>
            </mat-button-toggle-group>

            <mat-slide-toggle *ngIf="viewMode === 'byTime'"
                              class="overlap-toggle"
                              [checked]="overlapCheckEnabled"
                              (change)="toggleOverlapCheck($event.checked)">
              時間被り確認
            </mat-slide-toggle>
          </div>

          <!-- Show Name Filters (Multiple Selection) -->
          <div class="filters">
            <mat-chip-set aria-label="Show name filters (multiple selection)">
              <mat-chip-option [selected]="selectedShowNames.length === 0"
                               (click)="onChipTap($event); setShowFilter('all')">
                すべて
              </mat-chip-option>

              <mat-chip-option *ngFor="let showName of uniqueShowNames"
                               [selected]="isShowSelected(showName)"
                               (click)="onChipTap($event); setShowFilter(showName)"
                               [style.background-color]="isShowSelected(showName) ? showColors[showName] : 'transparent'"
                               [style.border-color]="showColors[showName]"
                               [style.color]="isShowSelected(showName) ? 'white' : showColors[showName]"
                               class="show-chip">
                {{ showName }}
                <span class="chip-emoji" *ngIf="showEmojis[showName]" aria-hidden="true">{{ showEmojis[showName] }}</span>
              </mat-chip-option>
            </mat-chip-set>
          </div>
        </section>

        <!-- LOADING STATE -->
        <section *ngIf="loading" class="skeleton-group">
          <article class="skeleton-card" *ngFor="let i of [1,2,3]"></article>
        </section>

        <!-- ERROR STATE -->
        <section *ngIf="error && !loading" class="state-card error-card">
          <mat-icon class="state-icon">error_outline</mat-icon>
          <h2>ショースケジュール取得エラー</h2>
          <p>{{ error }}</p>
          <button mat-stroked-button color="primary" (click)="loadShows()">リトライ</button>
        </section>

        <!-- EMPTY STATE -->
        <section *ngIf="!loading && !error && filteredShows.length === 0 && next7Days.length > 0"
                 class="state-card empty-card">
          <mat-icon class="state-icon">event_busy</mat-icon>
          <h2>ショースケジュールなし</h2>
          <p>時間を置いて再アクセスしてください。</p>
        </section>

        <!-- SHOWS LIST -->
        <section *ngIf="!loading && !error && filteredShows.length > 0" class="shows-layout">
          <!-- Sticky date header for context -->
          <div class="day-header">
            <div>
              <span class="day-header-label">選択日</span>
              <h2 class="day-header-title">
                {{ selectedDate | date:'yyyy年MM月dd日' }}（{{ getJapaneseDayOfWeek(selectedDate) }}）
              </h2>
            </div>
            <span class="day-header-count">
              {{ viewMode === 'byShow' ? groupedShows.length + '演目' : filteredShows.length + '公演' }}
            </span>
          </div>

          <!-- BY TIME (default) -->
          <div class="shows-grid" *ngIf="viewMode === 'byTime'">
            <article #cardRef
                     *ngFor="let show of filteredShows; let idx = index"
                     class="show-card"
                     [ngClass]="show.type"
                     [style.border-left-color]="showColors[show.title]"
                     [style.background]="'linear-gradient(135deg, ' + showColors[show.title] + '15, ' + showColors[show.title] + '08)'">

              <!-- Badges row -->
              <div class="show-card-top">
                <div class="badge-group">
                  <span class="pill pill-main" *ngIf="show.section">
                    {{ show.section }}
                  </span>
                </div>

                <div *ngIf="getCountdown(show)" class="countdown-pill">
                  <mat-icon>schedule</mat-icon>
                  <span>{{ getCountdown(show) }}</span>
                </div>
              </div>

              <!-- Title & description -->
              <h3 class="show-title">
                {{ show.title }}
              </h3>

              <p class="show-description" *ngIf="show.description">
                {{ show.description }}
              </p>

              <!-- Meta row -->
              <div class="show-meta-row">
                <div class="meta-item primary-time">
                  <mat-icon>schedule</mat-icon>
                  <div class="meta-text">
                    <span class="meta-label">開演時刻</span>
                    <span class="meta-value">{{ show.time }}</span>
                  </div>
                </div>
                <div class="meta-item" *ngIf="showDurations[show.title]">
                  <mat-icon>timelapse</mat-icon>
                  <div class="meta-text">
                    <span class="meta-label">上演時間</span>
                    <span class="meta-value">{{ showDurations[show.title] }}分</span>
                  </div>
                </div>
              </div>

              <div class="overlap-warning" *ngIf="overlapWarnings[show.id]?.length">
                <mat-icon>warning_amber</mat-icon>
                <div class="overlap-warning-body">
                  <span class="overlap-warning-title">時間被りの可能性</span>
                  <span class="overlap-warning-list">
                    {{ overlapWarnings[show.id].join(' / ') }}
                  </span>
                </div>
              </div>

              @if (showEmojis[show.title]) {
                <span class="show-emoji" aria-hidden="true">{{ showEmojis[show.title] }}</span>
              }

            </article>
          </div>

          <!-- BY SHOW (grouped) -->
          <div class="shows-grid" *ngIf="viewMode === 'byShow'">
            <article #cardRef
                     *ngFor="let group of groupedShows; let idx = index"
                     class="show-card"
                     [ngClass]="group.type"
                     [style.border-left-color]="showColors[group.title]"
                     [style.background]="'linear-gradient(135deg, ' + showColors[group.title] + '15, ' + showColors[group.title] + '08)'">

              <div class="show-card-top">
                <div class="badge-group">
                  <span class="pill pill-main" *ngIf="group.section">
                    {{ group.section }}
                  </span>
                  <span class="pill pill-subtle" *ngIf="showDurations[group.title]">
                    {{ showDurations[group.title] }}分
                  </span>
                </div>
                <span class="times-count">{{ group.times.length }}回</span>
              </div>

              <h3 class="show-title">{{ group.title }}</h3>

              <p class="show-description" *ngIf="group.description">
                {{ group.description }}
              </p>

              <div class="times-grid">
                <span *ngFor="let t of group.times" class="time-chip">{{ t }}</span>
              </div>

              @if (showEmojis[group.title]) {
                <span class="show-emoji" aria-hidden="true">{{ showEmojis[group.title] }}</span>
              }

            </article>
          </div>
        </section>

        <!-- CLOSED FACILITIES SECTION -->
        <section *ngIf="!loading && !error && closuresForSelectedDate.length > 0" class="closures-section" id="closures-section">
          <div class="closures-header">
            <mat-icon>block</mat-icon>
            <div class="closures-header-text">
              <h2>休止施設</h2>
              <span class="closures-date">{{ selectedDate | date:'yyyy年MM月dd日' }}（{{ getJapaneseDayOfWeek(selectedDate) }}）</span>
            </div>
          </div>
          <div class="closures-grid">
            <div *ngFor="let closure of closuresForSelectedDate; let idx = index"
                 class="closure-card"
                 [style.animation-delay]="(idx * 40) + 'ms'">
              <mat-icon class="closure-icon">close</mat-icon>
              <span class="closure-text">{{ closure }}</span>
            </div>
          </div>
        </section>

        <!-- REFRESH BUTTON -->
        <footer class="refresh-shell">
          <button mat-flat-button color="primary"
                  class="refresh-btn"
                  (click)="refreshShows()"
                  [disabled]="loading">
            <mat-icon [ngClass]="{'spinning': loading}">refresh</mat-icon>
            最新スケジュール取得
          </button>
        </footer>

      </div>
    </div>
  `,
  styles: [`
    @import '../../../styles/design-tokens';

    :host {
      display: block;
      background:
        radial-gradient(circle at top left, rgba(255, 204, 128, 0.3), transparent 55%),
        radial-gradient(circle at bottom right, rgba(179, 157, 219, 0.25), transparent 55%),
        #f3f4fb;
      min-height: 100vh;
      color: #1f2933;
    }

    .page-shell {
      display: flex;
      justify-content: center;
      padding: var(--space-4);
    }

    .page-container {
      width: 100%;
      max-width: 960px;
      border-radius: 24px;
      background:
        radial-gradient(circle at 8% 0, rgba(255, 255, 255, 0.85), transparent 55%),
        rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(12px);
      box-shadow:
        0 18px 40px rgba(15, 23, 42, 0.16),
        0 0 0 1px rgba(148, 163, 184, 0.22);
      padding: var(--space-4);
      padding-bottom: 120px;
      box-sizing: border-box;
    }

    @media (max-width: 768px) {
      .page-shell {
        padding: var(--space-2);
      }
      .page-container {
        padding: var(--space-3);
        border-radius: 18px;
        box-shadow:
          0 10px 30px rgba(15, 23, 42, 0.18),
          0 0 0 1px rgba(148, 163, 184, 0.2);
      }
    }

    /* NOTICE BOX */

    .notice-box {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
      padding: var(--space-3);
      background: linear-gradient(135deg, #fef3c7, #fde68a);
      border: 2px solid #f59e0b;
      border-radius: 18px;
      margin-bottom: var(--space-4);
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2);
    }

    .notice-icon {
      color: #f59e0b;
      font-size: 24px;
      width: 24px;
      height: 24px;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .notice-text {
      flex: 1;
      font-size: 0.9rem;
      color: #92400e;
      font-weight: 500;
      line-height: 1.5;
    }

    /* HEADER */

    .shows-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }

    .title {
      font-family: var(--font-family-heading);
      font-size: clamp(1.7rem, 2.4vw, 2.2rem);
      font-weight: 800;
      letter-spacing: 0.01em;
      margin: 0 0 var(--space-1);
      color: #111827;
    }

    .subtitle {
      margin: 0;
      font-size: 0.9rem;
      color: #6b7280;
      max-width: 32rem;
    }

    .header-meta {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px;
      border-radius: 999px;
      background: #e0f2fe;
      color: #0369a1;
      font-size: 0.75rem;
      font-weight: 500;
      white-space: nowrap;
      border: 1px solid #7dd3fc;
    }

    .header-meta mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    @media (max-width: 640px) {
      .shows-header {
        flex-direction: column;
        align-items: flex-start;
      }
      .header-meta {
        margin-top: var(--space-2);
      }
    }

    /* NAVIGATION BUTTONS */

    .nav-buttons {
      display: flex;
      gap: var(--space-2);
      margin-bottom: var(--space-4);
      flex-wrap: wrap;
    }

    .nav-btn {
      flex: 1;
      min-width: 140px;
      height: 48px;
      border-radius: 999px;
      font-family: var(--font-family-heading);
      font-weight: 600;
      font-size: 0.9rem;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      justify-content: center;
      transition: transform var(--transition-fast), box-shadow var(--transition-fast);
    }

    .nav-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
    }

    .nav-btn mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    @media (max-width: 640px) {
      .nav-buttons {
        flex-direction: column;
      }
      .nav-btn {
        width: 100%;
      }
    }

    /* CONTROLS */

    .controls-shell {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-bottom: var(--space-4);
    }

    .date-selector {
      display: flex;
      gap: var(--space-1);
      // overflow-x: auto;
      flex-wrap: wrap;
      padding-bottom: 4px;
      -webkit-overflow-scrolling: touch;
      scroll-snap-type: x mandatory;
    }

    .date-selector::-webkit-scrollbar {
      height: 4px;
    }

    .date-selector::-webkit-scrollbar-thumb {
      background: #cbd5f5;
      border-radius: 999px;
    }

    .date-chip {
      scroll-snap-align: start;
      min-width: 74px;
      border-radius: 999px;
      border: 1px solid #e5e7eb;
      background: linear-gradient(135deg, #ffffff, #f5f5ff);
      color: #111827;
      padding: 8px 10px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease, background 120ms ease;
      box-shadow: 0 3px 8px rgba(148, 163, 184, 0.3);
      font-family: var(--font-family-heading);
    }

    .date-chip:hover {
      transform: translateY(-1px);
      border-color: #3b82f6;
      box-shadow: 0 6px 16px rgba(148, 163, 184, 0.4);
      background: linear-gradient(135deg, #ffffff, #e5f0ff);
    }

    .date-chip.active {
      background: linear-gradient(135deg, #3b82f6, #ec4899);
      border-color: transparent;
      color: #ffffff;
      box-shadow: 0 10px 25px rgba(59, 130, 246, 0.55);
      transform: translateY(-1px);
    }

    .day-name {
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      opacity: 0.9;
    }

    .day-number {
      font-size: 1.05rem;
      font-weight: 700;
      line-height: 1;
    }

    .filters {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    mat-chip-set {
      display: flex;
      gap: var(--space-1);
      padding-bottom: 4px;
    }

    mat-chip-option {
      font-size: 0.78rem;
      font-weight: 500;
      border-radius: 999px !important;
    }

    .show-chip {
      border: 2px solid !important;
      transition: all 0.2s ease;
      font-weight: 600 !important;
    }

    .chip-emoji {
      margin-left: 6px;
      font-size: 1rem;
      line-height: 1;
      vertical-align: middle;
    }

    .chip-icon {
      margin-right: 4px;
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    /* VIEW MODE TOGGLE */

    .view-mode-toggle {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
      margin-bottom: var(--space-1);
    }

    .overlap-toggle {
      font-family: var(--font-family-heading);
      font-size: 0.85rem;
      font-weight: 600;
      color: #1f2933;
    }

    .view-mode-toggle mat-button-toggle-group {
      border-radius: 999px;
      overflow: hidden;
      box-shadow: 0 2px 6px rgba(148, 163, 184, 0.25);
    }

    .view-mode-toggle mat-button-toggle {
      font-family: var(--font-family-heading);
      font-size: 0.8rem;
      font-weight: 600;
    }

    .view-mode-toggle mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      margin-right: 4px;
      vertical-align: middle;
    }

    /* GROUPED VIEW */

    .times-count {
      padding: 2px 10px;
      border-radius: 999px;
      background: #eef2ff;
      color: #3730a3;
      border: 1px solid #c7d2fe;
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .times-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: auto;
      padding-top: var(--space-2);
      padding-right: 40px;
    }

    .time-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 56px;
      padding: 6px 10px;
      border-radius: 999px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1e3a8a;
      font-family: var(--font-family-heading);
      font-size: 0.85rem;
      font-weight: 600;
      letter-spacing: 0.02em;
    }

    /* SKELETON LOADING */

    .skeleton-group {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-2);
    }

    .skeleton-card {
      height: 120px;
      border-radius: 18px;
      background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
      background-size: 200% 100%;
      animation: skeleton-loading 1.4s ease-in-out infinite;
      opacity: 0.8;
    }

    @keyframes skeleton-loading {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* EMPTY / ERROR STATES */

    .state-card {
      margin-top: var(--space-3);
      padding: var(--space-4);
      border-radius: 20px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
    }

    .state-icon {
      font-size: 3rem;
      width: 3rem;
      height: 3rem;
    }

    .state-card h2 {
      margin: 0;
      font-size: 1.2rem;
      font-weight: 600;
      color: #111827;
    }

    .state-card p {
      margin: 0;
      font-size: 0.85rem;
      color: #6b7280;
      max-width: 28rem;
    }

    .error-card {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #b91c1c;
    }

    .error-card .state-icon {
      color: #ef4444;
    }

    .empty-card {
      background: #eff6ff;
      border: 1px dashed #bfdbfe;
      color: #1d4ed8;
    }

    .empty-card .state-icon {
      color: #3b82f6;
    }

    /* SHOWS LAYOUT */

    .shows-layout {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .day-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-1);
    }

    .day-header-label {
      text-transform: uppercase;
      font-size: 0.7rem;
      letter-spacing: 0.16em;
      color: #9ca3af;
    }

    .day-header-title {
      margin: 2px 0 0;
      font-size: 1.25rem;
      font-weight: 650;
      color: #111827;
    }

    .day-header-count {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      border: 1px solid #c4b5fd;
      color: #4c1d95;
      background: #f5f3ff;
      white-space: nowrap;
    }

    @media (max-width: 640px) {
      .day-header {
        flex-direction: column;
        align-items: flex-start;
      }
    }

    .shows-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-2);
    }

    @media (min-width: 720px) {
      .shows-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    /* SHOW CARD */

    .show-card {
      position: relative;
      display: flex;
      flex-direction: column;
      padding: var(--space-3);
      border-radius: 20px;
      min-height: 140px;
      box-shadow:
        0 12px 30px rgba(148, 163, 184, 0.35),
        0 0 0 1px rgba(229, 231, 235, 0.9);
      overflow: hidden;
      isolation: isolate;
      color: #111827;
      background: radial-gradient(circle at top left, rgba(255, 255, 255, 0.9), #f9fafb);
      // Mount state — springIn() in motion.ts animates to opacity 1 / translateY 0
      opacity: 0;
      transform: translateY(12px) scale(0.98);
      transition: transform var(--transition-fast), box-shadow var(--transition-fast);
      border-left: 6px solid;
      will-change: transform, opacity;
    }

    .show-card::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at -10% 0, rgba(255, 255, 255, 0.6), transparent 55%);
      pointer-events: none;
      z-index: -1;
    }

    .show-card:hover {
      transform: translateY(-2px) scale(1.005);
      box-shadow:
        0 16px 36px rgba(148, 163, 184, 0.45),
        0 0 0 1px rgba(209, 213, 219, 0.9);
    }

    @keyframes card-in {
      from {
        opacity: 0;
        transform: translateY(12px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    /* Dynamic color applied via inline styles based on show name */

    /* Top row */

    .show-card-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: var(--space-2);
      margin-bottom: var(--space-2);
    }

    .badge-group {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .pill {
      border-radius: 999px;
      padding: 2px 9px;
      font-size: 0.7rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
      border: 1px solid transparent;
    }

    .pill-main {
      background: #fef9c3;
      border-color: #facc15;
      color: #854d0e;
      font-weight: 600;
    }

    .pill-secondary {
      background: #eff6ff;
      border-color: #bfdbfe;
      color: #1d4ed8;
    }

    .pill-subtle {
      background: #f3f4ff;
      border-color: #e5e7eb;
      color: #6b7280;
    }

    .countdown-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #dcfce7;
      border-radius: 999px;
      padding: 2px 10px;
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #166534;
      border: 1px solid #4ade80;
    }

    .countdown-pill mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      animation: rotate-clock 6s linear infinite;
    }

    @keyframes rotate-clock {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    /* Title and description */

    .show-title {
      margin: 0 0 6px;
      font-family: var(--font-family-heading);
      font-size: 1rem;
      font-weight: 650;
      letter-spacing: 0.01em;
      line-height: 1.3;
      color: #111827;
    }

    .show-description {
      margin: 0 0 var(--space-2);
      font-size: 0.8rem;
      color: #4b5563;
      max-height: 3.6em;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Meta row */

    .show-meta-row {
      margin-top: auto;
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .meta-item {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 10px;
      border-radius: 999px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
    }

    .primary-time {
      background: #eff6ff;
      border-color: #bfdbfe;
    }

    .meta-item mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: #1f2933;
    }

    .meta-text {
      display: flex;
      flex-direction: column;
    }

    .meta-label {
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      opacity: 0.8;
      color: #6b7280;
    }

    .meta-value {
      font-size: 0.82rem;
      font-weight: 600;
      color: #111827;
    }

    /* OVERLAP WARNING */

    .overlap-warning {
      margin-top: var(--space-2);
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 10px;
      background: linear-gradient(135deg, #fff7ed, #ffedd5);
      border: 1px solid #fdba74;
      border-radius: 12px;
      color: #7c2d12;
      padding-right: 44px;
    }

    .overlap-warning mat-icon {
      color: #c2410c;
      font-size: 20px;
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      margin-top: 1px;
    }

    .overlap-warning-body {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .overlap-warning-title {
      font-family: var(--font-family-heading);
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #9a3412;
    }

    .overlap-warning-list {
      font-size: 0.78rem;
      color: #7c2d12;
      line-height: 1.4;
      word-break: break-word;
    }

    /* SHOW EMOJI INDICATOR */

    .show-emoji {
      position: absolute;
      bottom: var(--space-2);
      right: var(--space-2);
      font-size: 1.8rem;
      line-height: 1;
      pointer-events: none;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15));
      z-index: 1;
    }

    /* CLOSED FACILITIES SECTION */

    .closures-section {
      margin-top: var(--space-4);
      padding: var(--space-3);
      background: linear-gradient(135deg, #fef2f2, #fee2e2);
      border-radius: 18px;
      border: 2px solid #fca5a5;
    }

    .closures-header {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-bottom: var(--space-3);
    }

    .closures-header mat-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
      color: #dc2626;
      flex-shrink: 0;
    }

    .closures-header-text {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .closures-header h2 {
      margin: 0;
      font-family: var(--font-family-heading);
      font-size: 1.3rem;
      font-weight: 700;
      color: #991b1b;
    }

    .closures-date {
      font-size: 0.85rem;
      color: #991b1b;
      font-weight: 500;
      opacity: 0.8;
    }

    .closures-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-2);
    }

    @media (min-width: 720px) {
      .closures-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    .closure-card {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2);
      background: white;
      border-radius: 12px;
      border-left: 4px solid #dc2626;
      box-shadow: 0 2px 8px rgba(220, 38, 38, 0.1);
      animation: card-in 200ms ease-out forwards;
      opacity: 0;
      transform: translateY(8px) scale(0.99);
    }

    .closure-card:hover {
      transform: translateY(-2px) scale(1.005);
      box-shadow: 0 4px 12px rgba(220, 38, 38, 0.2);
    }

    .closure-icon {
      flex-shrink: 0;
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: #dc2626;
    }

    .closure-text {
      flex: 1;
      font-size: 0.9rem;
      color: #991b1b;
      font-weight: 500;
    }

    /* REFRESH BUTTON */

    .refresh-shell {
      position: sticky;
      bottom: calc(80px + var(--space-2));
      margin-top: var(--space-4);
      display: flex;
      justify-content: flex-end;
      pointer-events: none;
      z-index: 900;
    }

    .refresh-btn {
      pointer-events: auto;
      border-radius: 999px;
      padding-inline: var(--space-4);
      height: 48px;
      font-family: var(--font-family-heading);
      font-weight: 600;
      font-size: 0.9rem;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      box-shadow:
        0 12px 26px rgba(59, 130, 246, 0.35),
        0 0 0 1px rgba(209, 213, 219, 0.9);
      background: linear-gradient(135deg, #3b82f6, #ec4899);
      color: #ffffff !important;
      text-transform: none;
    }

    .refresh-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow:
        0 16px 32px rgba(59, 130, 246, 0.45),
        0 0 0 1px rgba(191, 219, 254, 0.9);
    }

    .refresh-btn:disabled {
      opacity: 0.7;
      box-shadow:
        0 8px 20px rgba(148, 163, 184, 0.35),
        0 0 0 1px rgba(209, 213, 219, 0.9);
    }

    .refresh-btn mat-icon.spinning {
      animation: spin-icon 0.9s linear infinite;
    }

    @keyframes spin-icon {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

  `]
})
export class ShowComponent implements OnInit, OnDestroy, AfterViewInit {
  private showsService = inject(ShowsDataService);
  private destroy$ = new Subject<void>();

  @ViewChildren('cardRef', { read: ElementRef }) cardRefs!: QueryList<ElementRef<HTMLElement>>;

  shows: ShowsByDate = {};
  filteredShows: Show[] = [];
  groupedShows: { title: string; times: string[]; section: string; description: string; type: ShowType; date: Date }[] = [];
  viewMode: 'byTime' | 'byShow' = 'byTime';
  closures: { [date: string]: string[] } = {};
  closuresForSelectedDate: string[] = [];
  next7Days: Date[] = [];
  selectedDate: Date = new Date();
  filterType: ShowType | 'all' = 'all';
  selectedShowNames: string[] = []; // Changed: track multiple selected show filters (empty = all)
  uniqueShowNames: string[] = []; // New: list of unique show names
  showColors: { [showName: string]: string } = {}; // New: color mapping for each show
  showEmojis: { [showName: string]: string } = {};
  showDurations: { [showName: string]: number } = {};
  overlapCheckEnabled = true;
  overlapWarnings: { [showId: string]: string[] } = {};

  /** Titles excluded from overlap checking */
  private readonly OVERLAP_EXCLUDED_TITLES = new Set<string>([
    '「モーメンタス」ナイトタイム・スペクタキュラー'
  ]);

  /** Buffer minutes added to duration when checking overlaps */
  private readonly OVERLAP_BUFFER_MIN = 15;
  loading = false;
  error: string | null = null;
  lastUpdated: Date | null = null;
  noticeText: string = '';

  ngOnInit(): void {
    this.initializeDateSelector();
    this.loadShows();
    this.loadNotice();
    this.loadShowEmojis();
  }

  ngAfterViewInit(): void {
    this.animateCards();
    this.cardRefs.changes
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.animateCards());
  }

  private animateCards(): void {
    if (!this.cardRefs) return;
    this.cardRefs.forEach((ref, idx) => {
      springIn(ref.nativeElement, idx * 40);
    });
  }

  loadShowEmojis(): void {
    this.showsService.getShowLogos()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.showEmojis = data.emojis;
          this.showDurations = data.durations;
          this.recomputeOverlapWarnings();
        },
        error: (error) => { console.error('Error loading show emojis:', error); }
      });
  }

  loadNotice(): void {
    this.showsService.getNotices().subscribe({
      next: (notices) => {
        this.noticeText = notices.shows;
      },
      error: (error) => {
        console.error('Error loading shows notice:', error);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeDateSelector(): void {
    this.next7Days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Start from tomorrow (skip today)
    for (let i = 1; i < 8; i++) {
      const date = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
      this.next7Days.push(date);
    }

    this.selectedDate = this.next7Days[0];
  }

  getJapaneseDayOfWeek(date: Date): string {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[date.getDay()];
  }

  scrollToSchedule(): void {
    const element = document.getElementById('schedule-section');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  scrollToClosures(): void {
    const element = document.getElementById('closures-section');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  extractUniqueShowNames(): void {
    const namesSet = new Set<string>();
    Object.values(this.shows).forEach(showArray => {
      showArray.forEach(show => {
        namesSet.add(show.title);
      });
    });
    this.uniqueShowNames = Array.from(namesSet).sort();
  }

  assignShowColors(): void {
    const colors = [
      '#3b82f6', // blue
      '#ef4444', // red
      '#10b981', // green
      '#f59e0b', // amber
      '#8b5cf6', // purple
      '#ec4899', // pink
      '#06b6d4', // cyan
      '#f97316', // orange
      '#84cc16', // lime
      '#6366f1', // indigo
      '#14b8a6', // teal
      '#f43f5e'  // rose
    ];

    this.uniqueShowNames.forEach((showName, index) => {
      // Check if color already assigned (for persistence across refreshes)
      if (!this.showColors[showName]) {
        // Use color from palette, cycling if needed
        this.showColors[showName] = colors[index % colors.length];
      }
    });
  }

  loadShows(): void {
    this.loading = true;
    this.error = null;

    this.showsService.getShows()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (shows: ShowsByDate) => {
          this.shows = shows;
          this.lastUpdated = new Date();
          this.extractUniqueShowNames();
          this.assignShowColors();
          this.filterShowsByDateAndType();
          this.loadClosures();
          this.loading = false;
        },
        error: (error: unknown) => {
          this.error = error instanceof Error ? error.message : String(error);
          this.loading = false;
          console.error('Error loading shows:', error);
        }
      });
  }

  loadClosures(): void {
    this.showsService.getClosures()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (closures: { [date: string]: string[] }) => {
          this.closures = closures;
          this.updateClosuresForSelectedDate();
        },
        error: (error: unknown) => {
          console.error('Error loading closures:', error);
        }
      });
  }

  refreshShows(): void {
    this.loading = true;
    this.error = null;

    this.showsService.refreshShows()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (shows: ShowsByDate) => {
          this.shows = shows;
          this.lastUpdated = new Date();
          this.extractUniqueShowNames();
          this.assignShowColors();
          this.filterShowsByDateAndType();
          this.loading = false;
        },
        error: (error: unknown) => {
          this.error = error instanceof Error ? error.message : String(error);
          this.loading = false;
          console.error('Error refreshing shows:', error);
        }
      });
  }

  selectDate(date: Date): void {
    this.selectedDate = date;
    this.filterShowsByDateAndType();
    this.updateClosuresForSelectedDate();
  }

  updateClosuresForSelectedDate(): void {
    const dateKey = this.formatDateKey(this.selectedDate);
    this.closuresForSelectedDate = this.closures[dateKey] || [];
  }

  setFilter(type: ShowType | 'all'): void {
    this.filterType = type;
    this.filterShowsByDateAndType();
  }

  setShowFilter(showName: string): void {
    if (showName === 'all') {
      // Clear all selections (show all)
      this.selectedShowNames = [];
    } else {
      // Toggle show selection
      const index = this.selectedShowNames.indexOf(showName);
      if (index > -1) {
        // Remove if already selected
        this.selectedShowNames.splice(index, 1);
      } else {
        // Add if not selected
        this.selectedShowNames.push(showName);
      }
    }
    this.filterShowsByDateAndType();
  }

  isShowSelected(showName: string): boolean {
    return this.selectedShowNames.includes(showName);
  }

  setViewMode(mode: 'byTime' | 'byShow'): void {
    if (!mode) return;
    this.viewMode = mode;
  }

  toggleOverlapCheck(checked: boolean): void {
    this.overlapCheckEnabled = checked;
    this.recomputeOverlapWarnings();
  }

  onChipTap(event: Event): void {
    const el = event.currentTarget as Element | null;
    if (el) pressPop(el);
  }

  private timeToMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return -1;
    return h * 60 + m;
  }

  private recomputeOverlapWarnings(): void {
    this.overlapWarnings = {};
    if (!this.overlapCheckEnabled) return;

    // Only consider shows that have a duration AND are not in the excluded set.
    const windows = this.filteredShows
      .filter(s => !this.OVERLAP_EXCLUDED_TITLES.has(s.title))
      .map(s => {
        const dur = this.showDurations[s.title];
        if (!dur) return null;
        const start = this.timeToMinutes(s.time);
        if (start < 0) return null;
        return { show: s, start, end: start + dur + this.OVERLAP_BUFFER_MIN };
      })
      .filter((w): w is { show: Show; start: number; end: number } => w !== null);

    for (let i = 0; i < windows.length; i++) {
      const a = windows[i];
      for (let j = 0; j < windows.length; j++) {
        if (i === j) continue;
        const b = windows[j];
        // Same show at another time isn't a "conflict" for the user
        if (a.show.title === b.show.title) continue;
        // Half-open overlap: [a.start, a.end) intersects [b.start, b.end)
        if (a.start < b.end && b.start < a.end) {
          if (!this.overlapWarnings[a.show.id]) this.overlapWarnings[a.show.id] = [];
          this.overlapWarnings[a.show.id].push(`${b.show.title} ${b.show.time}`);
        }
      }
    }
  }

  private filterShowsByDateAndType(): void {
    const dateKey = this.formatDateKey(this.selectedDate);
    let showsForDay: Show[] = this.shows[dateKey] || [];

    // Filter by show names if any are selected (empty array = show all)
    if (this.selectedShowNames.length > 0) {
      showsForDay = showsForDay.filter((show: Show) => this.selectedShowNames.includes(show.title));
    }

    showsForDay.sort((a: Show, b: Show) => a.time.localeCompare(b.time));
    this.filteredShows = showsForDay;

    // Build grouped view: one entry per unique title, listing all its times sorted.
    const groups = new Map<string, { title: string; times: string[]; section: string; description: string; type: ShowType; date: Date }>();
    showsForDay.forEach(show => {
      const existing = groups.get(show.title);
      if (existing) {
        existing.times.push(show.time);
      } else {
        groups.set(show.title, {
          title: show.title,
          times: [show.time],
          section: show.section,
          description: show.description,
          type: show.type,
          date: show.date
        });
      }
    });
    this.groupedShows = Array.from(groups.values()).map(g => ({
      ...g,
      times: g.times.slice().sort((a, b) => a.localeCompare(b))
    }));

    this.recomputeOverlapWarnings();
  }

  private formatDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  isSameDay(date1: Date, date2: Date): boolean {
    return date1.toDateString() === date2.toDateString();
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return this.isSameDay(today, date);
  }

  getCountdown(show: Show): string | null {
    const now = new Date();
    const showDate = new Date(show.date);
    const [hours, minutes] = show.time.split(':').map(Number);
    showDate.setHours(hours, minutes, 0, 0);

    const diff = showDate.getTime() - now.getTime();
    const diffHours = diff / (1000 * 60 * 60);

    if (diffHours > 3 || diffHours < 0) {
      return null;
    }

    const mins = Math.floor(diff / (1000 * 60));
    const h = Math.floor(mins / 60);

    if (h > 0) {
      return `開演まで${h}:${String(mins % 60).padStart(2, '0')}`;
    }
    return `開演まで${mins}分`;
  }

  getTimeAgo(date: Date): string {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'たった今';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}時間前`;
    const days = Math.floor(hours / 24);
    return `${days}日前`;
  }
}