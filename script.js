// ==========================================
// YOUTUBE API KEY
// ==========================================

const YOUTUBE_API_KEY = "AIzaSyB-Lr2vKBImIwBeizE0b2T63DHXAqp2ZwE";


// ==========================================
// VARIABLES & STORAGE
// ==========================================

let player = null;
let playerReady = false;
let currentIndex = -1;
let progressTimer = null;
let currentPlaylistName = "Favorites";
let songToAddToPlaylist = null;
let currentPlayingVideoId = null;

let isShuffle = false;
let isRepeat = false;
let isMuted = false;
let previousVolume = 100;
let currentFilter = "all";

// AUTHENTICATION & USER PLAYLISTS
let currentUser = localStorage.getItem("myMusicCurrentUser") || null;

// 🔴 هنا مسحنا الكود القديم ودرنا هادي خاوية حيت غاتعمر f loadUserPlaylists()
let playlists = {}; 


// ==========================================
// LOAD DATA & KEYBOARD SHORTCUTS ON START
// ==========================================

window.addEventListener("DOMContentLoaded", function () {
    checkAuthStatus(); // هادي هي اللي غاتشارجي الـ Playlists د اليوزر ديريكت
    setupKeyboardShortcuts();
});


// ==========================================
// AUTHENTICATION SYSTEM & USER PLAYLISTS
// ==========================================

// ==========================================
// USER PLAYLISTS STORAGE MANAGEMENT
// ==========================================

function loadUserPlaylists() {
    if (!currentUser) {
        playlists = {};
        return;
    }
    
    // Saret khass b kul User: myPlaylists_hamoda11 / myPlaylists_abdelhak22
    let userStorageKey = "myPlaylists_" + currentUser;
    
    let savedData = localStorage.getItem(userStorageKey);
    
    if (savedData) {
        playlists = JSON.parse(savedData);
    } else {
        // Ila kan account jdid, ndiro "Favorites" playlist khawya
        playlists = {
            "Favorites": []
        };
        // N-sjeloha ni3nan f localStorage باش t-thfad direct
        localStorage.setItem(userStorageKey, JSON.stringify(playlists));
    }

    currentPlaylistName = Object.keys(playlists)[0] || "Favorites";
    renderPlaylistTabs();
    displayPlaylist();
}

function savePlaylistsToStorage() {
    if (!currentUser) return;
    let userStorageKey = "myPlaylists_" + currentUser;
    localStorage.setItem(userStorageKey, JSON.stringify(playlists));
}


// ==========================================
// AUTHENTICATION SYSTEM
// ==========================================

function checkAuthStatus() {
    const authModal = document.getElementById("authModal");
    const userProfile = document.getElementById("userProfile");
    const usernameDisplay = document.getElementById("usernameDisplay");

    if (!currentUser) {
        if (authModal) authModal.style.setProperty("display", "flex", "important");
        if (userProfile) userProfile.style.display = "none";
        playlists = {};
        if (player && typeof player.pauseVideo === "function") {
            player.pauseVideo();
        }
    } else {
        if (authModal) authModal.style.setProperty("display", "none", "important");
        if (userProfile) {
            userProfile.style.display = "flex";
            if (usernameDisplay) usernameDisplay.textContent = currentUser;
        }

        // Load playlists specific to the current active user
        loadUserPlaylists();
    }
}

function handleSignup(event) {
    event.preventDefault();
    const user = document.getElementById("signupUser").value.trim();
    const pass = document.getElementById("signupPass").value.trim();

    if (!user || !pass) return showToast("Please fill all fields!", "error");

    let users = JSON.parse(localStorage.getItem("myMusicUsers")) || {};

    if (users[user]) {
        return showToast("Username already exists!", "error");
    }

    // Save User Credentials
    users[user] = { password: pass };
    localStorage.setItem("myMusicUsers", JSON.stringify(users));

    // Set Active User
    currentUser = user;
    localStorage.setItem("myMusicCurrentUser", currentUser);

    // Initialize & Save Empty Playlists for new user
    playlists = { "Favorites": [] };
    savePlaylistsToStorage();

    checkAuthStatus();
    showToast(`Account created! Welcome ${user} 🎉`);
}

function handleLogin(event) {
    event.preventDefault();
    const user = document.getElementById("loginUser").value.trim();
    const pass = document.getElementById("loginPass").value.trim();

    let users = JSON.parse(localStorage.getItem("myMusicUsers")) || {};

    if (!users[user] || users[user].password !== pass) {
        return showToast("Invalid username or password!", "error");
    }

    // Set Active User
    currentUser = user;
    localStorage.setItem("myMusicCurrentUser", currentUser);

    // Load Playlists of this logged in user
    checkAuthStatus();
    showToast(`Welcome back, ${user}! 👋`);
}

