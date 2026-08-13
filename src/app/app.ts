import { Component, OnInit, OnDestroy, Injectable, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Observable, forkJoin, of, catchError, Subscription } from 'rxjs';
import { ShowComponent } from './components/show/show.component';
import { TyphoonComponent } from './components/typhoon/typhoon.component';
import { ShowsDataService } from './services/shows-data.service';

// TypeScript interfaces for type safety
interface MTRTrain {
  dest: string;
  time: string;
  ttnt: string;
}

interface MTRScheduleData {
  UP?: MTRTrain[];
  DOWN?: MTRTrain[];
}

interface MTRResponse {
  data?: {
    [key: string]: MTRScheduleData;
  };
}

interface BusETA {
  route: string;
  dest_en: string;
  eta: string;
}

interface BusETAResponse {
  data?: BusETA[];
}

interface TemperatureData {
  place: string;
  value: number;
}

interface HumidityData {
  value: number;
}

interface WeatherResponse {
  temperature?: {
    data?: TemperatureData[];
  };
  humidity?: {
    data?: HumidityData[];
  };
}

interface ForecastDay {
  week: string;
  forecastMintemp: { value: number };
  forecastMaxtemp: { value: number };
  ForecastIcon: number;
}

interface ForecastResponse {
  weatherForecast?: ForecastDay[];
}

interface ProcessedTrain {
  time: string;
}

interface ProcessedBus {
  route: string;
  dest: string;
  rawMins: number;
  time: string;
}

interface ForecastItem {
  week: string;
  min: number;
  max: number;
  iconId: number;
}

// --- 0. DATA SERVICE ---
@Injectable({ providedIn: 'root' })
export class DataService {
  private http = inject(HttpClient);

  // MTR: Fetch specific station
  getMTRSchedule(station: string): Observable<MTRResponse> {
    if (!station || station.trim() === '') {
      console.error('Invalid station parameter');
      return of({});
    }
    return this.http.get<MTRResponse>(`https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=DRL&sta=${station}`);
  }

  // BUS: Fetch ETA for a specific Stop AND Route
  getBusETA(stopId: string, route: string): Observable<BusETAResponse> {
    if (!stopId || !route || stopId.trim() === '' || route.trim() === '') {
      console.error('Invalid bus parameters');
      return of({});
    }
    return this.http.get<BusETAResponse>(`https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${stopId}/${route}`);
  }

  getCurrentWeather(): Observable<WeatherResponse> {
    return this.http.get<WeatherResponse>('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=en');
  }

  getWeatherForecast(): Observable<ForecastResponse> {
    return this.http.get<ForecastResponse>('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=fnd&lang=en');
  }
}

