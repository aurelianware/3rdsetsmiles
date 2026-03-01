# 3rd Set Smiles — Azure Static Web Apps Deployment

## Project Structure

```
├── .github/
│   └── workflows/
│       └── azure-static-web-apps.yml   # CI/CD pipeline
├── app/
│   ├── index.html                      # Main site (renamed from 3rdSetSmiles_Website.html)
│   ├── staticwebapp.config.json        # Routing, headers, security, caching
│   ├── robots.txt                      # SEO crawler rules
│   └── sitemap.xml                     # SEO sitemap
└── README.md
```

## Quick Start: Deploy in ~10 Minutes

### Option A: Azure Portal + GitHub (Recommended)

1. **Push this repo to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial 3rd Set Smiles site"
   git remote add origin https://github.com/aurelianware/3rdsetsmiles.git
   git push -u origin main
   ```

2. **Create the Static Web App in Azure Portal**
   - Go to portal.azure.com → Create Resource → Static Web App
   - **Resource Group:** `rg-3rdsetsmiles`
   - **Name:** `3rdsetsmiles`
   - **Plan:** Free
   - **Region:** West US 2 (closest to Tempe, AZ)
   - **Source:** GitHub → authorize → select your repo
   - **Branch:** `main`
   - **Build Preset:** Custom
   - **App location:** `/app`
   - **API location:** (leave blank)
   - **Output location:** (leave blank)
   - Click **Review + Create**

   Azure auto-creates the GitHub Actions secret and triggers the first deploy.

3. **Set up custom domain**
   - In the Static Web App resource → Custom domains → Add
   - Add `www.3rdsetsmiles.com` (CNAME record)
   - Add `3rdsetsmiles.com` (root domain via alias/ALIAS record)
   - Free SSL certificates are provisioned automatically

### Option B: Azure CLI

```bash
# Login
az login

# Create resource group
az group create --name rg-3rdsetsmiles --location westus2

# Create the Static Web App
az staticwebapp create \
  --name 3rdsetsmiles \
  --resource-group rg-3rdsetsmiles \
  --source https://github.com/aurelianware/3rdsetsmiles \
  --branch main \
  --app-location "/app" \
  --login-with-github

# Add custom domain
az staticwebapp hostname set \
  --name 3rdsetsmiles \
  --resource-group rg-3rdsetsmiles \
  --hostname www.3rdsetsmiles.com
```

### Option C: SWA CLI (Local Dev + Deploy)

```bash
# Install
npm install -g @azure/static-web-apps-cli

# Local dev server (test before deploying)
swa start ./app

# Deploy directly (get token from Azure Portal → Static Web App → Manage deployment token)
swa deploy ./app --deployment-token <YOUR_TOKEN>
```

## What the Config Does

### staticwebapp.config.json

| Feature | Details |
|---------|---------|
| **Navigation Fallback** | SPA-style routing — all paths resolve to index.html |
| **Security Headers** | X-Frame-Options DENY, CSP, XSS protection, nosniff |
| **Caching** | HTML: no-cache (always fresh). Images/assets: 30-day immutable cache |
| **CSP Policy** | Locks down to self + Google Fonts + inline styles/scripts |
| **404 Handling** | Rewrites to index.html (single-page site) |

### GitHub Actions Workflow

- **Auto-deploys** on push to `main`
- **PR preview environments** — every PR gets a staging URL for review
- **Auto-cleanup** — staging environments are removed when PRs close

## DNS Configuration (at your registrar)

| Record Type | Host | Value |
|-------------|------|-------|
| CNAME | www | `<your-app>.azurestaticapps.net` |
| ALIAS/ANAME | @ | `<your-app>.azurestaticapps.net` |
| TXT | @ | Verification value from Azure Portal |

## Cost

**$0/month** on the Free tier, which includes:
- 100 GB bandwidth/month
- 2 custom domains
- Free SSL
- Global CDN edge nodes

The Standard tier ($9/month) adds: SLA, more bandwidth, Azure Functions API backend, and auth providers — worth considering if you add appointment booking later.

## Future Enhancements

When Matthew is ready to add server-side features:

1. **Contact/appointment form** → Add an `/api` folder with Azure Functions (Node.js or C#)
2. **Patient intake forms** → Azure Functions + Cosmos DB (HIPAA-eligible)
3. **Analytics** → Add Plausible or Fathom (privacy-respecting, no cookie banners needed)
4. **CDN tuning** → Upgrade to Standard tier for custom CDN rules