function handleLogout() {
    // Save state before logging out
    if (currentUser) {
        savePlaylistsToStorage();
    }

    currentUser = null;
    localStorage.removeItem("myMusicCurrentUser");
    playlists = {};
    
    checkAuthStatus();
    showToast("Logged out successfully");
}


// ==========================================
// SLEEP TIMER FUNCTIONS
// ==========================================

function toggleSleepMenu() {
    const menu = document.getElementById("sleepMenu");
    menu.classList.toggle("active");
}

function setSleepTimer(minutes) {
    cancelSleepTimer();

    remainingSleepTime = minutes * 60;
    const btn = document.getElementById("sleepTimerBtn");
    const badge = document.getElementById("timerBadge");

    btn.classList.add("active");
    badge.style.display = "block";
    badge.textContent = minutes + "m";

    showToast(`Sleep timer set for ${minutes} minutes 🌙`);
    toggleSleepMenu();

    sleepInterval = setInterval(() => {
        remainingSleepTime--;
        let minsLeft = Math.ceil(remainingSleepTime / 60);
        badge.textContent = minsLeft + "m";

        if (remainingSleepTime <= 0) {
            clearInterval(sleepInterval);
            if (player && typeof player.pauseVideo === "function") {
                player.pauseVideo();
            }
            cancelSleepTimer();
            showToast("Sleep timer finished. Music paused 😴", "error");
        }
    }, 1000);
}

function cancelSleepTimer() {
    if (sleepInterval) clearInterval(sleepInterval);
    if (sleepTimeout) clearTimeout(sleepTimeout);

    const btn = document.getElementById("sleepTimerBtn");
    const badge = document.getElementById("timerBadge");

    if (btn) btn.classList.remove("active");
    if (badge) {
        badge.style.display = "none";
        badge.textContent = "";
    }

    const menu = document.getElementById("sleepMenu");
    if (menu) menu.classList.remove("active");
}


// ==========================================
// KEYBOARD SHORTCUTS
// ==========================================

function setupKeyboardShortcuts() {
    document.addEventListener("keydown", function (event) {
        if (event.target.tagName === "INPUT") return;

        switch (event.code) {
            case "Space":
                event.preventDefault();
                togglePlay();
                break;
            case "ArrowRight":
                event.preventDefault();
                skip(10);
                break;
            case "ArrowLeft":
                event.preventDefault();
                skip(-10);
                break;
            case "ArrowUp":
                event.preventDefault();
                adjustVolume(10);
                break;
            case "ArrowDown":
                event.preventDefault();
                adjustVolume(-10);
                break;
            case "KeyM":
                event.preventDefault();
                toggleMute();
                break;
        }
    });
}


// ==========================================
// TOAST NOTIFICATION FUNCTION
// ==========================================