// --- 1. TRANSPORT COMPONENT ---
@Component({
  selector: 'app-transport',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatListModule, MatProgressBarModule, MatButtonModule],
  template: `
    <div class="page-container">
      <!-- Notice Box -->
      @if (noticeText) {
        <div class="notice-box" role="alert">
          <mat-icon class="notice-icon">info</mat-icon>
          <span class="notice-text">{{ noticeText }}</span>
        </div>
      }

      <!-- Last Updated Timestamp -->
      @if (lastUpdated) {
        <div class="last-updated" role="status" aria-live="polite">
          <mat-icon>schedule</mat-icon>
          <span>Updated {{ getTimeAgo(lastUpdated) }}</span>
        </div>
      }

      <!-- CARD 1: MTR (Requirements 1 & 2) -->
      <mat-card class="info-card mtr-card" role="region" aria-labelledby="mtr-title">
        <div class="card-accent mtr-accent"></div>
        <mat-card-header>
          <div mat-card-avatar class="icon-circle mtr-bg"><mat-icon>train</mat-icon></div>
          <mat-card-title id="mtr-title">ディズニーランドリゾート線</mat-card-title>
          <mat-card-subtitle>リアルタイム発車時刻</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (loading) {
            <!-- Skeleton Loading State -->
            <div class="skeleton-group">
              <div class="skeleton skeleton-title"></div>
              @for (i of [1,2,3]; track i) {
                <div class="skeleton-item">
                  <div class="skeleton skeleton-text" style="width: 60%"></div>
                  <div class="skeleton skeleton-text" style="width: 30%"></div>
                </div>
              }
            </div>
          }

          @if (error) {
            <!-- Error State -->
            <div class="error-card" role="alert">
              <mat-icon color="warn">error_outline</mat-icon>
              <div class="error-content">
                <h4>発車時刻(MTR)読み取れません</h4>
                <p>{{ error }}</p>
                <button mat-stroked-button color="primary" (click)="loadData()">
                  <mat-icon>refresh</mat-icon> リトライ
                </button>
              </div>
            </div>
          }

          @if (!loading && !error) {
            <!-- 1. Sunny Bay -> Disney -->
            <div class="section-header">
              <mat-icon class="section-icon">arrow_forward</mat-icon>
              サニーベイ駅(欣澳站)発
            </div>
            <div class="custom-list" role="list">
              @for (item of mtrSunnyToDisney; track item.time; let idx = $index) {
                <div class="list-item animate-stagger-{{idx + 1}}"
                     [class.arriving]="item.time === 'まもなく到着'"
                     role="listitem">
                  <div class="destination">
                    <mat-icon class="dest-icon">location_on</mat-icon>
                    ディズニーランドリゾート(迪士尼)行
                  </div>
                  <div class="arrival-time"
                       [class.pulse]="item.time === 'まもなく到着'"
                       [attr.aria-label]="item.time === 'まもなく到着' ? 'Train arriving now' : 'Arrives in ' + item.time">
                    {{ item.time }}
                    @if (item.time === 'まもなく到着') {
                      <span class="pulse-dot"></span>
                    }
                  </div>
                </div>
              }
              @if (mtrSunnyToDisney.length === 0) {
                <div class="no-data">
                  <mat-icon>info</mat-icon>
                  終電が発車済み
                </div>
              }
            </div>

            <div class="divider"></div>

            <!-- 2. Disney -> Sunny Bay -->
            <div class="section-header">
              <mat-icon class="section-icon">arrow_back</mat-icon>
              ディズニーランドリゾート駅(迪士尼站)発
            </div>
            <div class="custom-list" role="list">
              @for (item of mtrDisneyToSunny; track item.time; let idx = $index) {
                <div class="list-item animate-stagger-{{idx + 1}}"
                     [class.arriving]="item.time === 'まもなく到着'"
                     role="listitem">
                  <div class="destination">
                    <mat-icon class="dest-icon">location_on</mat-icon>
                    サニーベイ(欣澳)行
                  </div>
                  <div class="arrival-time"
                       [class.pulse]="item.time === 'まもなく到着'"
                       [attr.aria-label]="item.time === 'まもなく到着' ? 'Train arriving now' : 'Arrives in ' + item.time">
                    {{ item.time }}
                    @if (item.time === 'まもなく到着') {
                      <span class="pulse-dot"></span>
                    }
                  </div>
                </div>
              }
              @if (mtrDisneyToSunny.length === 0) {
                <div class="no-data">
                  <mat-icon>info</mat-icon>
                  終電が発車済み
                </div>
              }
            </div>
          }
        </mat-card-content>
      </mat-card>

      <!-- CARD 2: R8 Shuttle (Requirements 3 & 4) -->
      <mat-card class="info-card bus-card" role="region" aria-labelledby="r8-title">
        <div class="card-accent bus-accent"></div>
        <mat-card-header>
          <div mat-card-avatar class="icon-circle bus-bg"><mat-icon>directions_bus</mat-icon></div>
          <mat-card-title id="r8-title">バスR8系統</mat-card-title>
          <mat-card-subtitle>Lantau Linkバス停で市内、空港往復のバスを乗り換え可能</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (loading) {
            <!-- Skeleton Loading State -->
            <div class="skeleton-group">
              <div class="skeleton skeleton-title"></div>
              <div class="skeleton skeleton-text" style="width: 70%"></div>
            </div>
          }

          @if (!loading && !error) {
            <!-- 3. Lantau Link -> Disney -->
            <div class="section-header">
              <mat-icon class="section-icon">arrow_forward</mat-icon>
              Lantau Link (青嶼幹線)発
            </div>
            <div class="custom-list" role="list">
              @for (item of r8ToDisney; track item; let idx = $index) {
                <div class="list-item animate-stagger-{{idx + 1}}"
                     [class.arriving]="item === 'まもなく到着'"
                     role="listitem">
                  <div class="destination">
                    <mat-icon class="dest-icon">location_on</mat-icon>
                    ディズニーランドリゾート(迪士尼)行
                  </div>
                  <div class="arrival-time"
                       [class.pulse]="item === 'まもなく到着'"
                       [attr.aria-label]="item === 'まもなく到着' ? 'Bus arriving now' : 'Arrives in ' + item">
                    {{ item }}
                    @if (item === 'まもなく到着') {
                      <span class="pulse-dot"></span>
                    }
                  </div>
                </div>
              }
              @if (r8ToDisney.length === 0) {
                <div class="no-data">
                  <mat-icon>info</mat-icon>
                  終車が発車済み
                </div>
              }
            </div>

            <div class="divider"></div>

            <!-- 4. Disney PTI -> Lantau Link -->
            <div class="section-header">
              <mat-icon class="section-icon">arrow_back</mat-icon>
              ディズニーランドリゾート駅(迪士尼總站)発
            </div>
            <div class="custom-list" role="list">
              @for (item of r8ToLantau; track item; let idx = $index) {
                <div class="list-item animate-stagger-{{idx + 1}}"
                     [class.arriving]="item === 'まもなく到着'"
                     role="listitem">
                  <div class="destination">
                    <mat-icon class="dest-icon">location_on</mat-icon>
                    Lantau Link行
                  </div>
                  <div class="arrival-time"
                       [class.pulse]="item === 'まもなく到着'"
                       [attr.aria-label]="item === 'まもなく到着' ? 'Bus arriving now' : 'Arrives in ' + item">
                    {{ item }}
                    @if (item === 'まもなく到着') {
                      <span class="pulse-dot"></span>
                    }
                  </div>
                </div>
              }
              @if (r8ToLantau.length === 0) {
                <div class="no-data">
                  <mat-icon>info</mat-icon>
                  終車が発車済み
                </div>
              }
            </div>
          }
        </mat-card-content>
      </mat-card>

      <!-- CARD 3: Lantau Link Interchange (Requirements 5 & 6) -->
      <mat-card class="info-card interchange-card" role="region" aria-labelledby="interchange-title">
        <div class="card-accent interchange-accent"></div>
        <mat-card-header>
          <div mat-card-avatar class="icon-circle link-bg"><mat-icon>alt_route</mat-icon></div>
          <mat-card-title id="interchange-title">Lantau Link (青嶼幹線)バス停</mat-card-title>
          <mat-card-subtitle>空港・市内往復バス</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (loading) {
            <!-- Skeleton Loading State -->
            <div class="skeleton-group">
              <div class="skeleton skeleton-title"></div>
              @for (i of [1,2,3]; track i) {
                <div class="skeleton-item">
                  <div class="skeleton skeleton-text" style="width: 100%"></div>
                </div>
              }
            </div>
          }

          @if (!loading && !error) {
            <!-- 5. To Airport (All Routes) -->
            <div class="section-header">
              <mat-icon class="section-icon">flight</mat-icon>
              空港・東涌行(往機場/東涌)
            </div>
            <div class="multi-bus-list" role="list">
              @for (bus of lantauToAirport; track bus.route + bus.time; let idx = $index) {
                <div class="multi-bus-row animate-stagger-{{idx + 1}}"
                     [class.now]="bus.time === 'まもなく到着'"
                     role="listitem">
                  <span class="route-badge">{{ bus.route }}</span>
                  <span class="route-dest truncate">{{ bus.dest }}</span>
                  <span class="route-time">{{ bus.time }}</span>
                </div>
              }
              @if (lantauToAirport.length === 0) {
                <div class="no-data">
                  <mat-icon>info</mat-icon>
                  終車が発車済み
                </div>
              }
            </div>

            <div class="divider"></div>

            <!-- 6. To Urban (All Routes) -->
            <div class="section-header">
              <mat-icon class="section-icon">location_city</mat-icon>
              市内行(往市區)
            </div>
            <div class="multi-bus-list" role="list">
              @for (bus of lantauToUrban; track bus.route + bus.time; let idx = $index) {
                <div class="multi-bus-row animate-stagger-{{idx + 1}}"
                     [class.now]="bus.time === 'まもなく到着'"
                     role="listitem">
                  <span class="route-badge urban">{{ bus.route }}</span>
                  <span class="route-dest truncate">{{ bus.dest }}</span>
                  <span class="route-time">{{ bus.time }}</span>
                </div>
              }
              @if (lantauToUrban.length === 0) {
                <div class="no-data">
                  <mat-icon>info</mat-icon>
                  終車が発車済み
                </div>
              }
            </div>
          }
        </mat-card-content>
      </mat-card>

      <button mat-flat-button color="primary" class="refresh-btn" (click)="loadData()">
        <mat-icon>refresh</mat-icon> 更新
      </button>
    </div>
  `,
  styles: [`
    // === PAGE LAYOUT ===
    .page-container {
      padding: var(--space-2);
      padding-bottom: 80px;
      max-width: 1200px;
      margin: 0 auto;

      @media (min-width: 1024px) {
        padding: var(--space-4);
        padding-bottom: 80px;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-4);

        .last-updated {
          grid-column: 1 / -1;
        }

        .refresh-btn {
          grid-column: 1 / -1;
        }
      }
    }

    // === NOTICE BOX ===
    .notice-box {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
      padding: var(--space-3);
      background: linear-gradient(135deg, #fef3c7, #fde68a);
      border: 2px solid #f59e0b;
      border-radius: var(--radius-lg);
      margin-bottom: var(--space-3);
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2);

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
        font-size: var(--font-size-base);
        color: #92400e;
        font-weight: 500;
        line-height: 1.5;
      }

      @media (min-width: 1024px) {
        grid-column: 1 / -1;
      }
    }

    // === LAST UPDATED INDICATOR ===
    .last-updated {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      padding: var(--space-2);
      background: var(--glass-background);
      backdrop-filter: var(--glass-blur);
      border-radius: var(--radius-lg);
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      margin-bottom: var(--space-3);

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }

    // === CARD STYLES ===
    .info-card {
      position: relative;
      margin-bottom: var(--space-3);
      border-radius: var(--card-radius);
      overflow: visible;
      transition: transform var(--transition-base), box-shadow var(--transition-base);

      &:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-lg);
      }

      @media (min-width: 1024px) {
        margin-bottom: 0;
      }
    }

    // Card accent bar (colored top border)
    .card-accent {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;

      &.mtr-accent {
        background: linear-gradient(90deg, #690e7f, #9B4FB8);
      }

      &.bus-accent {
        background: linear-gradient(90deg, #E65C00, #FF9147);
      }

      &.interchange-accent {
        background: linear-gradient(90deg, #8B5CF6, #A569BD);
      }
    }

    .icon-circle {
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      border-radius: 50%;

      &.mtr-bg {
        background: linear-gradient(135deg, #690e7f, #7D3C98);
      }

      &.bus-bg {
        background: linear-gradient(135deg, #E65C00, #FF8533);
      }

      &.link-bg {
        background: linear-gradient(135deg, #8B5CF6, #A569BD);
      }
    }

    // === SECTION HEADERS ===
    .section-header {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      font-family: var(--font-family-heading);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-bold);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-secondary);
      margin: var(--space-3) 0 var(--space-2);

      .section-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--color-primary);
      }
    }

    // === DIVIDERS ===
    .divider {
      height: 1px;
      background: var(--color-divider);
      margin: var(--space-3) 0;
    }

    // === MTR & BUS LIST STYLES ===
    .custom-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .list-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-2);
      background: var(--color-background);
      border-radius: var(--radius-md);
      border-left: 4px solid var(--color-mtr);
      transition: all var(--transition-fast);

      &:hover {
        background: var(--color-surface);
        transform: translateX(4px);
      }

      &.arriving {
        border-left-color: var(--color-accent);
        background: linear-gradient(90deg, rgba(243, 204, 100, 0.1), transparent);
      }
    }

    .destination {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      flex: 1;
      font-family: var(--font-family-body);
      font-size: var(--font-size-base);
      color: var(--color-text-primary);

      .dest-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--color-text-secondary);
      }
    }

    .arrival-time {
      font-family: var(--font-family-heading);
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-accent);
      display: flex;
      align-items: center;
      gap: var(--space-1);

      &.pulse {
        animation: pulse 2s ease-in-out infinite;
      }
    }

    .pulse-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      background: var(--color-accent);
      border-radius: 50%;
      animation: pulse 2s ease-in-out infinite;
    }


    // === MULTI-BUS LIST (Lantau Link) ===
    .multi-bus-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .multi-bus-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2);
      background: var(--color-background);
      border-radius: var(--radius-md);
      transition: all var(--transition-fast);

      &:hover {
        background: var(--color-surface);
        transform: translateX(4px);
        box-shadow: var(--shadow-sm);
      }

      &.now {
        background: linear-gradient(90deg, rgba(243, 204, 100, 0.15), transparent);
        border-left: 3px solid var(--color-accent);
      }
    }

    .route-badge {
      background: var(--color-primary);
      color: white;
      font-family: var(--font-family-heading);
      font-weight: var(--font-weight-bold);
      font-size: var(--font-size-xs);
      padding: 4px 8px;
      border-radius: var(--radius-sm);
      min-width: 45px;
      text-align: center;
      flex-shrink: 0;

      &.urban {
        background: var(--color-error);
      }
    }

    .route-dest {
      flex: 1;
      font-size: var(--font-size-sm);
      color: var(--color-text-primary);
      min-width: 0;
    }

    .route-time {
      font-family: var(--font-family-heading);
      font-weight: var(--font-weight-bold);
      font-size: var(--font-size-base);
      color: var(--color-accent);
      flex-shrink: 0;
    }

    // === NO DATA STATE ===
    .no-data {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      padding: var(--space-3);
      color: var(--color-text-disabled);
      font-style: italic;
      font-size: var(--font-size-sm);
      text-align: center;
      justify-content: center;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }

    // === ERROR STATE ===
    .error-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-4);
      background: rgba(177, 34, 40, 0.05);
      border-radius: var(--radius-lg);
      text-align: center;

      mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
      }

      .error-content {
        h4 {
          margin: 0 0 var(--space-1);
          color: var(--color-error);
          font-family: var(--font-family-heading);
        }

        p {
          margin: 0 0 var(--space-2);
          color: var(--color-text-secondary);
          font-size: var(--font-size-sm);
        }
      }
    }

    // === SKELETON LOADING ===
    .skeleton-group {
      padding: var(--space-2) 0;
    }

    .skeleton-item {
      display: flex;
      justify-content: space-between;
      margin-bottom: var(--space-2);
    }

    // === REFRESH BUTTON ===
    .refresh-btn {
      width: 100%;
      height: 56px;
      border-radius: var(--button-radius);
      margin-top: var(--space-3);
      font-family: var(--font-family-heading);
      font-weight: var(--font-weight-semibold);
      font-size: var(--font-size-base);
    }

    // === ANIMATIONS ===
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
  `]
})
export class TransportComponent implements OnInit, OnDestroy {
  private dataService = inject(DataService);
  private showsDataService = inject(ShowsDataService);
  private subscription?: Subscription;
  loading = true;
  error: string | null = null;
  lastUpdated: Date | null = null;
  noticeText: string = '';

