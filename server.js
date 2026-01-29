#!/usr/bin/env node

const OPAL_VERSION = '0.1.0';

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
  function startServer() {
    // just continue, rest of file will start server as normal
  }
  if (args.length > 0) {
    if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
      console.log(USAGE);
      process.exit(0);
    }
    if (args[0] === 'port' && args[1]) {
      process.env.PORT = args[1];
      // continue, rest of file will use process.env.PORT
    } else if (args[0] === 'run') {
      // continue, run is default
    } else if (args[0] !== 'run') {
      // Unknown command
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
var parameterize = require('parameterize');

var app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

var logFormat = "[:date[iso]] - :remote-addr - :method :url :status :response-time ms";
app.use(morgan(logFormat));

// Add middleware to log unique IP connections only once
const connectedIPs = new Set();
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!connectedIPs.has(ip)) {
    connectedIPs.add(ip);
    console.log(`IP ${ip} has connected`);
  }
  next();
});

// ===== Apple Music / iTunes API helpers =====
function getCurrentState() {
  var Music = Application('Music');
  var state = Music.playerState();
  var currentState = { player_state: state.toLowerCase() === 'stopped' ? 'idle' : state.toLowerCase() };

  if (state.toLowerCase() !== 'stopped') {
    var track = Music.currentTrack;
    
    // SAFE PLAYLIST HANDLING
    var playlistName = "Library/Stream";
    try {
      // When streaming, currentPlaylist often fails or returns null
      var playlist = Music.currentPlaylist;
      if (playlist) {
        playlistName = playlist.name();
      }
    } catch (e) {
      // Ignore error, fallback to default name
    }

    currentState.id = track.persistentID();
    currentState.name = track.name();
    currentState.artist = track.artist();
    currentState.album = track.album();
    currentState.playlist = playlistName;
    currentState.volume = Music.soundVolume();
    currentState.muted = Music.mute();
    currentState.repeat = Music.songRepeat();
    currentState.shuffle = Music.shuffleEnabled() ? Music.shuffleMode() : false;
    currentState.duration = track.duration();

    // Artwork handling inside 'osa' is difficult because we cannot easily require('fs').
    // We will leave artwork null here and let the specific /artwork endpoint handle images.
    currentState.artwork = '/artwork/current.jpg'; 
  }

  return currentState;
}

function sendResponse(error, res) {
  if (error) {
    console.log(error);
    res.sendStatus(500);
  } else {
    osa(getCurrentState, function (error, state) {
      if (error) {
        console.log(error);
        res.sendStatus(500);
      } else {
        res.json(state);
      }
    });
  }
}

// ===== Safe Player Controls =====
function playSong() { try { Application('Music').play(); return true; } catch(e){console.log(e); return false;} }
function pauseSong() { try { Application('Music').pause(); return true; } catch(e){console.log(e); return false;} }
function playPauseSong() { try { Application('Music').playpause(); return true; } catch(e){console.log(e); return false;} }
function stopSong() { try { Application('Music').stop(); return true; } catch(e){console.log(e); return false;} }
function nextSong() { try { Application('Music').nextTrack(); return true; } catch(e){console.log(e); return false;} }
function previousSong() { try { Application('Music').previousTrack(); return true; } catch(e){console.log(e); return false;} }

function setVolume(level) { try { if(level!=null){ Application('Music').soundVolume = parseInt(level); return true;} return false;} catch(e){console.log(e); return false;} }
function setMuted(muted) { try { if(muted!=null){ Application('Music').mute = muted; return true;} return false;} catch(e){console.log(e); return false;} }
function setShuffle(mode) { try { var Music = Application('Music'); if(!mode) mode='songs'; if(mode==='false'||mode==='off'){ Music.shuffleEnabled = false; return false;} else{ Music.shuffleEnabled=true; Music.shuffleMode=mode; return true;} } catch(e){console.log(e); return false;} }
function setRepeat(mode) { try { var Music = Application('Music'); if(!mode) mode='all'; if(mode==='false'||mode==='off'){ Music.songRepeat=false; return false;} else{ Music.songRepeat=mode; return true;} } catch(e){console.log(e); return false;} }

// ===== Playlists =====
function getPlaylistsFromMusic() {
  var Music = Application('Music');
  var playlists = Music.playlists();
  var results = [];
  playlists.forEach(function (pl) {
    var data = {};
    data.id = parameterize(pl.name());
    data.name = pl.name();
    data.loved = pl.loved();
    data.duration_in_seconds = pl.duration();
    data.time = pl.time();
    results.push(data);
  });
  return results;
}

function playPlaylist(id) {
  var Music = Application('Music');
  var playlists = Music.playlists;
  for (var i = 0; i < playlists.length; i++) {
    if (parameterize(playlists[i].name()) === id) {
      playlists[i].play();
      return true;
    }
  }
  return false;
}

function getPlaylists(callback) {
  osa(getPlaylistsFromMusic, function (error, data) {
    if (error) return callback(error);
    callback(null, data);
  });
}

// ===== Routes =====
app.get('/_ping', (req, res) => res.send('OK'));

