# 🚀 BEGINNER'S POWER DEPLOY SCRIPT
# Run this script to prepare your code for the world!

Write-Host "--- P2P Meeting App: Global Deploy Prep ---" -ForegroundColor Cyan

# 1. Initialize Git if not already done
if (!(Test-Path .git)) {
    Write-Host "[1/3] Initializing Git..." -ForegroundColor Yellow
    git init
}

# 2. Add files and commit
Write-Host "[2/3] Staging your latest files..." -ForegroundColor Yellow
git add .
git commit -m "Deployment Ready: v4.0 with Focus Mode"

# 3. Instruction for the user
Write-Host ""
Write-Host "------------------------------------------------" -ForegroundColor Green
Write-Host "✅ YOUR CODE IS READY TO FLY!" -ForegroundColor Green
Write-Host "------------------------------------------------" -ForegroundColor Green
Write-Host "Now, simply follow these final 2 steps:"

Write-Host "1. Create a NEW repository on GitHub (https://github.com/new)" -ForegroundColor Magenta
Write-Host "2. Copy the 'push an existing repository' commands from GitHub and paste them here." -ForegroundColor Magenta
Write-Host "   (It looks like: git remote add origin ...)"

Write-Host ""
Write-Host "After you push, go to DEPLOY_GUIDE.md to finish on Render & Vercel!" -ForegroundColor Cyan
Write-Host "------------------------------------------------"
