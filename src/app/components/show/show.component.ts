import { Component, OnInit, OnDestroy, inject, ElementRef, ViewChildren, QueryList, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ShowsDataService } from '../../services/shows-data.service';
import { Show, ShowsByDate, ShowType } from '../../models/show.model';
import { pressPop, springIn } from '../../utils/motion';

@Component({
  selector: 'app-show',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatButtonModule, MatChipsModule, MatButtonToggleModule],
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
          <!-- Date Selector (hidden in "週間スケジュール表" mode; the table spans all 7 days) -->
          <div class="date-selector" *ngIf="next7Days.length > 0 && viewMode !== 'byTable'">
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
              <mat-button-toggle value="byTable">
                <mat-icon>grid_on</mat-icon>
                <span>表で見る</span>
              </mat-button-toggle>
            </mat-button-toggle-group>
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

        <!-- EMPTY STATE (byTime / byShow only — table mode handles its own "no data") -->
        <section *ngIf="!loading && !error && viewMode !== 'byTable' && filteredShows.length === 0 && next7Days.length > 0"
                 class="state-card empty-card">
          <mat-icon class="state-icon">event_busy</mat-icon>
          <h2>ショースケジュールなし</h2>
          <p>時間を置いて再アクセスしてください。</p>
        </section>

        <!-- SHOWS LIST -->
        <section *ngIf="!loading && !error && (viewMode === 'byTable' || filteredShows.length > 0)" class="shows-layout">
          <!-- Sticky date header for context (per-day modes only) -->
          <div class="day-header" *ngIf="viewMode !== 'byTable'">
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

          <!-- Table-mode date range header -->
          <div class="day-header day-header-range" *ngIf="viewMode === 'byTable' && tableHeaderDays.length === 7">
            <div>
              <span class="day-header-label">週間ショー</span>
              <h2 class="day-header-title">
                {{ tableHeaderDays[0].date | date:'yyyy年MM月dd日' }}
                 〜 {{ tableHeaderDays[6].date | date:'MM月dd日' }}
              </h2>
            </div>
            <span class="day-header-count">{{ tableRows.length }}演目</span>
          </div>

          <!-- BY TIME (planner style) -->
          <div class="planner" *ngIf="viewMode === 'byTime'">
            <!-- Hour rail -->
            <div class="planner-rail">
              <div *ngFor="let h of plannerHourLabels" class="planner-hour" [style.top.px]="h.top">
                <span class="planner-hour-label">{{ h.label }}</span>
                <div class="planner-hour-line"></div>
              </div>
            </div>

            <!-- Events area: singletons span full width; overlapping clusters are
                 their own horizontally-scrollable "carousel" so only the affected
                 time band moves to reveal more shows. -->
            <div class="planner-events" [style.height.px]="plannerHeightPx">
              <!-- Non-overlapping events (full width, no scroll) -->
              <article #cardRef
                       *ngFor="let ev of plannerEvents"
                       class="show-card planner-event"
                       [class.is-short]="ev.short"
                       [ngClass]="ev.show.type"
                       [style.top.px]="ev.top"
                       [style.height.px]="ev.height"
                       [style.left]="ev.left"
                       [style.width]="ev.width"
                       [style.border-left-color]="showColors[ev.show.title]"
                       [style.background]="'linear-gradient(135deg, ' + showColors[ev.show.title] + '15, ' + showColors[ev.show.title] + '08)'">
                <div class="planner-event-head">
                  <span class="planner-event-time">{{ ev.show.time }}</span>
                  @if (showDurations[ev.show.title]) {
                    <span class="planner-event-duration">{{ showDurations[ev.show.title] }}分</span>
                  }
                </div>
                <div class="planner-event-title">{{ ev.show.title }}</div>
                @if (showEmojis[ev.show.title]) {
                  <span class="show-emoji" aria-hidden="true">{{ showEmojis[ev.show.title] }}</span>
                }
              </article>

              <!-- Overlap clusters: horizontally scrollable with an arrow hint -->
              <div *ngFor="let cluster of plannerClusters; let ci = index"
                   class="planner-cluster"
                   [class.at-end]="cluster.atEnd"
                   [style.top.px]="cluster.top"
                   [style.height.px]="cluster.height">
                <div class="planner-cluster-scroll"
                     (scroll)="onClusterScroll($event, ci)">
                  <div class="planner-cluster-inner"
                       [style.width.%]="cluster.innerWidthPct">
                    <article #cardRef
                             *ngFor="let ev of cluster.events"
                             class="show-card planner-event"
                             [class.is-short]="ev.short"
                             [ngClass]="ev.show.type"
                             [style.top.px]="ev.top"
                             [style.height.px]="ev.height"
                             [style.left]="ev.left"
                             [style.width]="ev.width"
                             [style.border-left-color]="showColors[ev.show.title]"
                             [style.background]="'linear-gradient(135deg, ' + showColors[ev.show.title] + '15, ' + showColors[ev.show.title] + '08)'">
                      <div class="planner-event-head">
                        <span class="planner-event-time">{{ ev.show.time }}</span>
                        @if (showDurations[ev.show.title]) {
                          <span class="planner-event-duration">{{ showDurations[ev.show.title] }}分</span>
                        }
                      </div>
                      <div class="planner-event-title">{{ ev.show.title }}</div>
                      @if (showEmojis[ev.show.title]) {
                        <span class="show-emoji" aria-hidden="true">{{ showEmojis[ev.show.title] }}</span>
                      }
                    </article>
                  </div>
                </div>
                <!-- Scroll-right indicator: fades out when the cluster is scrolled to its end -->
                <div class="planner-cluster-arrow" aria-hidden="true">
                  <mat-icon>chevron_right</mat-icon>
                </div>
              </div>
            </div>
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

          <!-- BY TABLE (weekly matrix) -->
          <div class="table-view" *ngIf="viewMode === 'byTable'">
            <!-- Empty state: no shows across any of the 7 days -->
            <div *ngIf="tableRows.length === 0" class="state-card empty-card">
              <mat-icon class="state-icon">event_busy</mat-icon>
              <h2>ショースケジュールなし</h2>
              <p>来週の公演スケジュールはまだ公開されていません。</p>
            </div>

            <div *ngIf="tableRows.length > 0" class="table-scroll">
              <table class="schedule-matrix" role="table" aria-label="週間ショースケジュール">
                <thead>
                  <tr>
                    <th class="col-show-name" scope="col">
                      <div class="col-show-title">公演プログラム</div>
                      <div class="col-show-sub">(下段: パーク運営時間)</div>
                    </th>
                    <th *ngFor="let day of tableHeaderDays"
                        class="col-day"
                        [class.sat]="day.isSat"
                        [class.sun]="day.isSun"
                        scope="col">
                      <span class="th-date">{{ day.dateShort }}({{ day.dayName }})</span>
                      <span class="th-hours">{{ day.parkHours || '--:--' }}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let row of tableRows">
                    <th class="cell-show-name"
                        scope="row"
                        [style.border-left-color]="row.color">
                      <span class="show-title-text" [style.color]="row.color">
                        {{ row.title }}
                        <span class="show-emoji-inline" *ngIf="showEmojis[row.title]" aria-hidden="true">
                          {{ showEmojis[row.title] }}
                        </span>
                        <span class="show-title-duration" *ngIf="row.duration">
                          (所要時間 {{ row.duration }}分)
                        </span>
                      </span>
                    </th>
                    <td *ngFor="let times of row.cells; let ci = index"
                        class="cell-time"
                        [class.has-time]="times.length > 0"
                        [class.sat]="tableHeaderDays[ci]?.isSat"
                        [class.sun]="tableHeaderDays[ci]?.isSun">
                      <ng-container *ngIf="times.length > 0; else emptyCell">
                        <span *ngFor="let t of times" class="time-block">{{ t }}</span>
                      </ng-container>
                      <ng-template #emptyCell>-</ng-template>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Weekly closure footer -->
            <div class="table-closures" *ngIf="tableClosures.length > 0">
              <div class="table-closures-title">
                <mat-icon>block</mat-icon>
                <span>休止中アトラクション</span>
              </div>
              <div class="table-closures-list">
                <span *ngFor="let closure of tableClosures" class="closure-item">
                  <mat-icon class="closure-item-icon">warning_amber</mat-icon>
                  {{ closure }}
                </span>
              </div>
            </div>
            <div class="table-closures no-closures" *ngIf="tableClosures.length === 0">
              <mat-icon>check_circle</mat-icon>
              <span>期間中、休止予定なし</span>
            </div>
          </div>
        </section>

        <!-- CLOSED FACILITIES SECTION (hidden in table mode — closures are shown in the table footer) -->
        <section *ngIf="!loading && !error && viewMode !== 'byTable' && closuresForSelectedDate.length > 0" class="closures-section" id="closures-section">
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
      padding: 1px 8px;
      border-radius: 999px;
      background: #eef2ff;
      color: #3730a3;
      border: 1px solid #c7d2fe;
      font-size: 0.62rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .times-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: auto;
      padding-top: 6px;
      padding-right: 30px;
    }

    .time-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 46px;
      padding: 3px 8px;
      border-radius: 999px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1e3a8a;
      font-family: var(--font-family-heading);
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.01em;
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
      gap: 8px;
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
      padding: var(--space-2);
      border-radius: 14px;
      min-height: 96px;
      box-shadow:
        0 6px 18px rgba(148, 163, 184, 0.28),
        0 0 0 1px rgba(229, 231, 235, 0.9);
      overflow: hidden;
      isolation: isolate;
      color: #111827;
      background: radial-gradient(circle at top left, rgba(255, 255, 255, 0.9), #f9fafb);
      // Visible by default; springIn() (if present) reseeds the mount state at runtime.
      // Not relying on CSS-hidden state means Motion One failures never leave cards invisible.
      opacity: 1;
      transition: transform var(--transition-fast), box-shadow var(--transition-fast);
      border-left: 4px solid;
      will-change: transform;
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
      gap: var(--space-1);
      margin-bottom: 6px;
    }

    .badge-group {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .pill {
      border-radius: 999px;
      padding: 1px 7px;
      font-size: 0.62rem;
      letter-spacing: 0.03em;
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
      margin: 0 0 4px;
      font-family: var(--font-family-heading);
      font-size: 0.85rem;
      font-weight: 650;
      letter-spacing: 0.005em;
      line-height: 1.25;
      color: #111827;
    }

    .show-description {
      margin: 0 0 6px;
      font-size: 0.72rem;
      color: #4b5563;
      max-height: 2.6em;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    /* Meta row */

    .show-meta-row {
      margin-top: auto;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .meta-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 999px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
    }

    .primary-time {
      background: #eff6ff;
      border-color: #bfdbfe;
    }

    .meta-item mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: #1f2933;
    }

    .meta-text {
      display: flex;
      flex-direction: column;
    }

    .meta-label {
      font-size: 0.58rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      opacity: 0.8;
      color: #6b7280;
    }

    .meta-value {
      font-size: 0.74rem;
      font-weight: 600;
      color: #111827;
    }

    /* PLANNER VIEW (時刻順) */

    .planner {
      position: relative;
      display: grid;
      grid-template-columns: 44px 1fr;
      gap: 6px;
      margin-top: var(--space-1);
    }

    .planner-rail {
      position: relative;
    }

    .planner-hour {
      position: absolute;
      left: 0;
      right: 0;
      display: flex;
      align-items: flex-start;
      gap: 4px;
      transform: translateY(-0.55em);
      pointer-events: none;
    }

    .planner-hour-label {
      font-family: var(--font-family-heading);
      font-size: 0.65rem;
      font-weight: 600;
      color: #6b7280;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }

    .planner-hour-line {
      position: absolute;
      top: 0.55em;
      left: 44px;   /* aligned with the events column */
      right: -6px;
      height: 1px;
      background: repeating-linear-gradient(to right, rgba(148,163,184,0.35) 0 6px, transparent 6px 12px);
    }

    .planner-events {
      position: relative;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.35);
      /* height set inline by the component */
    }

    /* Each overlap group becomes its own horizontally-scrollable band.
       Only the affected time range moves when the user scrolls — the rest
       of the schedule stays put. */
    .planner-cluster {
      position: absolute;
      left: 0;
      right: 0;
    }

    .planner-cluster-scroll {
      position: relative;
      width: 100%;
      height: 100%;
      overflow-x: auto;
      overflow-y: visible;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: thin;
      scroll-snap-type: x proximity;
    }

    .planner-cluster-scroll::-webkit-scrollbar { height: 4px; }
    .planner-cluster-scroll::-webkit-scrollbar-thumb {
      background: rgba(148, 163, 184, 0.45);
      border-radius: 4px;
    }

    .planner-cluster-inner {
      position: relative;
      height: 100%;
      /* width set inline (>100% to force horizontal scrolling) */
    }

    .planner-cluster-inner > .planner-event {
      scroll-snap-align: start;
    }

    /* Right-pointing arrow that hints the band is scrollable. Sits above the
       cluster's right edge and gently pulses; fades out at the end of scroll. */
    .planner-cluster-arrow {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: 36px;
      pointer-events: none;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 2px;
      background: linear-gradient(
        to right,
        rgba(255, 255, 255, 0) 0%,
        rgba(255, 255, 255, 0.85) 70%,
        rgba(255, 255, 255, 0.95) 100%
      );
      border-radius: 0 12px 12px 0;
      opacity: 1;
      transition: opacity var(--transition-fast, 180ms) ease;
    }

    .planner-cluster.at-end .planner-cluster-arrow {
      opacity: 0;
    }

    .planner-cluster-arrow mat-icon {
      font-size: 22px;
      width: 22px;
      height: 22px;
      color: var(--color-primary, #690e7f);
      filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.18));
      animation: planner-arrow-nudge 1.4s ease-in-out infinite;
    }

    @keyframes planner-arrow-nudge {
      0%, 100% { transform: translateX(0); opacity: 0.85; }
      50%      { transform: translateX(4px); opacity: 1; }
    }

    @media (prefers-reduced-motion: reduce) {
      .planner-cluster-arrow mat-icon { animation: none; }
    }

    .planner-event {
      position: absolute;
      padding: 6px 8px;
      min-height: 0;                 /* override default show-card min-height */
      box-shadow: 0 4px 12px rgba(148, 163, 184, 0.28), 0 0 0 1px rgba(229, 231, 235, 0.9);
      border-left-width: 4px;
    }

    .planner-event-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
      font-family: var(--font-family-heading);
      font-size: 0.68rem;
      font-weight: 600;
      color: #4b5563;
      margin-bottom: 2px;
    }

    .planner-event-time {
      color: #111827;
      font-weight: 700;
    }

    .planner-event-duration {
      color: #6b7280;
      letter-spacing: 0.02em;
    }

    .planner-event-title {
      font-family: var(--font-family-heading);
      font-size: 0.78rem;
      font-weight: 600;
      color: #111827;
      line-height: 1.25;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      padding-right: 22px;   /* leave room for the corner emoji */
    }

    /* Slim the corner emoji on planner boxes so short shows still fit */
    .planner-event .show-emoji {
      font-size: 1.1rem;
      bottom: 4px;
      right: 6px;
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.15));
    }

    /* Short events (≤ 15 min): the duration slot is too narrow for the title,
       so let the title "bulge" out below the actual box as a floating callout. */
    .planner-event.is-short {
      overflow: visible;   /* allow the title bulge to escape the box height */
      padding-bottom: 4px;
      z-index: 2;
    }

    .planner-event.is-short .planner-event-title {
      position: absolute;
      left: -2px;
      top: 100%;
      max-width: calc(100% + 4px);
      margin-top: 3px;
      padding: 3px 8px 3px 10px;
      background: #fff;
      border-left: 3px solid;
      border-left-color: inherit;
      border-radius: 0 8px 8px 4px;
      box-shadow: 0 4px 10px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(229, 231, 235, 0.85);
      font-size: 0.72rem;
      line-height: 1.2;
      -webkit-line-clamp: 2;
      padding-right: 22px;
      z-index: 3;
    }

    /* Move the emoji into the bulge so it stays visually attached to the title */
    .planner-event.is-short .show-emoji {
      top: 100%;
      bottom: auto;
      right: 4px;
      margin-top: 6px;
      font-size: 0.95rem;
    }

    /* SHOW EMOJI INDICATOR */

    .show-emoji {
      position: absolute;
      bottom: 6px;
      right: 8px;
      font-size: 1.35rem;
      line-height: 1;
      pointer-events: none;
      filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.15));
      z-index: 1;
    }

    /* TABLE VIEW (表で見る) — weekly matrix inspired by the Apps Script dashboard. */

    .table-view {
      margin-top: var(--space-2);
    }

    .day-header-range .day-header-title {
      white-space: normal;
    }

    .table-scroll {
      /* On narrow screens, allow a single horizontal scroll of the whole
         matrix rather than squeezing 8 columns into 320 px. */
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      padding: 2px;
      border-radius: 18px;
      background:
        radial-gradient(circle at 10% 12%, rgba(255, 246, 199, 0.55), transparent 50%),
        radial-gradient(circle at 90% 85%, rgba(184, 163, 255, 0.35), transparent 55%),
        linear-gradient(180deg, #f7f0ff 0%, #edf5ff 55%, #fff6df 100%);
      box-shadow:
        0 10px 30px rgba(15, 23, 42, 0.14),
        inset 0 0 0 1px rgba(122, 81, 190, 0.22);
    }

    .schedule-matrix {
      width: 100%;
      min-width: 720px;        /* keeps columns readable; parent scrolls */
      border-collapse: separate;
      border-spacing: 5px;
      table-layout: fixed;
    }

    .schedule-matrix th,
    .schedule-matrix td {
      vertical-align: middle;
      box-sizing: border-box;
    }

    .schedule-matrix th.col-show-name {
      width: 26%;
      padding: 8px 6px;
      border-radius: 10px;
      background: linear-gradient(180deg, #ffffff 0%, #eee7ff 100%);
      border: 1px solid rgba(146, 106, 205, 0.27);
      box-shadow:
        0 3px 8px rgba(57, 39, 107, 0.1),
        inset 0 1px 0 rgba(255, 255, 255, 0.9);
      text-align: center;
    }

    .col-show-title {
      font-size: 0.78rem;
      font-weight: 700;
      color: #4b347e;
      margin-bottom: 2px;
    }

    .col-show-sub {
      font-size: 0.6rem;
      color: #b8792b;
      font-weight: 500;
    }

    .schedule-matrix th.col-day {
      width: 10.5%;
      padding: 8px 2px;
      border-radius: 10px;
      border: 1px solid rgba(146, 106, 205, 0.27);
      background: linear-gradient(180deg, #ffffff 0%, #eee7ff 100%);
      box-shadow:
        0 3px 8px rgba(57, 39, 107, 0.1),
        inset 0 1px 0 rgba(255, 255, 255, 0.9);
      text-align: center;
    }

    .schedule-matrix th.col-day.sat {
      border-color: rgba(84, 164, 221, 0.44);
      background: linear-gradient(180deg, #f7fcff 0%, #dff3ff 100%);
    }

    .schedule-matrix th.col-day.sat .th-date {
      color: #2478b9;
    }

    .schedule-matrix th.col-day.sun {
      border-color: rgba(224, 112, 153, 0.42);
      background: linear-gradient(180deg, #fffafd 0%, #ffe5ef 100%);
    }

    .schedule-matrix th.col-day.sun .th-date {
      color: #bd477d;
    }

    .th-date {
      display: block;
      font-size: 0.78rem;
      font-weight: 700;
      color: #4b347e;
    }

    .th-hours {
      display: block;
      margin-top: 2px;
      font-size: 0.62rem;
      font-weight: 700;
      color: #b8792b;
      letter-spacing: 0.02em;
    }

    .schedule-matrix .cell-show-name {
      height: 80px;
      padding: 6px 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.95);
      border-right: 1px solid rgba(111, 75, 175, 0.16);
      border-bottom: 1px solid rgba(111, 75, 175, 0.16);
      border-left: 5px solid #6c5ce7;
      border-radius: 10px;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(252, 249, 255, 0.92) 100%);
      box-shadow:
        0 4px 9px rgba(51, 34, 96, 0.1),
        inset 0 1px 0 rgba(255, 255, 255, 0.92);
      text-align: center;
      font-weight: 700;
    }

    .show-title-text {
      display: inline-block;
      width: 100%;
      font-size: 0.78rem;
      font-weight: 800;
      line-height: 1.3;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    .show-emoji-inline {
      margin-left: 2px;
      font-weight: normal;
    }

    .show-title-duration {
      display: block;
      margin-top: 2px;
      font-size: 0.62rem;
      font-weight: 500;
      color: #6b7280;
      opacity: 0.9;
    }

    .schedule-matrix .cell-time {
      height: 80px;
      padding: 4px 2px;
      border: 1px dashed rgba(103, 74, 159, 0.18);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.34);
      color: #a49bb5;
      font-size: 0.78rem;
      font-weight: 700;
      text-align: center;
    }

    .schedule-matrix .cell-time.has-time {
      color: #413263;
      border: 1px solid rgba(141, 102, 202, 0.22);
      background: linear-gradient(180deg, #ffffff 0%, #f8f4ff 100%);
      box-shadow:
        0 3px 7px rgba(52, 34, 98, 0.09),
        inset 0 1px 0 rgba(255, 255, 255, 0.95);
    }

    .schedule-matrix .cell-time.sat.has-time {
      background: linear-gradient(180deg, #ffffff 0%, #eaf5ff 100%);
    }

    .schedule-matrix .cell-time.sun.has-time {
      background: linear-gradient(180deg, #ffffff 0%, #ffeef5 100%);
    }

    .time-block {
      display: block;
      line-height: 1.3;
    }

    /* Closure footer (table mode) */

    .table-closures {
      margin-top: var(--space-3);
      padding: 12px 16px;
      border: 1px solid rgba(215, 161, 72, 0.5);
      border-radius: 14px;
      background: linear-gradient(135deg, rgba(255, 253, 244, 0.97) 0%, rgba(255, 244, 216, 0.95) 100%);
      box-shadow:
        0 4px 11px rgba(92, 59, 131, 0.11),
        inset 0 1px 0 rgba(255, 255, 255, 0.9);
    }

    .table-closures-title {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
      color: #a85a68;
      font-size: 0.9rem;
      font-weight: 700;
    }

    .table-closures-title mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .table-closures-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 10px;
    }

    .closure-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border: 1px solid rgba(224, 141, 157, 0.35);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.85);
      color: #584866;
      font-size: 0.78rem;
      font-weight: 600;
      box-shadow: 0 1px 3px rgba(110, 68, 97, 0.06);
    }

    .closure-item-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: #d97706;
    }

    .table-closures.no-closures {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #4b7f5a;
    }

    .table-closures.no-closures mat-icon {
      color: #16a34a;
      font-size: 18px;
      width: 18px;
      height: 18px;
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
      bottom: calc(64px + var(--space-2));
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

    /* MOBILE COMPACT (≤ 640px) */
    @media (max-width: 640px) {
      .page-shell { padding: 6px; }
      .page-container {
        padding: 10px;
        padding-bottom: 96px;
        border-radius: 14px;
      }

      // Header
      .shows-header { margin-bottom: var(--space-2); gap: 6px; }
      .title { font-size: 1.15rem; margin-bottom: 2px; }
      .subtitle { font-size: 0.72rem; }
      .header-meta { padding: 3px 8px; font-size: 0.65rem; }
      .header-meta mat-icon { font-size: 12px; width: 12px; height: 12px; }

      // Nav buttons (ショースケジュール / 休止施設 shortcuts)
      .nav-buttons { gap: 6px; margin-bottom: var(--space-2); }
      .nav-btn { min-width: 0; height: 36px; font-size: 0.78rem; gap: 4px; }
      .nav-btn mat-icon { font-size: 16px; width: 16px; height: 16px; }

      // Controls area
      .controls-shell { gap: 6px; margin-bottom: var(--space-2); }
      .date-chip { min-width: 58px; padding: 5px 7px; gap: 1px; }
      .date-chip .day-name { font-size: 0.6rem; }
      .date-chip .day-number { font-size: 0.9rem; }

      // View-mode toggle
      .view-mode-toggle { justify-content: center; }
      .view-mode-toggle mat-button-toggle { font-size: 0.72rem; --mat-standard-button-toggle-height: 32px; }
      .view-mode-toggle mat-icon { font-size: 14px; width: 14px; height: 14px; }

      // Day header
      .day-header { padding: 4px 2px; }
      .day-header-label { font-size: 0.6rem; letter-spacing: 0.14em; }
      .day-header-title { font-size: 0.95rem; }
      .day-header-count { font-size: 0.62rem; padding: 3px 8px; }

      // Planner rail — tighter left column
      .planner { grid-template-columns: 38px 1fr; gap: 4px; }
      .planner-hour-label { font-size: 0.6rem; }
      .planner-hour-line { left: 38px; }

      // Closures
      .closures-section { padding: var(--space-2); margin-top: var(--space-3); }
      .closures-header { gap: 6px; margin-bottom: var(--space-2); }
      .closures-header mat-icon { font-size: 22px; width: 22px; height: 22px; }
      .closures-header h2 { font-size: 1rem; }
      .closures-date { font-size: 0.72rem; }
      .closure-card { padding: 6px 8px; border-radius: 10px; }
      .closure-icon { font-size: 16px; width: 16px; height: 16px; }
      .closure-text { font-size: 0.78rem; }

      // Refresh
      .refresh-btn { height: 40px; font-size: 0.78rem; padding-inline: var(--space-2); }
      .refresh-btn mat-icon { font-size: 16px; width: 16px; height: 16px; }
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
  viewMode: 'byTime' | 'byShow' | 'byTable' = 'byTime';

  /** Weekly matrix (7 days from tomorrow) view-model for "表で見る". */
  tableHeaderDays: {
    date: Date;
    dateShort: string;   // e.g. "11/20"
    dayName: string;     // 日/月/火/…
    isSun: boolean;
    isSat: boolean;
    parkHours: string;   // e.g. "09:00-21:00"
  }[] = [];
  tableRows: {
    title: string;
    color: string;
    duration: number;    // 0 if unknown
    cells: string[][];   // one entry per day in `tableHeaderDays`, each a list of start times
  }[] = [];
  /** Closures across the 7-day window, formatted "Facility (MM/DD クローズ)" etc. */
  tableClosures: string[] = [];
  /** Per-date park hours loaded from the Google sheet. */
  parkHoursByDate: { [date: string]: string } = {};
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

  /** Planner (時刻順) time-axis config */
  private readonly PLANNER_START_MIN = 8 * 60;   // 08:00
  private readonly PLANNER_END_MIN = 23 * 60 + 30; // 23:30
  private readonly PX_PER_MIN = 2.5;
  private readonly DEFAULT_DURATION_MIN = 15;

  /** Duration threshold (min) below which a planner event gets the "bulge" style */
  private readonly SHORT_EVENT_MAX_MIN = 15;
  /** Boundaries beyond which empty hours are collapsed */
  private readonly CORE_START_MIN = 10 * 60;   // 10:00 — always visible
  private readonly CORE_END_MIN   = 22 * 60;   // 22:00 — always visible

  plannerHourLabels: { label: string; top: number }[] = [];
  plannerHeightPx = 0;
  plannerMinWidthPct = 100;
  /** Non-overlapping events, positioned in the planner's absolute coordinate space. */
  plannerEvents: {
    show: Show;
    top: number;
    height: number;
    left: string;
    width: string;
    short: boolean;
  }[] = [];
  /** Overlap clusters — each rendered as its own horizontally-scrollable band so
      only the affected time range moves; events inside are positioned relative
      to the cluster's own top-left origin. */
  plannerClusters: {
    top: number;
    height: number;
    innerWidthPct: number;
    atEnd: boolean;
    events: {
      show: Show;
      top: number;     // relative to cluster top
      height: number;
      left: string;
      width: string;
      short: boolean;
    }[];
  }[] = [];
  loading = false;
  error: string | null = null;
  lastUpdated: Date | null = null;
  noticeText: string = '';

  ngOnInit(): void {
    this.initializeDateSelector();
    this.loadShows();
    this.loadNotice();
    this.loadShowEmojis();
    this.loadParkHoursByDate();
  }

  /** Load per-date open/close so the "表で見る" header row can show
   *  park hours under each date. */
  loadParkHoursByDate(): void {
    this.showsService.getParkHoursByDate()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (map) => {
          this.parkHoursByDate = map;
          this.buildTableView();
        },
        error: (err) => console.error('Error loading per-date park hours:', err)
      });
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
          this.buildPlanner();
          this.buildTableView();
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
          this.buildTableView();
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
          this.buildTableView();
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
          this.buildTableView();
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

  setViewMode(mode: 'byTime' | 'byShow' | 'byTable'): void {
    if (!mode) return;
    this.viewMode = mode;
    if (mode === 'byTable') {
      this.buildTableView();
    }
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

  /**
   * Build the planner (時刻順) view model from `filteredShows`:
   * - Vertical placement by start time, height by actual duration (or 15 min default)
   * - Cluster-based overlap layout: any group of shows whose time windows chain
   *   together gets a 80%-wide column each, offset by 80% left → total width grows
   *   past 100% so the row can be scrolled right to see later boxes.
   */
  private buildPlanner(): void {
    // Sort by start time; compute each show's [start, end) window in minutes.
    const items = this.filteredShows
      .map(show => {
        const start = this.timeToMinutes(show.time);
        if (start < 0) return null;
        const dur = this.showDurations[show.title] || this.DEFAULT_DURATION_MIN;
        return { show, start, end: start + dur, dur };
      })
      .filter((x): x is { show: Show; start: number; end: number; dur: number } => x !== null)
      .sort((a, b) => a.start - b.start);

    // Compute the visible time range.
    // Rule: 10:00–22:00 is always shown. 08:00–10:00 and 22:00–23:30 collapse
    // when no show falls into them. Expand backward/forward hour-by-hour to
    // fully cover any early/late shows.
    let visibleStart = this.CORE_START_MIN;
    let visibleEnd = this.CORE_END_MIN;
    for (const it of items) {
      if (it.start < visibleStart) {
        // snap down to the previous whole hour so the earliest label is a round hour
        visibleStart = Math.max(this.PLANNER_START_MIN, Math.floor(it.start / 60) * 60);
      }
      if (it.end > visibleEnd) {
        // snap up: allow 23:30 as the terminal marker beyond 23:00
        const snapped = Math.min(this.PLANNER_END_MIN, Math.ceil(it.end / 30) * 30);
        visibleEnd = Math.max(visibleEnd, snapped);
      }
    }

    // Hour labels within visible range. Include whole hours; add 23:30 tail
    // marker only if the visible range actually extends past 23:00.
    const labels: { label: string; top: number }[] = [];
    const firstHour = Math.ceil(visibleStart / 60);
    const lastHour = Math.floor(visibleEnd / 60);
    for (let h = firstHour; h <= lastHour; h++) {
      const min = h * 60;
      labels.push({
        label: `${String(h).padStart(2, '0')}:00`,
        top: (min - visibleStart) * this.PX_PER_MIN
      });
    }
    if (visibleEnd > 23 * 60) {
      labels.push({
        label: '23:30',
        top: (this.PLANNER_END_MIN - visibleStart) * this.PX_PER_MIN
      });
    }
    this.plannerHourLabels = labels;
    this.plannerHeightPx = (visibleEnd - visibleStart) * this.PX_PER_MIN;

    // Group into overlap clusters (chained overlap).
    const clusters: (typeof items)[] = [];
    let cur: typeof items = [];
    let curMaxEnd = -Infinity;
    for (const it of items) {
      if (it.start < curMaxEnd) {
        cur.push(it);
        curMaxEnd = Math.max(curMaxEnd, it.end);
      } else {
        if (cur.length) clusters.push(cur);
        cur = [it];
        curMaxEnd = it.end;
      }
    }
    if (cur.length) clusters.push(cur);

    // Place events. Non-overlapping clusters become plain `plannerEvents`
    // positioned in the planner's full coordinate space (full width).
    // Multi-event clusters become `plannerClusters`: each is a horizontally
    // scrollable carousel band positioned over the cluster's time range, so
    // only the affected part of the schedule moves when the user scrolls.
    // Short events (≤ SHORT_EVENT_MAX_MIN) are flagged for the "bulge" style
    // so the title has somewhere to render below the actual duration slot.
    const events: typeof this.plannerEvents = [];
    const plannerClusters: typeof this.plannerClusters = [];

    for (const cluster of clusters) {
      if (cluster.length === 1) {
        const it = cluster[0];
        events.push({
          show: it.show,
          top: (it.start - visibleStart) * this.PX_PER_MIN,
          height: Math.max(it.dur * this.PX_PER_MIN, 22),
          left: '0%',
          width: '100%',
          short: it.dur <= this.SHORT_EVENT_MAX_MIN
        });
        continue;
      }

      // Multi-event cluster → its own scrollable band.
      const clusterStart = cluster[0].start;
      const clusterEnd = cluster.reduce((m, it) => Math.max(m, it.end), -Infinity);
      const clusterTop = (clusterStart - visibleStart) * this.PX_PER_MIN;
      const clusterHeight = Math.max((clusterEnd - clusterStart) * this.PX_PER_MIN, 22);

      // 80%-wide columns offset by (idx * 80%). Total inner width widens past
      // 100% so the band itself scrolls horizontally.
      const colWidthPct = 80;
      const stepPct = 80;
      const innerWidthPct = (cluster.length - 1) * stepPct + colWidthPct;

      const clusterEvents = cluster.map((it, idx) => ({
        show: it.show,
        top: (it.start - clusterStart) * this.PX_PER_MIN,
        height: Math.max(it.dur * this.PX_PER_MIN, 22),
        // Positions are relative to the cluster's inner width (already > 100%),
        // so compute left as a fraction of innerWidth to keep columns aligned.
        left: `${(idx * stepPct / innerWidthPct) * 100}%`,
        width: `${(colWidthPct / innerWidthPct) * 100}%`,
        short: it.dur <= this.SHORT_EVENT_MAX_MIN
      }));

      plannerClusters.push({
        top: clusterTop,
        height: clusterHeight,
        innerWidthPct,
        atEnd: false,
        events: clusterEvents
      });
    }

    this.plannerEvents = events;
    this.plannerClusters = plannerClusters;
    // Whole-row width stays 100% — overflow is handled per-cluster now.
    this.plannerMinWidthPct = 100;
  }

  /**
   * Build the "表で見る" weekly matrix view-model:
   * - Columns = `next7Days` (seven days from tomorrow)
   * - Rows   = every show that appears at least once in that window, sorted
   *            by first appearance (preserves chronological "introduction" order).
   * - Cells  = that show's start times on that day (empty array → "-").
   * - Footer = closures across the week, with a formatted date range.
   *
   * Called whenever any of {shows, durations, closures, parkHours} update,
   * and on-demand when the user switches to the table view.
   */
  private buildTableView(): void {
    // 1) Header row — one entry per day in `next7Days`.
    const headerDays = this.next7Days.map(date => {
      const key = this.formatDateKey(date);
      const dow = date.getDay();
      return {
        date,
        dateShort: `${date.getMonth() + 1}/${String(date.getDate()).padStart(2, '0')}`,
        dayName: this.getJapaneseDayOfWeek(date),
        isSun: dow === 0,
        isSat: dow === 6,
        parkHours: this.parkHoursByDate[key] || ''
      };
    });

    // 2) Collect every show that appears in the window, remembering the
    //    first day/time it appears so rows are ordered chronologically.
    const firstSeen = new Map<string, { date: number; time: string }>();
    const perShowPerDay = new Map<string, string[][]>(); // title → cells

    const dayKeys = this.next7Days.map(d => this.formatDateKey(d));
    dayKeys.forEach((key, idx) => {
      const dayShows = this.shows[key] || [];
      dayShows.forEach(show => {
        if (!perShowPerDay.has(show.title)) {
          perShowPerDay.set(show.title, dayKeys.map(() => [] as string[]));
        }
        perShowPerDay.get(show.title)![idx].push(show.time);

        const seen = firstSeen.get(show.title);
        if (!seen || idx < seen.date || (idx === seen.date && show.time < seen.time)) {
          firstSeen.set(show.title, { date: idx, time: show.time });
        }
      });
    });

    // Sort times inside each cell so they render in order.
    perShowPerDay.forEach(cells => {
      cells.forEach(times => times.sort());
    });

    // 3) Row list, sorted by first appearance.
    const titles = Array.from(perShowPerDay.keys()).sort((a, b) => {
      const sa = firstSeen.get(a)!;
      const sb = firstSeen.get(b)!;
      if (sa.date !== sb.date) return sa.date - sb.date;
      return sa.time.localeCompare(sb.time);
    });

    const rows = titles.map(title => ({
      title,
      color: this.showColors[title] || '#6c5ce7',
      duration: this.showDurations[title] || 0,
      cells: perShowPerDay.get(title)!
    }));

    // 4) Closures across the window, aggregated per facility.
    const facilityDays = new Map<string, number[]>();  // facility → day indices
    dayKeys.forEach((key, idx) => {
      (this.closures[key] || []).forEach(name => {
        if (!facilityDays.has(name)) facilityDays.set(name, []);
        facilityDays.get(name)!.push(idx);
      });
    });

    const fmtMD = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
    const closureLabels: string[] = [];
    facilityDays.forEach((idxs, name) => {
      idxs.sort((a, b) => a - b);
      if (idxs.length === 7) {
        closureLabels.push(`${name} (この週は休止)`);
      } else if (idxs.length === 1) {
        closureLabels.push(`${name} (${fmtMD(this.next7Days[idxs[0]])} クローズ)`);
      } else {
        const first = fmtMD(this.next7Days[idxs[0]]);
        const last  = fmtMD(this.next7Days[idxs[idxs.length - 1]]);
        closureLabels.push(`${name} (${first}〜${last} クローズ)`);
      }
    });
    closureLabels.sort();

    this.tableHeaderDays = headerDays;
    this.tableRows = rows;
    this.tableClosures = closureLabels;
  }

  /**
   * Hide the "scrollable right" arrow once the user has scrolled a cluster to
   * (near) its end. Called from the template as (scroll) on each band.
   */
  onClusterScroll(event: Event, idx: number): void {
    const el = event.target as HTMLElement | null;
    const cluster = this.plannerClusters[idx];
    if (!el || !cluster) return;
    const remaining = el.scrollWidth - el.clientWidth - el.scrollLeft;
    cluster.atEnd = remaining <= 4;   // small epsilon for sub-pixel rounding
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

    this.buildPlanner();
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