// Player controls
app.put('/play', (req,res)=> osa(playSong,null,(e)=>sendResponse(e,res)));
app.put('/pause', (req,res)=> osa(pauseSong,null,(e)=>sendResponse(e,res)));
app.put('/playpause', (req,res)=> osa(playPauseSong,null,(e)=>sendResponse(e,res)));
app.put('/stop', (req,res)=> osa(stopSong,null,(e)=>sendResponse(e,res)));
app.put('/next', (req,res)=> osa(nextSong,null,(e)=>sendResponse(e,res)));
app.put('/previous', (req,res)=> osa(previousSong,null,(e)=>sendResponse(e,res)));

// Volume/shuffle/repeat
app.put('/volume', (req,res)=> osa(setVolume, req.body.level,(e)=>sendResponse(e,res)));
app.put('/mute', (req,res)=> osa(setMuted, req.body.muted,(e)=>sendResponse(e,res)));
app.put('/shuffle', (req,res)=> osa(setShuffle, req.body.mode,(e)=>sendResponse(e,res)));
app.put('/repeat', (req,res)=> osa(setRepeat, req.body.mode,(e)=>sendResponse(e,res)));

// Now playing
app.get('/now_playing', (req,res)=> sendResponse(null,res));

// Playlists endpoints
app.get('/playlists', (req,res)=>{
  getPlaylists((error,data)=>{
    if(error){console.log(error); res.sendStatus(500);}
    else res.json({playlists:data});
  });
});

app.put('/playlists/:id/play', (req,res)=>{
  osa(getPlaylistsFromMusic,function(error,data){
    if(error) return res.sendStatus(500);
    for(var i=0;i<data.length;i++){
      if(req.params.id===data[i].id){
        osa(function(id){ try{ playPlaylist(id); return true;} catch(e){return false;}}, data[i].id, (err)=>sendResponse(err,res));
        return;
      }
    }
    res.sendStatus(404);
  });
});

// AirPlay placeholders
app.get('/airplay_devices',(req,res)=>res.json({airplay_devices:[]}));
app.get('/airplay_devices/:id',(req,res)=>res.sendStatus(404));
app.put('/airplay_devices/:id/on',(req,res)=>res.sendStatus(501));
app.put('/airplay_devices/:id/off',(req,res)=>res.sendStatus(501));
app.put('/airplay_devices/:id/volume',(req,res)=>res.sendStatus(501));

// ===== Start server =====
// Serve artwork file
// Serve artwork directly from memory
app.get(['/artwork', '/artwork/current.jpg'], function(req, res) {
  const { exec } = require('child_process');

  // Script: Get raw data, do NOT write to file
  const script = `
    tell application "Music"
      if player state is stopped then return "stopped"
      try
        set trackArtworks to artworks of current track
        if (count of trackArtworks) is 0 then return "no_art"
        
        -- Get the raw data of the image
        set imgData to data of item 1 of trackArtworks
        
        -- Convert to HEX string for safe transport to Node
        -- (AppleScript often returns raw classes, this forces a string representation)
        return imgData as string
      on error
        return "error"
      end try
    end tell
  `;

  exec(`osascript -e '${script}'`, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
    if (err) {
      console.error('Artwork exec error:', err);
      return res.sendStatus(500);
    }

    const output = stdout.trim();

    if (output === 'stopped' || output === 'no_art' || output === 'error' || output === '') {
      // You could send a placeholder image here instead
      return res.status(404).send('No artwork available');
    }

    try {
      // AppleScript returns data in the format: «data playFFD8FFE0...*/»
      // We need to clean this up to get the raw Hex
      let hex = output;
      
      // Strip AppleScript data wrapper if present
      if (hex.includes('«data play')) {
        hex = hex.split('«data play')[1].split('»')[0];
      }
      
      // Remove any whitespace/newlines
      hex = hex.replace(/\s+/g, '');

      // Convert Hex to Buffer
      const imgBuffer = Buffer.from(hex, 'hex');

      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': imgBuffer.length
      });
      res.end(imgBuffer);
    } catch (e) {
      console.error('Error parsing artwork:', e);
      res.sendStatus(500);
    }
  });
});

// Dynamic artwork endpoint using AppleScript via execFile
const { execFile } = require('child_process');

app.get('/artwork', function(req, res) {
  const { exec } = require('child_process');
  const imgDir = require('path').join(__dirname, 'img');
  const artworkPath = require('path').join(imgDir, 'artwork.jpg');
  if (!require('fs').existsSync(imgDir)) require('fs').mkdirSync(imgDir);

  const script = `
    tell application "Music"
      if player state is stopped then
        return
      end if
      set trackArtworks to artworks of current track
      if (count of trackArtworks) is 0 then
        return
      end if
      set imgData to data of item 1 of trackArtworks
    end tell
    set outFile to open for access POSIX file "${artworkPath}" with write permission
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
    if (err) {
      console.log('Artwork script error:', err || stderr);
      return res.sendStatus(500);
    }
    res.type('image/jpeg');
    res.sendFile(artworkPath, (err) => {
      if (err) console.log('Error sending artwork file:', err);
    });
  });
});

const port = process.env.PORT || 8181;
app.listen(port, () => {
  const chalk = require('chalk');
  const gradient = require('gradient-string');
  const os = require('os');

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

  const interfaces = os.networkInterfaces();
  let localIp = 'localhost';
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIp = iface.address;
        break;
      }
    }
    if (localIp !== 'localhost') break;
  }

  console.log(`opal-js is running on port ${(port)}`);
  console.log(`host ip: ${(localIp)}`);
});
