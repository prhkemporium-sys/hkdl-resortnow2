// Copy this file to environment.ts and environment.development.ts
// Fill in your Google Sheets API credentials

export const environment = {
  production: false, // Set to true for production build

  // Google Sheets API Key
  // Get from: https://console.cloud.google.com/apis/credentials
  // Create a restricted API key with:
  // - HTTP referrer: localhost:4200/* (for development)
  // - API restriction: Google Sheets API only
  googleSheetsApiKey: 'AIzaSyBbnFeEQcdUSRnEjn8qpPRjAKDclvtQjKE',

  // Google Sheets ID
  // Get from the URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit
  googleSheetsId: '1p1Lwp-x8stNNZLrvqBjLzC2YscyZQ7WbG-dgxF7Gg0Y',

  // Sheet range (assumes headers in row 1, data starts in row 2)
  // Expected columns: Date | Title | Time | Location | Duration | Description | WeatherDependent | Type | Badge
  googleSheetsRange: 'Data!A1:J100',

  // Cache duration in milliseconds
  // Development: 5 minutes, Production: 10 minutes
  cacheDurationMs: 5 * 60 * 1000,
};