function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type === "error" ? "error" : ""}`;
    toast.innerHTML = `<i class="fa-solid ${type === "error" ? "fa-circle-exclamation" : "fa-circle-check"}"></i> ${message}`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}


// ==========================================
// YOUTUBE PLAYER READY
// ==========================================

function onYouTubeIframeAPIReady() {

    player = new YT.Player("youtubePlayer", {
        height: "1",
        width: "1",
        videoId: "",
        playerVars: {
            autoplay: 1,
            controls: 0,
            origin: window.location.origin
        },
        events: {
            onReady: function () {
                playerReady = true;
                console.log("YouTube Player Ready");
            },
            onStateChange: function (event) {
                const equalizer = document.getElementById("equalizer");
                if (event.data === YT.PlayerState.PLAYING) {
                    document.getElementById("mainPlay").innerHTML = '<i class="fa-solid fa-pause"></i>';
                    if (equalizer) equalizer.classList.add("active");
                    startProgress();
                    updateMediaSessionState("playing");
                } else if (event.data === YT.PlayerState.ENDED) {
                    if (equalizer) equalizer.classList.remove("active");
                    handleSongEnded();
                } else {
                    document.getElementById("mainPlay").innerHTML = '<i class="fa-solid fa-play"></i>';
                    if (equalizer) equalizer.classList.remove("active");
                    stopProgress();
                    updateMediaSessionState("paused");
                }
            }
        }
    });

}


// ==========================================
// MEDIA SESSION API (BACKGROUND PLAYBACK)
// ==========================================

function updateMediaSession(song) {
    if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title,
            artist: song.artist,
            album: "MyMusic Player",
            artwork: [
                { src: song.thumbnail, sizes: "512x512", type: "image/png" }
            ]
        });

        navigator.mediaSession.setActionHandler("play", () => togglePlay());
        navigator.mediaSession.setActionHandler("pause", () => togglePlay());
        navigator.mediaSession.setActionHandler("previoustrack", () => previousSong());
        navigator.mediaSession.setActionHandler("nexttrack", () => nextSong());
    }
}

function updateMediaSessionState(state) {
    if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = state;
    }
}


// ==========================================
// FILTERS & SEARCH YOUTUBE
// ==========================================

function setFilter(filterType, element) {
    currentFilter = filterType;
    document.querySelectorAll(".filter-btn").forEach(btn => btn.classList.remove("active"));
    element.classList.add("active");

    const input = document.getElementById("searchInput").value.trim();
    if (input) {
        searchYouTube();
    }
}

function searchEnter(event) {
    if (event.key === "Enter") {
        searchYouTube();
    }
}

async function searchYouTube() {

    const input = document.getElementById("searchInput");
    let query = input.value.trim();

    if (!query) {
        showToast("Write a song name first.", "error");
        return;
    }

    const results = document.getElementById("results");
    results.innerHTML = "<p style='color:#888;margin-top:20px'>Searching...</p>";

    let categoryParam = "";
    if (currentFilter === "music") {
        categoryParam = "&videoCategoryId=10";
    } else if (currentFilter === "podcasts") {
        query += " podcast";
    }

    try {

        const url =
            "https://www.googleapis.com/youtube/v3/search" +
            "?part=snippet" +
            "&maxResults=10" +
            "&type=video" +
            categoryParam +
            "&q=" + encodeURIComponent(query) +
            "&key=" + YOUTUBE_API_KEY;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            results.innerHTML = "<p style='color:red;margin-top:20px'>YouTube API Error: " + data.error.message + "</p>";
            return;
        }

        displayResults(data.items);

    } catch (error) {
        results.innerHTML = "<p style='color:red;margin-top:20px'>Search failed. Check your connection.</p>";
    }

}


function displayResults(items) {

    const results = document.getElementById("results");
    results.innerHTML = "";

    if (!items || items.length === 0) {
        results.innerHTML = "<p style='color:#888;margin-top:20px'>No results found.</p>";
        return;
    }

    items.forEach(item => {

        const videoId = item.id.videoId;
        const title = item.snippet.title;
        const channel = item.snippet.channelTitle;
        const thumbnail = item.snippet.thumbnails.medium.url;

        const song = document.createElement("div");
        song.className = "song";

        song.innerHTML = `
            <img src="${thumbnail}">

            <div class="song-info">
                <strong>${cleanText(title)}</strong>
                <span>${cleanText(channel)}</span>
            </div>

            <button class="add-btn" onclick='downloadAudio("${videoId}")' title="Download MP3">
                <i class="fa-solid fa-download"></i>
            </button>

            <button class="add-btn" onclick='openSelectPlaylistModal(${JSON.stringify({
                videoId: videoId,
                title: title,
                artist: channel,
                thumbnail: thumbnail
            })})'>
                <i class="fa-solid fa-plus"></i>
            </button>

            <button class="play-btn" onclick='playVideo(${JSON.stringify({
                videoId: videoId,
                title: title,
                artist: channel,
                thumbnail: thumbnail
            })})'>
                <i class="fa-solid fa-play"></i>
            </button>
        `;

        results.appendChild(song);

    });

}


// ==========================================
// DOWNLOAD FUNCTIONALITY
// ==========================================

function downloadAudio(videoId = null) {
    const idToDownload = videoId || currentPlayingVideoId;
    if (!idToDownload) {
        showToast("Select a song first!", "error");
        return;
    }

    showToast("Opening downloader... 🚀");

    const targetUrl = `https://loader.to/api/card/?url=https://www.youtube.com/watch?v=${idToDownload}`;

    const a = document.createElement("a");
    a.href = targetUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}


// ==========================================
// CREATE & MANAGE PLAYLISTS
// ==========================================

function openModal() {
    document.getElementById("playlistModal").style.display = "flex";
}

function closeModal() {
    document.getElementById("playlistModal").style.display = "none";
    document.getElementById("newPlaylistName").value = "";
}

