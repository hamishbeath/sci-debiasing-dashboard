# SCI Debiasing Dashboard

Static dashboard for exploring how diversity weighting affects SCI scenario distributions, time-series summaries, and database composition.

## Live Site

Once GitHub Pages is enabled, the dashboard will be available at:

https://hamishbeath.github.io/sci-debiasing-dashboard/

## Repository Contents

- `index.html` - dashboard page.
- `styles.css` - dashboard styling.
- `dashboard.js` - browser-side dashboard logic.
- `dashboard_data.json` - generated data bundle used by the dashboard.

The dashboard is fully static and does not require a Python server once published.

## Updating The Dashboard

Regenerate `dashboard_data.json` in the source analysis repository, then copy the updated dashboard assets into this repository:

```bash
cp ../scenario_debiasing/sci/Dashboard/index.html .
cp ../scenario_debiasing/sci/Dashboard/styles.css .
cp ../scenario_debiasing/sci/Dashboard/dashboard.js .
cp ../scenario_debiasing/sci/Dashboard/dashboard_data.json .
git add .
git commit -m "Update dashboard"
git push
```

GitHub Pages will update after the push.

## GitHub Pages Setup

In the GitHub repository settings:

1. Open `Settings` > `Pages`.
2. Under `Build and deployment`, set `Source` to `Deploy from a branch`.
3. Select branch `main` and folder `/ (root)`.
4. Save.
