# Mercury Dry Cleaners - Full-Stack Web Application

A premium, bespoke web application built for **Mercury Dry Cleaners** featuring a luxury customer landing page, an interactive pickup scheduler, a live status tracker, and an operations control dashboard for staff.

This app is styled with modern Vanilla CSS (using Outfit & Inter Google fonts, glassmorphism overlays, and micro-animations) and implements standard-based native form validations.

---

## 🌟 Key Features

1. **Luxury Landing Page (`index.html`)**: Beautiful, non-generic dark-themed design with smooth interactive elements detailing cleaning services.
2. **Concierge Pickup Scheduler**: A multi-step-styled booking form utilizing CSS `:user-invalid` pseudo-class bindings to defer error styling until field interaction (per modern web standards).
3. **Live Status Tracking (`track.html`)**: A visual, interactive stepper diagram mapping order states in real-time (Scheduled → Picked Up → In Cleaning → Garments Ready → Completed).
4. **Operations Dashboard (`admin.html`)**: A staff control panel secured by session-based authentication to manage, search, and update customer order states.
5. **Zero-Dependency Database**: Structured JSON file database seeded automatically on first run to ensure 100% build compatibility without native binary complications.

---

## 🔒 Operational Credentials

Access the operations dashboard by navigating to the **Staff Login** page or visiting `http://localhost:3000/admin-login.html`.

- **Username**: `admin`
- **Password**: `mercurydrycleaners123`

*Note: Passwords are encrypted on-disk using `bcryptjs`.*

---

## 🚀 Quick Start Guide

### 1. Open in VS Code
Open your terminal and navigate to the project directory, then launch VS Code:
```bash
code .
```

### 2. Install Dependencies
Install the required Node.js packages:
```bash
npm install
```

### 3. Start the Application
Run the local dev server (supporting automatic file watching):
```bash
npm run dev
```

### 4. Visit in Browser
Open your browser and navigate to:
**[http://localhost:3000](http://localhost:3000)**

---

## 🔗 Connecting to GitHub

Follow these commands in your VS Code terminal to initialize Git and push the project to your GitHub:

```bash
# 1. Initialize git local repository
git init

# 2. Stage all project files (will respect .gitignore)
git add .

# 3. Commit files
git commit -m "Initial commit: Mercury Dry Cleaners Web App"

# 4. Rename main branch
git branch -M main

# 5. Add your remote repository path (replace with your GitHub URL)
git remote add origin https://github.com/yourusername/mercury-dry-cleaners.git

# 6. Push code to remote
git push -u origin main
```