function saveNewPlaylist() {
    const name = document.getElementById("newPlaylistName").value.trim();
    if (!name) return showToast("Enter playlist name!", "error");

    if (playlists[name]) {
        return showToast("Playlist already exists!", "error");
    }

    playlists[name] = [];
    savePlaylistsToStorage();
    currentPlaylistName = name;
    renderPlaylistTabs();
    displayPlaylist();
    closeModal();
    showToast(`Playlist "${name}" created! ❤️`);
}

function savePlaylistsToStorage() {
    localStorage.setItem("myPlaylists", JSON.stringify(playlists));
}

function renderPlaylistTabs() {
    const tabsContainer = document.getElementById("playlistTabs");
    if (!tabsContainer) return;
    tabsContainer.innerHTML = "";

    Object.keys(playlists).forEach(name => {
        const btn = document.createElement("button");
        btn.className = `tab-btn ${name === currentPlaylistName ? 'active' : ''}`;
        btn.textContent = name;
        btn.onclick = () => {
            currentPlaylistName = name;
            renderPlaylistTabs();
            displayPlaylist();
        };
        tabsContainer.appendChild(btn);
    });
}


// ==========================================
// ADD TO PLAYLIST MODAL WITH BUTTONS
// ==========================================

function openSelectPlaylistModal(song) {
    const names = Object.keys(playlists);
    if (names.length === 0) {
        showToast("Create a playlist first!", "error");
        return;
    }

    songToAddToPlaylist = song;
    const container = document.getElementById("playlistButtonsContainer");
    container.innerHTML = "";

    names.forEach(name => {
        const btn = document.createElement("button");
        btn.className = "playlist-select-btn";
        btn.textContent = name;
        btn.onclick = () => selectPlaylistAndAdd(name);
        container.appendChild(btn);
    });

    document.getElementById("addToPlaylistModal").style.display = "flex";
}

function closeSelectPlaylistModal() {
    document.getElementById("addToPlaylistModal").style.display = "none";
    songToAddToPlaylist = null;
}

function selectPlaylistAndAdd(targetPlaylist) {
    if (!songToAddToPlaylist) return;

    const exists = playlists[targetPlaylist].some(item => item.videoId === songToAddToPlaylist.videoId);

    if (exists) {
        showToast(`Already in "${targetPlaylist}"!`, "error");
        return;
    }

    playlists[targetPlaylist].push(songToAddToPlaylist);
    savePlaylistsToStorage();

    if (currentPlaylistName === targetPlaylist) {
        displayPlaylist();
    }

    closeSelectPlaylistModal();
    showToast(`Added to "${targetPlaylist}" ❤️`);
}

function displayPlaylist() {
    const container = document.getElementById("playlist");
    if (!container) return;
    container.innerHTML = "";

    const activeList = playlists[currentPlaylistName] || [];

    if (activeList.length === 0) {
        container.innerHTML = `<p style='color:#777;margin-top:20px'>Playlist "${currentPlaylistName}" is empty ❤️</p>`;
        return;
    }

    activeList.forEach((song, index) => {

        const item = document.createElement("div");
        item.className = "playlist-item";

        item.innerHTML = `
            <img src="${song.thumbnail}">

            <div class="playlist-info">
                <strong>${cleanText(song.title)}</strong>
                <br>
                <small style="color:#888">${cleanText(song.artist)}</small>
            </div>

            <button class="play-btn" onclick='downloadAudio("${song.videoId}")' title="Download MP3">
                <i class="fa-solid fa-download"></i>
            </button>

            <button class="play-btn" onclick="playPlaylistSong(${index})">
                <i class="fa-solid fa-play"></i>
            </button>

            <button class="remove-btn" onclick="removeFromPlaylist(${index})">
                Remove
            </button>
        `;

        container.appendChild(item);

    });
}

function removeFromPlaylist(index) {
    playlists[currentPlaylistName].splice(index, 1);
    savePlaylistsToStorage();
    displayPlaylist();
    showToast("Removed from playlist");
}


// ==========================================
// PLAYBACK CONTROLS
// ==========================================

function toggleShuffle() {
    isShuffle = !isShuffle;
    const btn = document.getElementById("shuffleBtn");
    if (btn) btn.classList.toggle("active-control", isShuffle);
    showToast(isShuffle ? "Shuffle ON" : "Shuffle OFF");
}

function toggleRepeat() {
    isRepeat = !isRepeat;
    const btn = document.getElementById("repeatBtn");
    if (btn) btn.classList.toggle("active-control", isRepeat);
    showToast(isRepeat ? "Repeat ON" : "Repeat OFF");
}

