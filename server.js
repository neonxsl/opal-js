#!/usr/bin/env node

const OPAL_VERSION = '0.1.1';

// ===== CLI Handling for opal-js =====
if (require.main === module) {
  const args = process.argv.slice(2);
  const USAGE = `
opal-js [command]

Commands:
  run             Start the server (default)
  port <port>     Start the server on the given port
  help            Show this help
`;
  if (args.length > 0) {
    if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
      console.log(USAGE);
      process.exit(0);
    }
    if (args[0] === 'port' && args[1]) {
      process.env.PORT = args[1];
    } else if (args[0] === 'run') {
      // continue
    } else if (args[0] !== 'run') {
      console.log('Unknown command:', args[0]);
      console.log(USAGE);
      process.exit(1);
    }
  }
}

var fs = require('fs');
var path = require('path');
var express = require('express');
var bodyParser = require('body-parser');
var morgan = require('morgan');
var osa = require('osa');
var https = require('https');
var parameterize = require('parameterize');

// Ensure img directory exists locally (no /tmp/)
const ARTWORK_DIR = path.join(__dirname, 'img');
const ARTWORK_FILE = path.join(ARTWORK_DIR, 'artwork.jpg');
if (!fs.existsSync(ARTWORK_DIR)) {
    fs.mkdirSync(ARTWORK_DIR);
}

var app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/img', express.static(ARTWORK_DIR));

var logFormat = "[:date[iso]] - :remote-addr - :method :url :status :response-time ms";
app.use(morgan(logFormat));

const connectedIPs = new Set();
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!connectedIPs.has(ip)) {
    connectedIPs.add(ip);
    console.log(`IP ${ip} has connected`);
  }
  next();
});

function getCurrentState() {
  var Music = Application('Music');
  if (!Music.running()) return { player_state: 'stopped' };

  var state = Music.playerState();
  var currentState = { player_state: state.toLowerCase() === 'stopped' ? 'idle' : state.toLowerCase() };

  if (state.toLowerCase() !== 'stopped') {
    try {
        var track = Music.currentTrack;
        var playlistName = "Stream / Library";
        try { if (Music.currentPlaylist) playlistName = Music.currentPlaylist.name(); } catch (e) {}

        currentState.id = track.persistentID();
        currentState.name = track.name();
        currentState.artist = track.artist();
        currentState.album = track.album();
        currentState.playlist = playlistName;
        currentState.volume = Music.soundVolume();
        currentState.muted = Music.mute();
        currentState.repeat = Music.songRepeat();
        currentState.shuffle = Music.shuffleEnabled() ? Music.shuffleMode() : false;
        try { currentState.duration = track.duration(); } catch(e) { currentState.duration = 0; }
        currentState.artwork = null;

    } catch (trackError) {
        return { player_state: 'idle' };
    }
  }
  return currentState;
}

var lastPlayedId = null; 

function sendResponse(error, res) {
  if (error) {
    console.log(error);
    res.sendStatus(500);
    return;
  }

  osa(getCurrentState, function (err, state) {
    if (err) {
        console.log("JXA Error:", err);
        return res.status(500).json({ player_state: 'stopped' });
    }

    if (state.player_state === 'idle' || !state.artist || !state.name) {
        res.json(state);
        return;
    }

    // Cache check
    if (state.id === lastPlayedId && fs.existsSync(ARTWORK_FILE)) {
        state.artwork = '/artwork/current.jpg?t=' + lastPlayedId;
        res.json(state);
        return;
    }

    lastPlayedId = state.id;
    
    // 1. Clear old local artwork
    try { if (fs.existsSync(ARTWORK_FILE)) fs.unlinkSync(ARTWORK_FILE); } catch(e){}

    // 2. Fetch from iTunes API using Name, Artist, AND Album for accuracy
    var searchQuery = state.name + " " + state.artist;
    if (state.album && state.album.length > 0) {
        searchQuery += " " + state.album;
    }
    
    var url = "https://itunes.apple.com/search?term=" + encodeURIComponent(searchQuery) + "&entity=song&limit=1";

    https.get(url, (apiRes) => {
        var body = '';
        apiRes.on('data', chunk => body += chunk);
        apiRes.on('end', () => {
            try {
                var data = JSON.parse(body);
                // If no song found, try searching as an album instead
                if (data.resultCount === 0) {
                    url = "https://itunes.apple.com/search?term=" + encodeURIComponent(searchQuery) + "&entity=album&limit=1";
                    // Note: In a production environment, you'd wrap this in a helper function to avoid nesting
                }

                if (data.resultCount > 0) {
                    var artUrl = data.results[0].artworkUrl100.replace('100x100', '600x600');
                    var file = fs.createWriteStream(ARTWORK_FILE);
                    https.get(artUrl, function(imgRes) {
                        imgRes.pipe(file);
                        file.on('finish', function() {
                            file.close(() => {
                                state.artwork = '/artwork/current.jpg?t=' + Date.now();
                                res.json(state);
                            });
                        });
                    }).on('error', () => res.json(state));
                } else {
                    res.json(state);
                }
            } catch (e) {
                res.json(state);
            }
        });
    }).on('error', (e) => {
        res.json(state);
    });
  });
}

