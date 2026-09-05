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

// New Features State
let isShuffle = false;
let isRepeat = false;
let currentFilter = "all"; // 'all', 'music', 'podcasts'

let playlists = JSON.parse(localStorage.getItem("myPlaylists")) || {
    "Favorites": []
};


// ==========================================
// LOAD DATA ON START
// ==========================================

window.addEventListener("DOMContentLoaded", function () {
    renderPlaylistTabs();
    displayPlaylist();
});


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
                if (event.data === YT.PlayerState.PLAYING) {
                    document.getElementById("mainPlay").innerHTML = '<i class="fa-solid fa-pause"></i>';
                    startProgress();
                } else if (event.data === YT.PlayerState.ENDED) {
                    handleSongEnded();
                } else {
                    document.getElementById("mainPlay").innerHTML = '<i class="fa-solid fa-play"></i>';
                    stopProgress();
                }
            }
        }
    });

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
        alert("Write a song name first.");
        return;
    }

    const results = document.getElementById("results");
    results.innerHTML = "<p style='color:#888;margin-top:20px'>Searching...</p>";

    // Apply Filter Logic
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
    if (!name) return alert("Enter playlist name!");

    if (playlists[name]) {
        return alert("Playlist already exists!");
    }

    playlists[name] = [];
    savePlaylistsToStorage();
    currentPlaylistName = name;
    renderPlaylistTabs();
    displayPlaylist();
    closeModal();
}

function savePlaylistsToStorage() {
    localStorage.setItem("myPlaylists", JSON.stringify(playlists));
}

function renderPlaylistTabs() {
    const tabsContainer = document.getElementById("playlistTabs");
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
        alert("Create a playlist first!");
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
        alert(`Already in "${targetPlaylist}"!`);
        return;
    }

    playlists[targetPlaylist].push(songToAddToPlaylist);
    savePlaylistsToStorage();

    if (currentPlaylistName === targetPlaylist) {
        displayPlaylist();
    }

    closeSelectPlaylistModal();
}

function displayPlaylist() {
    const container = document.getElementById("playlist");
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
}


// ==========================================
// PLAYBACK & SHUFFLE / REPEAT CONTROLS
// ==========================================

function toggleShuffle() {
    isShuffle = !isShuffle;
    const btn = document.getElementById("shuffleBtn");
    btn.classList.toggle("active-control", isShuffle);
}

function toggleRepeat() {
    isRepeat = !isRepeat;
    const btn = document.getElementById("repeatBtn");
    btn.classList.toggle("active-control", isRepeat);
}

function handleSongEnded() {
    if (isRepeat) {
        player.playVideo(); // Repeat same song
        return;
    }

    nextSong();
}

function playVideo(song) {

    if (!player || typeof player.loadVideoById !== "function") {
        alert("Player is initializing... Please wait 2 seconds and try again.");
        return;
    }

    const currentList = playlists[currentPlaylistName] || [];
    currentIndex = currentList.findIndex(item => item.videoId === song.videoId);

    document.getElementById("currentTitle").textContent = song.title;
    document.getElementById("currentArtist").textContent = song.artist;
    document.getElementById("currentImage").src = song.thumbnail;

    player.loadVideoById(song.videoId);

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
}

function startProgress() {
    stopProgress();
    progressTimer = setInterval(() => {
        if (!player || typeof player.getCurrentTime !== "function") return;
        const current = player.getCurrentTime();
        const duration = player.getDuration();
        if (!duration) return;

        const percentage = (current / duration) * 100;
        document.getElementById("progress").value = percentage;
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

document.getElementById("progress").addEventListener("input", function () {
    if (!player || typeof player.seekTo !== "function") return;
    const duration = player.getDuration();
    if (!duration) return;
    const time = (this.value / 100) * duration;
    player.seekTo(time, true);
});

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

    document.getElementById("navHome").classList.add("active");
    document.getElementById("navPlaylist").classList.remove("active");
}

function showPlaylist() {
    document.getElementById("homeSection").style.display = "none";
    document.getElementById("playlistSection").style.display = "block";

    document.getElementById("navHome").classList.remove("active");
    document.getElementById("navPlaylist").classList.add("active");
}

function cleanText(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}