function handleSongEnded() {
    if (isRepeat) {
        if (player && typeof player.playVideo === "function") {
            player.playVideo();
        }
        return;
    }
    nextSong();
}

function playVideo(song) {

    if (!player || typeof player.loadVideoById !== "function") {
        showToast("Player is initializing...", "error");
        return;
    }

    currentPlayingVideoId = song.videoId;
    const currentList = playlists[currentPlaylistName] || [];
    currentIndex = currentList.findIndex(item => item.videoId === song.videoId);

    document.getElementById("currentTitle").textContent = song.title;
    document.getElementById("currentArtist").textContent = song.artist;
    document.getElementById("currentImage").src = song.thumbnail;

    player.loadVideoById(song.videoId);
    updateMediaSession(song);

}

function playPlaylistSong(index) {
    const activeList = playlists[currentPlaylistName] || [];
    if (!activeList[index]) return;
    currentIndex = index;
    playVideo(activeList[index]);
}

function togglePlay() {
    if (!player || typeof player.getPlayerState !== "function") return;
    const state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
        player.pauseVideo();
    } else {
        player.playVideo();
    }
}

function nextSong() {
    const activeList = playlists[currentPlaylistName] || [];
    if (activeList.length === 0) return;

    let next = currentIndex;

    if (isShuffle) {
        next = Math.floor(Math.random() * activeList.length);
    } else {
        next = currentIndex + 1;
        if (next >= activeList.length) next = 0;
    }

    playPlaylistSong(next);
}

function previousSong() {
    const activeList = playlists[currentPlaylistName] || [];
    if (activeList.length === 0) return;

    let previous = currentIndex - 1;
    if (previous < 0) previous = activeList.length - 1;

    playPlaylistSong(previous);
}

function skip(seconds) {
    if (!player || typeof player.getCurrentTime !== "function") return;
    const current = player.getCurrentTime();
    player.seekTo(Math.max(0, current + seconds), true);
}

function changeVolume() {
    if (!player || typeof player.setVolume !== "function") return;
    const value = document.getElementById("volume").value;
    player.setVolume(Number(value));

    const icon = document.getElementById("volumeIcon");
    if (icon) {
        if (value == 0) {
            icon.className = "fa-solid fa-volume-xmark";
        } else {
            icon.className = "fa-solid fa-volume-high";
        }
    }
}

function adjustVolume(amount) {
    const slider = document.getElementById("volume");
    if (!slider) return;
    let val = Math.min(100, Math.max(0, Number(slider.value) + amount));
    slider.value = val;
    changeVolume();
}

function toggleMute() {
    const slider = document.getElementById("volume");
    if (!slider) return;
    if (isMuted) {
        slider.value = previousVolume;
        isMuted = false;
    } else {
        previousVolume = slider.value;
        slider.value = 0;
        isMuted = true;
    }
    changeVolume();
}

function startProgress() {
    stopProgress();
    progressTimer = setInterval(() => {
        if (!player || typeof player.getCurrentTime !== "function") return;
        const current = player.getCurrentTime();
        const duration = player.getDuration();
        if (!duration) return;

        const percentage = (current / duration) * 100;
        const progressEl = document.getElementById("progress");
        if (progressEl) progressEl.value = percentage;
        document.getElementById("currentTime").textContent = formatTime(current);
        document.getElementById("duration").textContent = formatTime(duration);
    }, 500);
}

function stopProgress() {
    if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
    }
}

const progressInput = document.getElementById("progress");
if (progressInput) {
    progressInput.addEventListener("input", function () {
        if (!player || typeof player.seekTo !== "function") return;
        const duration = player.getDuration();
        if (!duration) return;
        const time = (this.value / 100) * duration;
        player.seekTo(time, true);
    });
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
    return minutes + ":" + secs;
}


// ==========================================
// NAVIGATION
// ==========================================

function showHome() {
    document.getElementById("homeSection").style.display = "block";
    document.getElementById("playlistSection").style.display = "none";

    const navHome = document.getElementById("navHome");
    const navPlaylist = document.getElementById("navPlaylist");
    if (navHome) navHome.classList.add("active");
    if (navPlaylist) navPlaylist.classList.remove("active");
}

function showPlaylist() {
    document.getElementById("homeSection").style.display = "none";
    document.getElementById("playlistSection").style.display = "block";

    const navHome = document.getElementById("navHome");
    const navPlaylist = document.getElementById("navPlaylist");
    if (navHome) navHome.classList.remove("active");
    if (navPlaylist) navPlaylist.classList.add("active");

    renderPlaylistTabs();
    displayPlaylist();
}

function cleanText(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}