// ===== Player Controls =====
function playSong() { try { Application('Music').play(); return true; } catch(e){return false;} }
function pauseSong() { try { Application('Music').pause(); return true; } catch(e){return false;} }
function playPauseSong() { try { Application('Music').playpause(); return true; } catch(e){return false;} }
function stopSong() { try { Application('Music').stop(); return true; } catch(e){return false;} }
function nextSong() { try { Application('Music').nextTrack(); return true; } catch(e){return false;} }
function previousSong() { try { Application('Music').previousTrack(); return true; } catch(e){return false;} }
function setVolume(level) { try { Application('Music').soundVolume = parseInt(level); return true; } catch(e){return false;} }
function setMuted(muted) { try { Application('Music').mute = muted; return true; } catch(e){return false;} }

function getPlaylistsFromMusic() {
  var Music = Application('Music');
  return Music.playlists().map(pl => ({
    id: parameterize(pl.name()),
    name: pl.name(),
    loved: pl.loved(),
    duration_in_seconds: pl.duration(),
    time: pl.time()
  }));
}

// ===== Routes =====
app.get('/_ping', (req, res) => res.send('OK'));
app.put('/play', (req,res)=> osa(playSong,null,(e)=>sendResponse(e,res)));
app.put('/pause', (req,res)=> osa(pauseSong,null,(e)=>sendResponse(e,res)));
app.put('/playpause', (req,res)=> osa(playPauseSong,null,(e)=>sendResponse(e,res)));
app.put('/stop', (req,res)=> osa(stopSong,null,(e)=>sendResponse(e,res)));
app.put('/next', (req,res)=> osa(nextSong,null,(e)=>sendResponse(e,res)));
app.put('/previous', (req,res)=> osa(previousSong,null,(e)=>sendResponse(e,res)));
app.put('/volume', (req,res)=> osa(setVolume, req.body.level,(e)=>sendResponse(e,res)));
app.put('/mute', (req,res)=> osa(setMuted, req.body.muted,(e)=>sendResponse(e,res)));
app.get('/now_playing', (req,res)=> sendResponse(null,res));

app.get('/playlists', (req,res)=>{
  osa(getPlaylistsFromMusic, (error,data)=>{
    if(error) res.sendStatus(500);
    else res.json({playlists:data});
  });
});

// Artwork Serving from local img/ folder
app.get('/artwork/current.jpg', (req, res) => {
  if (fs.existsSync(ARTWORK_FILE)) {
    res.sendFile(ARTWORK_FILE);
  } else {
    res.status(404).send('Not found');
  }
});

// Local Extraction fallback (AppleScript)
app.get('/artwork', function(req, res) {
  const { exec } = require('child_process');
  const script = `
    tell application "Music"
      if player state is stopped then return
      set trackArtworks to artworks of current track
      if (count of trackArtworks) is 0 then return
      try
        set imgData to data of item 1 of trackArtworks
      on error
        return
      end try
    end tell
    set outFile to open for access POSIX file "${ARTWORK_FILE}" with write permission
    try
      set eof outFile to 0
      write imgData to outFile
      close access outFile
    on error errMsg
      try
        close access outFile
      end try
      error errMsg
    end try
  `;

  exec(`osascript -l AppleScript -e '${script.replace(/'/g, "\\'")}'`, (err, stdout, stderr) => {
    if (err) return res.sendStatus(500);
    res.type('image/jpeg');
    res.sendFile(ARTWORK_FILE);
  });
});

const port = process.env.PORT || 8181;
app.listen(port, () => {
  const gradient = require('gradient-string');
  const banner = `
 ██████╗ ██████╗  █████╗ ██╗     neonxsl   
██╔═══██╗██╔══██╗██╔══██╗██║     apple music API 
██║   ██║██████╔╝███████║██║     
██║   ██║██╔═══╝ ██╔══██║██║     
╚██████╔╝██║     ██║  ██║███████╗
 ╚═════╝ ╚═╝     ╚═╝  ╚═╝╚══════╝
   opal-js v${OPAL_VERSION}   
`;
  console.log(gradient.rainbow(banner));
  console.log(`opal-js is running on port ${port}`);
});