  // MTR Data
  mtrSunnyToDisney: ProcessedTrain[] = [];
  mtrDisneyToSunny: ProcessedTrain[] = [];

  // R8 Data
  r8ToDisney: string[] = [];
  r8ToLantau: string[] = [];

  // Lantau Link Hub Data
  lantauToAirport: ProcessedBus[] = [];
  lantauToUrban: ProcessedBus[] = [];

  // Define Stop IDs
  readonly STOP_LANTAU_TO_AIR = '001853'; // Lantau Link Toll Plaza (To Airport)
  readonly STOP_LANTAU_TO_URB = '001854'; // Lantau Link Toll Plaza (To Urban)
  readonly STOP_DISNEY_PTI_OUTBOUND = '002658';    // Leaving Disney PTI to Link Toll Plaza
  readonly STOP_LANTAU_INBOUND = '001853';         // Leaving Link Toll Plaza to Disney PTI
  // Define Major Routes to fetch for the Hub (Since we can't fetch "All")
  readonly HUB_ROUTES = ['A10', 'A11', 'A12', 'A20', 'A21', 'A22', 'A26', 'A27', 'E11', 'E21', 'E23'];

  ngOnInit() {
    this.loadData();
    this.loadNotice();
  }

  loadNotice() {
    this.showsDataService.getNotices().subscribe({
      next: (notices) => {
        this.noticeText = notices.transport;
      },
      error: (error) => {
        console.error('Error loading transport notice:', error);
      }
    });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  getTimeAgo(date: Date): string {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  loadData() {
    this.loading = true;
    this.error = null;

    // --- 1. MTR Requests ---
    const mtrSun$ = this.dataService.getMTRSchedule('SUN').pipe(catchError(() => of({})));
    const mtrDis$ = this.dataService.getMTRSchedule('DIS').pipe(catchError(() => of({})));

    // --- 2. R8 Requests (Specific Route) ---
    const r8Inbound$ = this.dataService.getBusETA(this.STOP_LANTAU_INBOUND, 'R8').pipe(catchError(() => of({})));
    const r8Outbound$ = this.dataService.getBusETA(this.STOP_DISNEY_PTI_OUTBOUND, 'R8').pipe(catchError(() => of({})));

    // --- 3. Hub Requests (Multiple Routes) ---
    const hubObservables = this.HUB_ROUTES.map(route => {
      return forkJoin({
        toAir: this.dataService.getBusETA(this.STOP_LANTAU_TO_AIR, route).pipe(catchError(() => of({}))),
        toUrb: this.dataService.getBusETA(this.STOP_LANTAU_TO_URB, route).pipe(catchError(() => of({})))
      });
    });

    // Combine everything
    this.subscription = forkJoin({
      mtrSun: mtrSun$,
      mtrDis: mtrDis$,
      r8In: r8Inbound$,
      r8Out: r8Outbound$,
      hubData: forkJoin(hubObservables)
    }).subscribe({
      next: (res) => {
        // --- PROCESS MTR ---
        this.mtrSunnyToDisney = this.processMTR(res.mtrSun, 'DRL-SUN', 'DIS');
        this.mtrDisneyToSunny = this.processMTR(res.mtrDis, 'DRL-DIS', 'SUN');

        // --- PROCESS R8 ---
        this.r8ToDisney = this.processBusSimple('data' in res.r8In ? res.r8In.data : undefined);
        this.r8ToLantau = this.processBusSimple('data' in res.r8Out ? res.r8Out.data : undefined);

        // --- PROCESS LANTAU LINK HUB ---
        let allAir: BusETA[] = [];
        let allUrb: BusETA[] = [];

        res.hubData.forEach((routeResult) => {
          if ('data' in routeResult.toAir && routeResult.toAir.data) allAir = [...allAir, ...routeResult.toAir.data];
          if ('data' in routeResult.toUrb && routeResult.toUrb.data) allUrb = [...allUrb, ...routeResult.toUrb.data];
        });

        this.lantauToAirport = this.processBusDetailed(allAir);
        this.lantauToUrban = this.processBusDetailed(allUrb);

        this.loading = false;
        this.lastUpdated = new Date();
        this.error = null;
      },
      error: (error) => {
        console.error('Error loading transport data:', error);
        this.loading = false;
        this.error = 'Network error. Please check your connection and try again.';
      }
    });
  }

  // Helper: Process MTR - Checks both UP and DN directions
  processMTR(res: MTRResponse, lineKey: string, targetDest: string): ProcessedTrain[] {
    if (!res?.data?.[lineKey]) return [];
    const schedule = res.data[lineKey];

    // Combine UP and DN arrays safely
    const allTrains = [...(schedule.UP || []), ...(schedule.DOWN || [])];

    return allTrains
      .filter((t) => t.dest === targetDest)
      .map((t) => {
        let displayTime = '';
        if (t.ttnt && t.ttnt !== '0') {
          displayTime = `${t.ttnt} min`;
        } else if (t.ttnt === '0') {
          displayTime = 'まもなく到着';
        } else if (t.time) {
          // Validate date before parsing
          const date = new Date(t.time);
          if (!isNaN(date.getTime())) {
            displayTime = date.toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit', hour12: false });
          } else {
            displayTime = 'N/A';
          }
        } else {
          displayTime = 'N/A';
        }
        return { time: displayTime };
      });
  }

  // Helper: Process Bus for Chips (Simple list of minutes)
  processBusSimple(list?: BusETA[]): string[] {
    if (!list) return [];
    return list
      .filter((b) => !!b.eta)
      .map((b) => {
        const etaDate = new Date(b.eta);
        if (isNaN(etaDate.getTime())) return null;

        const diff = etaDate.getTime() - new Date().getTime();
        return Math.floor(diff / 60000);
      })
      .filter((mins): mins is number => mins !== null)
      .sort((a, b) => a - b)
      .map((mins) => mins <= 0 ? 'まもなく到着' : `${mins} min`)
      .slice(0, 3);
  }

  // Helper: Process Bus for List (Detailed rows)
  processBusDetailed(list?: BusETA[]): ProcessedBus[] {
    if (!list) return [];
    return list
      .filter((b) => !!b.eta)
      .map((b) => {
        const etaDate = new Date(b.eta);
        if (isNaN(etaDate.getTime())) return null;

        const diff = etaDate.getTime() - new Date().getTime();
        const mins = Math.floor(diff / 60000);
        return {
          route: b.route,
          dest: b.dest_en,
          rawMins: mins,
          time: mins <= 0 ? 'まもなく到着' : `${mins} min`
        };
      })
      .filter((item): item is ProcessedBus => item !== null)
      .sort((a, b) => a.rawMins - b.rawMins)
      .slice(0, 6);
  }
}

// --- 2. WEATHER COMPONENT ---
@Component({
  selector: 'app-weather',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, TyphoonComponent],
  template: `
    <div class="page-container">
      <!-- Notice Box -->
      @if (noticeText) {
        <div class="notice-box" role="alert">
          <mat-icon class="notice-icon">info</mat-icon>
          <span class="notice-text">{{ noticeText }}</span>
        </div>
      }

      <!-- Park Operating Hours -->
      <section class="info-panel hours-panel" role="region" aria-labelledby="hours-title">
        <div class="info-panel-header">
          <mat-icon>schedule</mat-icon>
          <h3 id="hours-title">本日のパーク運営時間</h3>
        </div>
        @if (parkHours) {
          <div class="hours-line">
            <span class="hours-value">{{ parkHours.open }}</span>
            <span class="hours-sep">–</span>
            <span class="hours-value">{{ parkHours.close }}</span>
          </div>
        } @else {
          <div class="info-empty">本日の情報がありません</div>
        }
      </section>

      <!-- Ongoing Events -->
      <section class="info-panel events-panel" role="region" aria-labelledby="events-title">
        <div class="info-panel-header">
          <mat-icon>celebration</mat-icon>
          <h3 id="events-title">開催中イベント</h3>
        </div>
        @if (events.length > 0) {
          <ul class="events-list">
            @for (event of events; track event.name) {
              <li class="event-item">
                <span class="event-name">{{ event.name }}</span>
                @if (event.date) {
                  <span class="event-date">{{ event.date }}</span>
                }
              </li>
            }
          </ul>
        } @else {
          <div class="info-empty">開催中のイベントはありません</div>
        }
      </section>

      <!-- Hero Weather Card with Glassmorphism -->
      <div class="weather-hero" [ngClass]="getWeatherClass()" role="region" aria-labelledby="weather-title">
        <div class="hero-content">
          <div class="location" id="weather-title">
            <mat-icon>location_on</mat-icon>
            香港ディズニーランド
          </div>
          <div class="temp display-number" aria-label="Current temperature {{ currentTemp }} degrees">
            {{ currentTemp }}°
          </div>
          <div class="weather-condition-icon">
            @if (getWeatherClass() === 'sunny') {
              <mat-icon class="large-weather-icon sunny-icon">wb_sunny</mat-icon>
            }
            @if (getWeatherClass() === 'cloudy') {
              <mat-icon class="large-weather-icon cloudy-icon">cloud</mat-icon>
            }
            @if (getWeatherClass() === 'rainy') {
              <mat-icon class="large-weather-icon rainy-icon">water_drop</mat-icon>
            }
            @if (getWeatherClass() === 'default') {
              <mat-icon class="large-weather-icon">wb_cloudy</mat-icon>
            }
          </div>
          <div class="weather-details-grid">
            <div class="detail-card glass">
              <mat-icon>water_drop</mat-icon>
              <div class="detail-content">
                <div class="detail-label">湿度</div>
                <div class="detail-value">{{ currentHumidity }}%</div>
              </div>
            </div>
            <div class="detail-card glass">
              <mat-icon>thermostat</mat-icon>
              <div class="detail-content">
                <div class="detail-label">体感温度</div>
                <div class="detail-value">{{ currentTemp }}°</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Typhoon Signal Warning -->
      <app-typhoon></app-typhoon>

      <!-- 7-Day Forecast -->
      <h3 class="forecast-heading">
        <mat-icon>calendar_month</mat-icon>
        7日間天気予報
      </h3>
      <div class="forecast-grid" role="list" aria-label="7-day weather forecast">
        @for (day of forecast; track day.week; let idx = $index) {
          <div class="forecast-card animate-stagger-{{idx + 1}}"
               [class.today]="idx === 0"
               role="listitem">
            @if (idx === 0) {
              <span class="today-badge">今日</span>
            }
            <div class="f-day">{{ getJapaneseDayName(day.week) }}</div>
            <div class="f-icon" [class.sunny]="day.iconId <= 54"
                 [class.cloudy]="day.iconId > 54 && day.iconId <= 65"
                 [class.rainy]="day.iconId > 65">
              @if (day.iconId <= 54) {
                <mat-icon class="weather-icon sunny-icon">wb_sunny</mat-icon>
              }
              @if (day.iconId > 54 && day.iconId <= 65) {
                <mat-icon class="weather-icon">cloud</mat-icon>
              }
              @if (day.iconId > 65) {
                <mat-icon class="weather-icon">water_drop</mat-icon>
              }
            </div>
            <div class="f-temp">
              <span class="max">{{ day.max }}°</span>
              <span class="min">{{ day.min }}°</span>
            </div>
            <div class="temp-bar">
              <div class="temp-bar-fill" [style.width.%]="getTempPercentage(day.max, day.min)"></div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    // === PAGE LAYOUT ===
    .page-container {
      padding: var(--space-2);
      padding-bottom: 80px;
      max-width: 800px;
      margin: 0 auto;

      @media (min-width: 1024px) {
        padding: var(--space-4);
        padding-bottom: 80px;
      }
    }

    // === NOTICE BOX ===
    .notice-box {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
      padding: var(--space-3);
      background: linear-gradient(135deg, #fef3c7, #fde68a);
      border: 2px solid #f59e0b;
      border-radius: var(--radius-lg);
      margin-bottom: var(--space-3);
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2);

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
        font-size: var(--font-size-base);
        color: #92400e;
        font-weight: 500;
        line-height: 1.5;
      }
    }

    // === INFO PANELS (Park Hours & Events) — translucent material ===
    .info-panel {
      background: rgba(255, 255, 255, 0.65);
      backdrop-filter: blur(18px) saturate(160%);
      -webkit-backdrop-filter: blur(18px) saturate(160%);
      border: 1px solid rgba(255, 255, 255, 0.5);
      border-left: 4px solid var(--color-primary);
      border-radius: var(--radius-lg);
      padding: var(--space-3);
      margin-bottom: var(--space-3);
      box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 12px 32px rgba(0,0,0,0.08);
    }

    .info-panel-header {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      margin-bottom: var(--space-2);

      mat-icon {
        color: var(--color-primary);
        font-size: 22px;
        width: 22px;
        height: 22px;
      }

      h3 {
        margin: 0;
        font-family: var(--font-family-heading);
        font-size: var(--font-size-lg);
        font-weight: var(--font-weight-bold);
        color: var(--color-text-primary);
      }
    }

    .hours-panel {
      border-left-color: #10b981;

      .info-panel-header mat-icon {
        color: #10b981;
      }
    }

    .hours-line {
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: var(--space-2);
      padding: var(--space-2) 0;
      font-family: var(--font-family-heading);

      .hours-value {
        font-size: 2rem;
        font-weight: var(--font-weight-bold);
        color: var(--color-text-primary);
        letter-spacing: 0.02em;
      }

      .hours-sep {
        font-size: 1.4rem;
        color: var(--color-text-secondary);
      }
    }

    .events-panel {
      border-left-color: #ec4899;

      .info-panel-header mat-icon {
        color: #ec4899;
      }
    }

    .events-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .event-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2);
      background: linear-gradient(135deg, #fdf2f8, #fce7f3);
      border-radius: var(--radius-md);
      border: 1px solid #fbcfe8;

      .event-name {
        flex: 1;
        font-weight: 600;
        color: #831843;
        font-size: var(--font-size-base);
      }

      .event-date {
        font-size: var(--font-size-sm);
        color: #9d174d;
        white-space: nowrap;
      }
    }

    .info-empty {
      padding: var(--space-2);
      color: var(--color-text-disabled);
      font-style: italic;
      font-size: var(--font-size-sm);
      text-align: center;
    }

    // === WEATHER HERO CARD ===
    .weather-hero {
      position: relative;
      min-height: 400px;
      border-radius: var(--radius-2xl);
      padding: var(--space-6);
      margin-bottom: var(--space-4);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      transition: all var(--transition-base);

      // Dynamic backgrounds based on weather
      &.sunny {
        background: linear-gradient(180deg, #FF8C42 0%, #F3CC64 100%);
      }

      &.cloudy {
        background: linear-gradient(180deg, #718096 0%, #A0AEC0 100%);
      }

      &.rainy {
        background: linear-gradient(180deg, #4FB3D4 0%, #113CCF 100%);
      }

      &.default {
        background: linear-gradient(180deg, #4facfe 0%, #00f2fe 100%);
      }

      // Animated background overlay
      &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: radial-gradient(circle at 30% 50%, rgba(255, 255, 255, 0.1) 0%, transparent 50%);
        animation: drift 10s ease-in-out infinite alternate;
      }
    }

    @keyframes drift {
      0% { transform: translateX(-10%) translateY(-10%); }
      100% { transform: translateX(10%) translateY(10%); }
    }

    .hero-content {
      position: relative;
      z-index: 1;
      text-align: center;
      color: white;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
      width: 100%;
      padding: var(--space-4);
      border-radius: var(--radius-xl);

      &.glass {
        // Dark scrim (iOS Weather-widget pattern) — restores contrast for white text
        // uniformly across all four weather gradients, including light-luminance ones.
        background: rgba(0, 0, 0, 0.18);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.22);
      }
    }

    .location {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-1);
      font-family: var(--font-family-heading);
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      opacity: 0.95;
      margin-bottom: var(--space-2);

      mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
    }

    .temp {
      font-size: clamp(4rem, 12vw, 7rem);
      font-weight: var(--font-weight-light);
      line-height: 1;
      margin: var(--space-2) 0;
      letter-spacing: -0.02em;
    }

    .weather-condition-icon {
      display: flex;
      justify-content: center;
      align-items: center;
      margin-bottom: var(--space-3);

      .large-weather-icon {
        font-size: 80px;
        width: 80px;
        height: 80px;
        color: white;
        filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.2));

        &.sunny-icon {
          animation: rotateSun 20s linear infinite;
        }

        &.cloudy-icon {
          animation: float 3s ease-in-out infinite;
        }

        &.rainy-icon {
          animation: rainDrop 2s ease-in-out infinite;
        }
      }
    }

    @keyframes rotateSun {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }

    @keyframes rainDrop {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(5px); }
    }

    .weather-details-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-2);
      margin: var(--space-3) 0;
    }

    .detail-card {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2);
      border-radius: var(--radius-lg);
      transition: all var(--transition-fast);

      &:hover {
        transform: translateY(-2px);
        background: rgba(255, 255, 255, 0.2);
      }

      mat-icon {
        font-size: 24px;
        width: 24px;
        height: 24px;
      }

      .detail-content {
        text-align: left;
      }

      .detail-label {
        font-size: var(--font-size-xs);
        opacity: 0.8;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .detail-value {
        font-family: var(--font-family-heading);
        font-size: var(--font-size-lg);
        font-weight: var(--font-weight-bold);
      }
    }

    // === FORECAST SECTION ===
    .forecast-heading {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      font-family: var(--font-family-heading);
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-text-primary);
      margin: var(--space-4) 0 var(--space-3);

      mat-icon {
        color: var(--color-primary);
      }
    }

    .forecast-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: var(--space-2);

      @media (max-width: 640px) {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    .forecast-card {
      position: relative;
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      padding: var(--space-3);
      text-align: center;
      box-shadow: var(--shadow-sm);
      transition: all var(--transition-base);
      border: 2px solid transparent;

      &:hover {
        transform: translateY(-4px);
        box-shadow: var(--shadow-lg);
        border-color: var(--color-primary);
      }

      &.today {
        border-color: var(--color-accent);
        background: linear-gradient(135deg, rgba(243, 204, 100, 0.1), transparent);

        .today-badge {
          position: absolute;
          top: -8px;
          right: -8px;
          background: var(--color-accent);
          color: var(--color-text-primary);
          font-family: var(--font-family-heading);
          font-size: var(--font-size-xs);
          font-weight: var(--font-weight-bold);
          padding: 4px 8px;
          border-radius: var(--radius-full);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
      }
    }

    .f-day {
      font-family: var(--font-family-heading);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-secondary);
      margin-bottom: var(--space-2);
    }

    .f-icon {
      margin: var(--space-2) 0;

      .weather-icon {
        font-size: 36px;
        width: 36px;
        height: 36px;
        color: var(--color-primary);

        &.sunny-icon {
          color: #FF8C42;
          animation: pulseGlow 3s ease-in-out infinite;
        }
      }
    }

    @keyframes pulseGlow {
      0%, 100% {
        filter: drop-shadow(0 0 2px rgba(255, 140, 66, 0.4));
      }
      50% {
        filter: drop-shadow(0 0 8px rgba(255, 140, 66, 0.8));
      }
    }

    .f-temp {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: var(--space-1);
      margin: var(--space-2) 0;

      .max {
        font-family: var(--font-family-heading);
        font-size: var(--font-size-lg);
        font-weight: var(--font-weight-bold);
        color: var(--color-text-primary);
      }

      .min {
        font-size: var(--font-size-base);
        color: var(--color-text-secondary);
      }
    }

    .temp-bar {
      width: 100%;
      height: 4px;
      background: var(--color-divider);
      border-radius: var(--radius-full);
      overflow: hidden;
      margin-top: var(--space-2);

      .temp-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
        border-radius: var(--radius-full);
        transition: width var(--transition-base);
      }
    }
  `]
})
export class WeatherComponent implements OnInit, OnDestroy {
  private dataService = inject(DataService);
  private showsDataService = inject(ShowsDataService);
  private weatherSubscription?: Subscription;
  private forecastSubscription?: Subscription;
  private parkHoursSubscription?: Subscription;
  private eventsSubscription?: Subscription;

