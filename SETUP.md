# Restlog — Setup Guide

## What you need
- Your GitHub account (alvarcreations)
- A free Supabase account (supabase.com)
- 10 minutes

---

## Step 1 — Supabase (database)

1. Go to supabase.com and create a free account
2. Click "New project", give it any name (e.g. "restlog"), choose any region, set a password
3. Wait ~1 minute for it to provision
4. Go to the **SQL Editor** tab on the left sidebar
5. Click **New query**
6. Open the file `supabase_setup.sql` from this folder, copy everything, paste it in, click **Run**
7. You should see "Success. No rows returned"
8. Go to **Settings → API** in the left sidebar
9. Copy two values:
   - **Project URL** (looks like https://xxxx.supabase.co)
   - **anon public** key (long string under "Project API keys")

---

## Step 2 — Add your keys

1. Open the file `js/config.js` in a text editor
2. Replace `YOUR_SUPABASE_URL` with your Project URL
3. Replace `YOUR_SUPABASE_ANON_KEY` with your anon key
4. Save the file

---

## Step 3 — GitHub Pages (hosting)

1. Go to github.com and sign in as alvarcreations
2. Click the **+** button → **New repository**
3. Name it exactly: `restlog`
4. Set it to **Public**
5. Click **Create repository**
6. On the next page, click **uploading an existing file**
7. Drag and drop ALL the files from this folder (index.html, css/, js/, manifest.json)
   - Make sure to upload the folders too, not just the files inside them
8. Click **Commit changes**
9. Go to **Settings → Pages** in your repo
10. Under "Source", select **Deploy from a branch**
11. Select branch: **main**, folder: **/ (root)**
12. Click **Save**
13. Wait ~2 minutes, then visit: **https://alvarcreations.github.io/restlog**

---

## Step 4 — Add to home screen (optional but recommended)

**On iPhone:**
- Open the URL in Safari
- Tap the Share button → "Add to Home Screen"
- It will appear as a proper app icon

**On Android:**
- Open in Chrome
- Tap the three dots → "Add to Home Screen"

**On desktop:**
- Chrome shows an install icon in the address bar
- Click it to install as a desktop app

---

## Your URL
https://alvarcreations.github.io/restlog

Bookmark this on both your phone and computer.
