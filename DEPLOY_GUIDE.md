# 🚀 Zero-Friction Deployment Guide

To make your meeting app accessible globally and permanently, follow these simple steps.

---

## 🛰️ 1. Deploy the Signaling Server (Backend)
The backend requires a persistent Node.js environment. We recommend **Render.com** (Free & Easy).

1.  **Create a New Web Service** on [Render](https://render.com/).
2.  **Connect your GitHub Repository**.
3.  **Root Directory**: Set to `server`.
4.  **Runtime**: `Node`.
5.  **Build Command**: `npm install`.
6.  **Start Command**: `npm start`.
7.  **Environment Variables**: None needed.
8.  **Result**: You will get a URL like `https://your-app-name.onrender.com`.

---

## 🎨 2. Deploy the Frontend (Vercel)
The frontend is built with Vite and React.

1.  **Create a New Project** on [Vercel](https://vercel.com/).
2.  **Connect your GitHub Repository**.
3.  **Root Directory**: Set to `client`.
4.  **Environment Variables**:
    *   Add a variable named **`VITE_SIGNALING_URL`**.
    *   Value: Use your **Render URL** from Step 1 (e.g., `https://your-app-name.onrender.com`).
5.  **Install & Deploy**: Vercel will automatically detect Vite. Click **Deploy**.

---

## ⚡ 3. Instant Test (Temporary)
If you just want to test from your phone **Right Now**, I have started a tunnel for you:

*   **Public Signaling URL**: `https://public-flies-post.loca.lt`
*   **Bypass Info**: If prompted for a password by localtunnel, use your current public IP.

---

## 🛠️ Performance Tip
For production, consider adding a **TURN server** (like Twilio or Metered.ca) to the PeerJS configuration in `App.tsx` if you find that users behind restrictive corporate firewalls cannot connect.
