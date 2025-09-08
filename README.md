# Opal (Apple Music API for Home Assistant)

Opal is a lightweight Node.js service that allows **Home Assistant’s iTunes integration** to work with **Apple Music on macOS**.  
It replicates the behaviour of [`itunes-api`](https://github.com/maddox/itunes-api), exposing track metadata, playback state, and album artwork over a simple HTTP API.

---

## ✨ Features
- Works with **Apple Music** (formerly iTunes) on macOS  
- Compatible with **Home Assistant’s iTunes integration**  
- Exposes:
  - Current track metadata (title, artist, album, duration, player state)
  - Album artwork (served as `.jpg`)  
- Simple REST API (`/now_playing` and `/artwork` endpoints)  

---

## 🚀 Installation

```bash
git clone https://github.com/neonxsl/opal-js.git
cd opal-js
npm install
npm start
```
