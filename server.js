# BD Barry - Slack Bot Deployment Guide

## Overview
BD Barry is a Slack-native AI agent that helps CEOs manage sales pipelines, add contact notes, and set follow-up reminders via HubSpot integration.

**Commands:**
- `/pipeline-summary` - Fetch active deals from HubSpot
- `/add-note [email] [text]` - Add a note to a contact
- `/follow-up [email] [days]` - Set a follow-up reminder

---

## Step 1: Create a Slack App (5 minutes)

1. Go to https://api.slack.com/apps
2. Click **"Create New App"** → **"From scratch"**
3. **App name:** `BD Barry`
4. **Workspace:** Select `strategiotech`
5. Click **"Create App"**

### Configure OAuth & Permissions

6. In the left sidebar, click **"OAuth & Permissions"**
7. Scroll to **"Redirect URLs"** → Click **"Add New Redirect URL"**
8. Enter: `https://bd-barry.onrender.com/slack/oauth_redirect` (we'll update this after deployment)
9. Click **"Save URLs"**

10. Scroll to **"Scopes"** → **"Bot Token Scopes"** → Click **"Add an OAuth Scope"**
    - Add: `commands`, `chat:write`, `incoming-webhook`
11. Click **"Save"**

12. **Copy these values** (you'll need them in Step 3):
    - **Client ID** (under "App Credentials")
    - **Client Secret** (under "App Credentials")
    - **Signing Secret** (under "App Credentials")

### Enable Slash Commands

13. In the left sidebar, click **"Slash Commands"** → **"Create New Command"**
14. Create `/pipeline-summary`:
    - **Command:** `/pipeline-summary`
    - **Request URL:** `https://bd-barry.onrender.com/slack/commands`
    - **Description:** `Get a summary of active deals`
    - Click **"Save"**

15. Repeat for `/add-note`:
    - **Command:** `/add-note`
    - **Request URL:** `https://bd-barry.onrender.com/slack/commands`
    - **Description:** `Add a note to a contact`

16. Repeat for `/follow-up`:
    - **Command:** `/follow-up`
    - **Request URL:** `https://bd-barry.onrender.com/slack/commands`
    - **Description:** `Set a follow-up reminder`

### Enable Events

17. In the left sidebar, click **"Event Subscriptions"** → Toggle **"Enable Events"** ON
18. **Request URL:** `https://bd-barry.onrender.com/slack/commands`
19. Slack will verify the URL (it will fail now—that's OK, we'll fix it in Step 3)
20. Click **"Save Changes"**

---

## Step 2: Set Up Render Deployment (15 minutes)

### Create Render Account & App

1. Go to https://render.com and sign up (free tier works)
2. Click **"New +"** → **"Web Service"**
3. Select **"Build and deploy from a Git repository"**
4. Paste this GitHub repo URL: `https://github.com/your-repo-url` (see "GitHub Setup" below if you don't have one)
5. **Name:** `bd-barry`
6. **Environment:** `Node`
7. **Build Command:** `npm install`
8. **Start Command:** `node server.js`
9. **Instance Type:** Free (fine for MVP)
10. Click **"Create Web Service"**

### Add Environment Variables to Render

11. In the Render dashboard for your app, go to **"Environment"**
12. Add these variables:
    ```
    SLACK_CLIENT_ID=<paste from Slack app credentials>
    SLACK_CLIENT_SECRET=<paste from Slack app credentials>
    SLACK_SIGNING_SECRET=<paste from Slack app credentials>
    const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
    REDIRECT_URL=https://bd-barry.onrender.com
    PORT=3000
    ```
13. Click **"Save"**

### Get Your Render URL

14. Wait for the build to complete (2-3 minutes)
15. Copy your app URL: `https://bd-barry.onrender.com` (shown at the top)

---

## Step 3: Update Slack App with Render URL (5 minutes)

1. Go back to https://api.slack.com/apps → Select **BD Barry**
2. Click **"OAuth & Permissions"**
3. Update **"Redirect URLs"** to: `https://bd-barry.onrender.com/slack/oauth_redirect`
4. Click **"Save URLs"**

5. Click **"Slash Commands"** and edit each command:
   - Update **Request URL** to: `https://bd-barry.onrender.com/slack/commands`
   - Save each one

6. Click **"Event Subscriptions"**
   - Update **Request URL** to: `https://bd-barry.onrender.com/slack/commands`
   - Slack will verify it (should now show a green checkmark ✓)
   - Save

---

## Step 4: Install BD Barry in Your Workspace (2 minutes)

1. In the Slack app dashboard, click **"Install to Workspace"**
2. Review permissions → Click **"Allow"**
3. You should see: **"✅ BD Barry installed successfully!"**

---

## Step 5: Test the Bot (5 minutes)

In your Slack workspace (#general or any channel):

### Test 1: Pipeline Summary
```
/pipeline-summary
```
Should return active deals from HubSpot, or an error if the token is misconfigured.

### Test 2: Add Note
```
/add-note john@example.com Great meeting today, needs follow-up next week
```
Should confirm the note was added.

### Test 3: Follow-up
```
/follow-up jane@example.com 3
```
Should set a reminder for 3 days from now.

---

## Quick Reference: File Structure

```
bd-barry/
├── server.js (the main backend code)
├── package.json
├── .env (your secrets - NEVER commit this)
└── .gitignore (make sure .env is here)
```

### `package.json`
```json
{
  "name": "bd-barry",
  "version": "1.0.0",
  "description": "Slack bot for sales pipeline management",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "axios": "^1.6.0",
    "dotenv": "^16.3.1"
  }
}
```

### `.env` (keep locally, never commit)
```
SLACK_CLIENT_ID=your-client-id
SLACK_CLIENT_SECRET=your-client-secret
SLACK_SIGNING_SECRET=your-signing-secret
pat-na1-XXXXXXXXXXXXXXXXXXXX
REDIRECT_URL=https://bd-barry.onrender.com
PORT=3000
```

---

## Troubleshooting

### Bot not responding to slash commands
- Check Render logs: **"Logs"** tab in Render dashboard
- Verify slash commands are pointing to correct URL
- Restart the service in Render

### OAuth redirect returning 404
- Verify **Redirect URL** in Slack app matches Render URL exactly
- Make sure Render app is running (green status)

### HubSpot integration not working
- Test the token: `curl -H "Authorization: Bearer YOUR_TOKEN" https://api.hubapi.com/crm/v3/objects/deals`
- Check Render logs for error messages

### Slack signature verification failing
- Verify `SLACK_SIGNING_SECRET` is correct in `.env`
- Restart Render app after updating

---

## Next Steps (Optional Enhancements)

1. **Database:** Replace in-memory `tokenStore` with PostgreSQL or MongoDB
2. **Scheduled reminders:** Set up a task queue (Bull, Agenda) to trigger follow-up reminders
3. **Admin dashboard:** Add web UI to view pipeline and manage bot settings
4. **Slack home tab:** Add interactive dashboard with deal summaries
5. **Two-way sync:** Auto-update Slack messages when deals change in HubSpot

---

## Deployment Checklist

- [ ] Slack app created and configured
- [ ] OAuth redirect URL set in Slack app
- [ ] Slash commands created in Slack app
- [ ] Render account created
- [ ] Code deployed to Render
- [ ] Environment variables set in Render
- [ ] Render URL updated in Slack app
- [ ] BD Barry installed in strategiotech workspace
- [ ] `/pipeline-summary` tested
- [ ] `/add-note` tested
- [ ] `/follow-up` tested
- [ ] Verify HubSpot integration works (check logs if not)
