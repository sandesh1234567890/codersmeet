# 🚀 Run Guide: P2P Video Meeting App

This guide will help you start the signaling server and the frontend application for local and mobile testing.

## 📋 Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed on your machine.

---

## 🛠️ Step 1: Install Dependencies
Open two terminals and install dependencies for both the server and the client.

**Terminal 1 (Server):**
```bash
cd server
npm install
```

**Terminal 2 (Client):**
```bash
cd client
npm install
```

---

## 🏃 Step 2: Start the Servers

### 1. Start the Signaling Server
In **Terminal 1**, run the signaling server:
```bash
cd server
node index.js
```
*The server will run on port `3040`.*

### 2. Start the Frontend (PC & Mobile Support)
In **Terminal 2**, run the Vite development server with the `--host` flag to allow mobile access:
```bash
cd client
npm run dev -- --host --port 5175
```

---

## 📱 Step 3: Access the App

### 💻 On your PC
Open your browser and navigate to:
[http://localhost:5175](http://localhost:5175)

### 🤳 On your Mobile (Same WiFi)
1. Look at the terminal output for **Terminal 2**.
2. Find the **Network URL** (e.g., `http://192.168.x.x:5175`).
3. Open that URL on your phone's browser.
4. Join the **SAME Room Key** as your PC!

---

## 💡 Pro Tips
- **Room-Based Privacy**: Only users with the exact same Room Key will connect to each other.
- **Delayed Permissions**: Camera/Mic permissions are only requested when you click the Mic/Video toggle buttons.
- **Screen Sharing**: Use the laptop icon to share your screen. It will replace your camera feed seamlessly.

## ⚠️ Troubleshooting
- **EADDRINUSE**: If you see this error, it means the port (3040 or 5175) is already being used. You can stop previous processes using Task Manager or by running:
  ```powershell
  Stop-Process -Id (Get-NetTCPConnection -LocalPort 3040).OwningProcess -Force
  ```
- **Mobile not connecting**: Ensure your phone is on the **same WiFi network** as your computer.