  currentTemp: string | number = '--';
  currentHumidity: string | number = '--';
  forecast: ForecastItem[] = [];
  noticeText: string = '';
  parkHours: { open: string; close: string } | null = null;
  events: { name: string; date: string }[] = [];

  getWeatherClass(): string {
    if (!this.forecast.length) return 'default';
    const todayIcon = this.forecast[0]?.iconId || 50;
    if (todayIcon <= 54) return 'sunny';
    if (todayIcon > 54 && todayIcon <= 65) return 'cloudy';
    if (todayIcon > 65) return 'rainy';
    return 'default';
  }

  getWeatherCondition(): string {
    if (!this.forecast.length) return 'Checking conditions...';
    const todayIcon = this.forecast[0]?.iconId || 50;
    if (todayIcon <= 54) return 'Sunny';
    if (todayIcon > 54 && todayIcon <= 65) return 'Partly Cloudy';
    if (todayIcon > 65) return 'Rainy';
    return 'Pleasant';
  }

  getWeatherAdvice(): string {
    if (!this.forecast.length) return 'Have a magical day!';
    const todayIcon = this.forecast[0]?.iconId || 50;
    if (todayIcon <= 54) return 'Perfect day for the park! ☀️';
    if (todayIcon > 54 && todayIcon <= 65) return 'Great weather for outdoor attractions! ⛅';
    if (todayIcon > 65) return 'Indoor shows recommended. Bring an umbrella! 🌧️';
    return 'Have a magical day! ✨';
  }

