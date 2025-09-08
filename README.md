# Opal — Apple Music API for Home Assistant

**Opal** is a lightweight Node.js service that allows Home Assistant’s iTunes integration to work seamlessly with Apple Music on macOS. It replicates the behaviour of [`itunes-api`](https://github.com/maddox/itunes-api) and exposes track metadata, playback state, and album artwork through a straightforward HTTP API.

Designed with simplicity and reliability in mind, Opal enables Home Assistant users to monitor and control Apple Music without relying on third-party cloud services.

---

## ✨ Features
- Full compatibility with Apple Music (formerly iTunes) on macOS  
- Integrates smoothly with Home Assistant’s iTunes media player  
- Provides detailed track metadata:
  - Title, artist, album, and duration  
  - Playback state (playing, paused, stopped)  
  - Playlist information  
- Serves album artwork as `.jpg` via an HTTP endpoint  
- Exposes a simple REST API:
  - `/now_playing` — returns current track information  
  - `/artwork` — returns current track album artwork  
- Supports playback controls via API:
  - Play, pause, stop, next, previous track  
  - Volume adjustment, mute/unmute  
  - Shuffle and repeat modes  
- Lightweight and easy to deploy; runs entirely locally on macOS  

---

## 🚀 Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/neonxsl/opal-js.git
cd opal-js
npm install
npm start
```
To run Opal globally so that the opal-js command is available system-wide:
```bash
npm link
```
This allows you to start the server from anywhere using:
```bash
opal-js run
```

⸻

⚙️ CLI Options
```bash
opal-js [command]
```
Command	Description
run	Start the server (default)
port	Start the server on a specified port
help	Show the help menu with available commands

Example:
```bash
opal-js port 8181
```
This starts the server on port 8181 instead of the default port 8181.

⸻

🖥️ System Requirements
	•	macOS with Apple Music / iTunes installed
	•	Node.js v18+ recommended
	•	Home Assistant setup for iTunes integration (optional, for automation)

⸻

💡 Usage Example

Start the server:
```bash
opal-js run
```
Check the current track:
```bash
curl http://localhost:8181/now_playing
```
Fetch the album artwork:
```bash
curl http://localhost:8181/artwork --output artwork.jpg
```
Control playback:
```bash
curl -X PUT http://localhost:8181/pause
curl -X PUT -d '{"level":50}' http://localhost:8181/volume
```

⸻

📜 License

Opal is released under the MIT License. See LICENSE for details.
