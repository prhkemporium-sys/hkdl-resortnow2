# HkdlResortnow

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 20.2.0.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Show Schedule Feature - Google Sheets Integration

The Show Schedule component now integrates with Google Sheets API to dynamically load show information for the next 7 days.

### Setup Instructions

#### 1. Create a Google Sheets Document

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Name it "HKDL Shows Schedule" (or any name you prefer)
3. Add these column headers in row 1:
   - **A**: Date (format: YYYY-MM-DD)
   - **B**: Show Title
   - **C**: Time (format: HH:MM)
   - **D**: Location
   - **E**: Duration
   - **F**: Description
   - **G**: Weather Dependent (TRUE/FALSE)
   - **H**: Show Type (nighttime/broadway/interactive/default)
   - **I**: Badge

4. Example data (starting in row 2):
   ```
   2026-01-21 | Momentous | 20:30 | Castle Hub | 20 mins | Nighttime Spectacular | TRUE | nighttime | Nighttime Show
   2026-01-21 | Festival of the Lion King | 12:30 | Adventureland | 30 mins | Broadway-style Musical | FALSE | broadway | Broadway Show
   ```

#### 2. Set Up Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (name it "HKDL Shows Schedule")
3. Enable the Google Sheets API:
   - Click "Enable APIs and Services"
   - Search for "Google Sheets API"
   - Click "Enable"
4. Create an API Key:
   - Go to "Credentials" in the left menu
   - Click "Create Credentials" → "API Key"
   - Choose "Restrict Key"
   - **API Restrictions**: Select "Google Sheets API"
   - **Key Restrictions**: Add "HTTP referrers" → `localhost:4200/*` (for development)
   - Copy and save the API Key

#### 3. Configure Environment Variables

1. Open `src/environments/environment.development.ts`
2. Replace the placeholders with your values:
   ```typescript
   export const environment = {
     production: false,
     googleSheetsApiKey: 'YOUR_API_KEY_HERE',
     googleSheetsId: 'YOUR_SHEET_ID_HERE', // Extract from: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit
     googleSheetsRange: 'Sheet1!A2:I',
     cacheDurationMs: 5 * 60 * 1000,
   };
   ```

3. Do the same for `src/environments/environment.ts` (production) with a 10-minute cache

#### 4. Share Your Google Sheet

1. Click "Share" in your Google Sheet
2. Set to "Anyone with the link can view" (or restrict as needed)
3. Copy the share link to verify it works

#### 5. Start the Development Server

```bash
ng serve
```

Navigate to the "Shows" tab (schedule icon) to see the live schedule from your Google Sheet.

### Features

- **Dynamic Data**: Shows load from Google Sheets API
- **7-Day View**: Displays shows for the next 7 days
- **Date Selection**: Click date buttons to view shows for a specific day
- **Type Filtering**: Filter by show type (All, Nighttime, Broadway, Interactive)
- **Countdown Timer**: Shows "Starts in Xh Ym" for upcoming shows (within 3 hours)
- **Weather Warnings**: Indicates if shows are weather-dependent
- **Caching**: Data cached for 5 min (dev) / 10 min (prod) to reduce API calls
- **Manual Refresh**: Click "Refresh Schedule" to immediately reload data
- **Responsive Design**: Mobile, tablet, and desktop optimized
- **Loading States**: Skeleton cards during data load
- **Error Handling**: User-friendly error messages with retry button
- **Empty States**: Friendly message when no shows available

### Troubleshooting

**Error: "Access denied. Check your API key and Sheet ID configuration"**
- Verify the API Key and Sheet ID are correct
- Ensure the Google Sheets API is enabled in Google Cloud Console
- Check that the sheet is shared with "Anyone with the link"

**Error: "Invalid date format"**
- Ensure dates in column A are in YYYY-MM-DD format

**Error: "Invalid time format"**
- Ensure times in column C are in HH:MM format (24-hour)

**No shows appearing**
- Check that data starts from row 2 (row 1 is headers)
- Verify the range is correctly set to `Sheet1!A2:I`
- Ensure dates are within the next 7 days from today

**Slow loading**
- First load requires API call. Subsequent loads use cache.
- Cache duration: 5 minutes (dev) or 10 minutes (prod)
- Click "Refresh Schedule" to clear cache and reload

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