  getTempPercentage(max: number, min: number): number {
    // Normalize temperature range (assuming 15-35°C is the typical range)
    const range = 35 - 15;
    const avgTemp = (max + min) / 2;
    return Math.min(100, Math.max(0, ((avgTemp - 15) / range) * 100));
  }

  getJapaneseDayName(dayAbbrev: string): string {
    const dayMap: { [key: string]: string } = {
      'Mon': '月',
      'Tue': '火',
      'Wed': '水',
      'Thu': '木',
      'Fri': '金',
      'Sat': '土',
      'Sun': '日'
    };
    return dayMap[dayAbbrev] || dayAbbrev;
  }

  ngOnInit() {
    this.loadNotice();

    this.parkHoursSubscription = this.showsDataService.getParkHours().subscribe({
      next: (hours) => { this.parkHours = hours; },
      error: (error) => { console.error('Error loading park hours:', error); }
    });

    this.eventsSubscription = this.showsDataService.getEvents().subscribe({
      next: (events) => { this.events = events; },
      error: (error) => { console.error('Error loading events:', error); }
    });

    this.weatherSubscription = this.dataService.getCurrentWeather().subscribe({
      next: (res) => {
        const place = res.temperature?.data?.find((p) => p.place === "Penny's Bay") || res.temperature?.data?.[0];
        if (place?.value !== undefined && place.value !== null) {
          this.currentTemp = place.value;
        }
        if (res.humidity?.data?.[0]?.value !== undefined && res.humidity.data[0].value !== null) {
          this.currentHumidity = res.humidity.data[0].value;
        }
      },
      error: (error) => {
        console.error('Error loading current weather:', error);
      }
    });

    this.forecastSubscription = this.dataService.getWeatherForecast().subscribe({
      next: (res) => {
        if (res.weatherForecast && Array.isArray(res.weatherForecast)) {
          this.forecast = res.weatherForecast
            .filter((d) => d.week && d.forecastMintemp?.value !== undefined && d.forecastMaxtemp?.value !== undefined)
            .map((d) => ({
              week: d.week.slice(0, 3),
              min: d.forecastMintemp.value,
              max: d.forecastMaxtemp.value,
              iconId: d.ForecastIcon || 50
            }))
            .slice(0, 7);
        }
      },
      error: (error) => {
        console.error('Error loading weather forecast:', error);
      }
    });
  }

