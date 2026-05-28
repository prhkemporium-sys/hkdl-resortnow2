import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { interval, Subscription } from 'rxjs';
import { startWith, switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

interface TyphoonResponse {
  WTCSGNL?: {
    code?: string | null;
  };
}

@Component({
  selector: 'app-typhoon',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule],
  template: `
    <mat-card class="typhoon-card" [ngClass]="getTyphoonSeverityClass()">
      <mat-card-content>
        <div class="typhoon-content">
          <!-- Icon Section -->
          <div class="typhoon-icon-section">
            @if (signalLevel === 0) {
              <div class="signal-icon safe">
                <mat-icon>check_circle</mat-icon>
              </div>
            } @else {
              <div class="signal-icon warning" [class.pulse]="signalLevel >= 8">
                <span class="signal-badge">T{{ signalLevel }}</span>
              </div>
            }
          </div>

          <!-- Info Section -->
          <div class="typhoon-info">
            <div class="typhoon-title">
              <mat-icon class="title-icon">storm</mat-icon>
              <span>台風情報</span>
            </div>
            <div class="typhoon-message">{{ getMessage() }}</div>
            <div class="last-update">
              <mat-icon>schedule</mat-icon>
              <span>{{ lastUpdated | date:'HH:mm:ss' }}</span>
            </div>
          </div>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .typhoon-card {
      margin-bottom: var(--space-4);
      border-radius: var(--card-radius);
      box-shadow: var(--shadow-md);
      transition: all var(--transition-base);
      border-left: 4px solid var(--color-primary);

      &.safe {
        background: linear-gradient(135deg, #ecfdf5, #d1fae5);
        border-left-color: #10b981;
      }

      &.warning-low {
        background: linear-gradient(135deg, #fefce8, #fef3c7);
        border-left-color: #f59e0b;
      }

      &.warning-medium {
        background: linear-gradient(135deg, #fff7ed, #fed7aa);
        border-left-color: #f97316;
      }

      &.warning-high {
        background: linear-gradient(135deg, #fef2f2, #fecaca);
        border-left-color: #ef4444;
      }

      &.warning-severe {
        background: linear-gradient(135deg, #450a0a, #7c2d12);
        color: white;
        border-left-color: #7c0a02;

        .typhoon-message,
        .last-update,
        .typhoon-title {
          color: white;
        }

        .title-icon {
          color: #fca5a5;
        }
      }
    }

    .typhoon-content {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-1);

      @media (max-width: 640px) {
        flex-direction: column;
        text-align: center;
      }
    }

    .typhoon-icon-section {
      flex-shrink: 0;

      .signal-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 60px;
        height: 60px;
        border-radius: 50%;

        &.safe {
          background: linear-gradient(135deg, #10b981, #059669);

          mat-icon {
            font-size: 36px;
            width: 36px;
            height: 36px;
            color: white;
          }
        }

        &.warning {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          font-family: var(--font-family-heading);

          .signal-badge {
            font-size: 1.5rem;
            font-weight: 700;
            color: white;
          }

          &.pulse {
            animation: typhoonPulse 2s ease-in-out infinite;
          }
        }
      }
    }

    @keyframes typhoonPulse {
      0%, 100% {
        box-shadow: 0 0 20px rgba(239, 68, 68, 0.4);
        transform: scale(1);
      }
      50% {
        box-shadow: 0 0 40px rgba(239, 68, 68, 0.8);
        transform: scale(1.05);
      }
    }

    .typhoon-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);

      .typhoon-title {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        font-family: var(--font-family-heading);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-bold);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-secondary);

        .title-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
        }
      }

      .typhoon-message {
        font-size: var(--font-size-base);
        font-weight: var(--font-weight-medium);
        color: var(--color-text-primary);
        line-height: 1.4;
      }

      .last-update {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        font-size: var(--font-size-xs);
        color: var(--color-text-secondary);
        margin-top: var(--space-1);

        mat-icon {
          font-size: 14px;
          width: 14px;
          height: 14px;
        }
      }
    }
  `]
})
export class TyphoonComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private subscription?: Subscription;

  signalCode: string | null = null;
  signalLevel: number = 0;
  lastUpdated: Date = new Date();

  private readonly signalMessages: { [key: string]: string } = {
    'TC1': '台風早期注意報が発表中、屋外施設が休止の可能性あり',
    'TC3': '台風注意報が発表中、屋外施設がすべて休止',
    'TC8NE': '台風警報が発表中、パーク休園',
    'TC8SE': '台風警報が発表中、パーク休園',
    'TC8NW': '台風警報が発表中、パーク休園',
    'TC8SW': '台風警報が発表中、パーク休園',
    'TC9': '台風特別警報が発表中、パーク休園',
    'TC10': '台風特別警報が発表中、パーク休園'
  };

  ngOnInit(): void {
    // Fetch immediately, then every 5 minutes
    this.subscription = interval(300000) // 5 minutes
      .pipe(
        startWith(0),
        switchMap(() => this.fetchTyphoonData()),
        catchError(error => {
          console.error('Error fetching typhoon data:', error);
          return of(null);
        })
      )
      .subscribe(data => {
        if (data) {
          this.updateSignalData(data);
        }
      });
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private fetchTyphoonData() {
    return this.http.get<TyphoonResponse>(
      'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en'
    );
  }

  private updateSignalData(data: TyphoonResponse): void {
    this.signalCode = data?.WTCSGNL?.code || null;
    this.signalLevel = this.getSignalLevel(this.signalCode);
    this.lastUpdated = new Date();
  }

  private getSignalLevel(code: string | null): number {
    if (!code) return 0;
    if (code === 'TC1') return 1;
    if (code === 'TC3') return 3;
    if (code.startsWith('TC8')) return 8;
    if (code === 'TC9') return 9;
    if (code === 'TC10') return 10;
    return 0;
  }

  getMessage(): string {
    if (this.signalLevel === 0) {
      return '発表されていません、パーク通常通り運営';
    }
    return this.signalMessages[this.signalCode || ''] || '台風情報が発表中';
  }

  getTyphoonSeverityClass(): string {
    if (this.signalLevel === 0) return 'safe';
    if (this.signalLevel === 1) return 'warning-low';
    if (this.signalLevel === 3) return 'warning-medium';
    if (this.signalLevel === 8) return 'warning-high';
    if (this.signalLevel >= 9) return 'warning-severe';
    return 'safe';
  }
}
