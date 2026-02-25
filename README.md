# StatementGuard

**PTSTMT Validation Tools** — Aplikasi desktop untuk validasi file PTSTMT (Print Statement) kartu kredit BRI.

## Quick Install

```powershell
irm https://raw.githubusercontent.com/ridhanshr/StatementGuard/main/install.ps1 | iex
```

> Perintah di atas akan otomatis download dan jalankan installer versi terbaru.

## Fitur

- ✅ **Validation Results** — Cek NEW_BAL, AVL_CR_LIMIT, PT_SH_MIN_PAYMENT
- 📁 **Structure Validation** — Validasi kelengkapan record 01/02/03/04
- 🔢 **Sequence Check** — Cek urutan record per customer
- 💳 **Tot Payment Check** — Validasi total pembayaran vs transaksi CR
- 🔁 **Duplicate Detection** — Deteksi transaksi duplikat
- 💰 **Zero Amount Check** — Deteksi transaksi dengan amount nol
- 📅 **Posting Date Filter** — Filter transaksi di luar periode
- 📊 **Dashboard** — Ringkasan visual (metric cards, donut charts, module health table)
- ⚡ **Realtime Updates** — Data muncul langsung saat proses berjalan

## Struktur Project

```
StatementGuard/
├── electron/               # Electron main process
│   ├── main.js             # App entry & IPC handlers
│   └── preload.js          # Context bridge (renderer ↔ main)
├── renderer/               # Frontend (UI)
│   ├── index.html          # Main HTML
│   ├── css/styles.css      # Styles (light & dark mode)
│   ├── js/app.js           # App logic, dashboard, tables
│   └── assets/             # Logo dan gambar
├── src/                    # Python core
│   ├── core/validation.py  # Validation engine
│   └── utils/data_utils.py # Helper functions
├── config/
│   └── app_config.py       # Configuration
├── bridge.py               # Electron ↔ Python bridge
├── package.json            # Node dependencies & build config
├── requirements.txt        # Python dependencies
└── .gitignore
```

## Prasyarat (Development)

- [Node.js](https://nodejs.org/) v18+
- [Python](https://www.python.org/) 3.9+
- pip packages: `pip install -r requirements.txt`

## Cara Menjalankan (Development)

```bash
# Install Node dependencies
npm install

# Jalankan app
npm start
```

## Build Installer

```bash
# Build bridge.py menjadi standalone exe (tanpa perlu Python di target)
python -m PyInstaller --onefile --console --name bridge ^
  --distpath pyinstaller_dist ^
  --hidden-import src.core.validation ^
  --hidden-import src.utils.data_utils ^
  --paths . bridge.py

# Build Setup installer
npm run build
```

Output: `dist/StatementGuard-1.0.0-Setup.exe`

> **Note:** PC target TIDAK perlu install Python — sudah ter-bundle dalam bridge.exe.

## Tech Stack

| Layer    | Teknologi                      |
| -------- | ------------------------------ |
| Desktop  | Electron 28                    |
| Frontend | HTML + CSS + Vanilla JS        |
| Backend  | Python 3 (via bridge.exe/py)   |
| Build    | electron-builder + PyInstaller |