  loadNotice() {
    this.showsDataService.getNotices().subscribe({
      next: (notices) => {
        this.noticeText = notices.weather;
      },
      error: (error) => {
        console.error('Error loading weather notice:', error);
      }
    });
  }

  ngOnDestroy() {
    if (this.weatherSubscription) {
      this.weatherSubscription.unsubscribe();
    }
    if (this.forecastSubscription) {
      this.forecastSubscription.unsubscribe();
    }
    if (this.parkHoursSubscription) {
      this.parkHoursSubscription.unsubscribe();
    }
    if (this.eventsSubscription) {
      this.eventsSubscription.unsubscribe();
    }
  }
}

// --- 3. SHOW COMPONENT (extracted to separate file) ---
// Moved to: src/app/components/show/show.component.ts

// --- 4. MAIN APP COMPONENT ---
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, MatToolbarModule, MatIconModule, TransportComponent, WeatherComponent, ShowComponent],
  template: `
    <mat-toolbar class="header">
      <span>HKDL ResortNow by Emporium</span>
      <span class="spacer"></span>
      <a href="https://lit.link/ja/hkemporium" target="_blank" rel="noopener noreferrer" class="return-link">
        <mat-icon>arrow_back</mat-icon>
        <span>lit.linkに戻る</span>
      </a>
    </mat-toolbar>

    <div class="content">
      @if (activeTab === 0) {
        <app-weather></app-weather>
      }
      @if (activeTab === 1) {
        <app-transport></app-transport>
      }
      @if (activeTab === 2) {
        <app-show></app-show>
      }
    </div>

    <div class="bottom-nav">
      <div class="nav-item" [class.active]="activeTab === 0" (click)="activeTab = 0">
        <mat-icon>info</mat-icon><span>本日のパーク・天気</span>
      </div>
      <div class="nav-item" [class.active]="activeTab === 1" (click)="activeTab = 1">
        <mat-icon>directions_transit</mat-icon><span>交通情報</span>
      </div>
      <div class="nav-item" [class.active]="activeTab === 2" (click)="activeTab = 2">
        <mat-icon>schedule</mat-icon><span>ショースケジュール</span>
      </div>
    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100vh; }
    .header {
      position: sticky; top: 0; z-index: 100;
      display: flex; align-items: center;
      background: color-mix(in oklab, var(--color-primary) 55%, transparent);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border-bottom: 1px solid rgba(255, 255, 255, 0.18);
      box-shadow: 0 6px 24px rgba(105, 14, 127, 0.18);
      color: #fff;
      font-weight: 600;
      letter-spacing: 0.005em;
    }
    .spacer { flex: 1; }
    .return-link {
      display: flex; align-items: center; gap: 6px;
      color: #1f2937; text-decoration: none; font-size: 14px; font-weight: 600;
      padding: 6px 12px; border-radius: 999px;
      transition: transform var(--transition-fast), background-color var(--transition-fast);
      background-color: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(10px);
      &:hover { background-color: #ffffff; color: #000; }
      &:active { transform: scale(0.96); }
      mat-icon { font-size: 20px; width: 20px; height: 20px; }
    }
    .content {
      flex: 1;
      overflow-y: auto;
      background: #FAFAFA;
      // Scroll-edge fade under the sticky header (§12 — no hard divider)
      mask-image: linear-gradient(to bottom, transparent 0, black 20px, black calc(100% - 20px), transparent);
      -webkit-mask-image: linear-gradient(to bottom, transparent 0, black 20px, black calc(100% - 20px), transparent);
    }
    .bottom-nav {
      position: fixed; bottom: 0; width: 100%; height: 80px;
      background: rgba(255, 255, 255, 0.72);
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      border-top: 1px solid rgba(0, 0, 0, 0.06);
      display: flex; justify-content: space-around;
      align-items: center; box-shadow: 0 -6px 20px rgba(0,0,0,0.05); z-index: 1000;
      padding: 6px;
      .nav-item {
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; color: #999; width: 100%; height: 100%;
        cursor: pointer;
        border-radius: 16px;
        transition: transform var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast);
        span { font-size: 11px; margin-top: 4px; letter-spacing: 0.01em; }
        mat-icon { transition: transform var(--transition-fast); }
        &.active {
          color: var(--color-primary);
          background: color-mix(in oklab, var(--color-primary) 12%, transparent);
          mat-icon { transform: translateY(-2px); }
        }
        &:active { transform: scale(0.96); }
      }
    }
  `]
})
export class AppComponent {
  activeTab = 0;
}
