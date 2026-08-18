// ==========================================
// YOUTUBE API KEY
// ==========================================

const YOUTUBE_API_KEY = "AIzaSyB-Lr2vKBImIwBeizE0b2T63DHXAqp2ZwE";


// ==========================================
// VARIABLES
// ==========================================

let player = null;

let playerReady = false;

let playlist = [];

let currentIndex = -1;

let progressTimer = null;


// ==========================================
// LOAD PLAYLIST
// ==========================================

const savedPlaylist =
    localStorage.getItem("myMusicPlaylist");

if (savedPlaylist) {
    playlist = JSON.parse(savedPlaylist);
}

window.addEventListener("DOMContentLoaded", function () {
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
            autoplay: 0,
            controls: 0
        },

        events: {

            onReady: function () {

                playerReady = true;

                console.log("YouTube Player Ready");

            },

            onStateChange: function (event) {

                if (event.data === YT.PlayerState.PLAYING) {

                    document.getElementById("mainPlay")
                        .textContent = "⏸";

                    startProgress();

                }

                else {

                    document.getElementById("mainPlay")
                        .textContent = "▶";

                    stopProgress();

                }

            }

        }

    });

}


// ==========================================
// SEARCH ENTER
// ==========================================

function searchEnter(event) {

    if (event.key === "Enter") {

        searchYouTube();

    }

}


// ==========================================
// SEARCH YOUTUBE
// ==========================================

async function searchYouTube() {

    const input =
        document.getElementById("searchInput");

    const query =
        input.value.trim();

    if (!query) {

        alert("Write a song name first.");

        return;
    }


    const results =
        document.getElementById("results");

    results.innerHTML =
        "<p style='color:#888;margin-top:20px'>Searching...</p>";


    try {

        const url =
            "https://www.googleapis.com/youtube/v3/search" +

            "?part=snippet" +

            "&maxResults=10" +

            "&type=video" +

            "&q=" +
            encodeURIComponent(query) +

            "&key=" +
            YOUTUBE_API_KEY;


        const response =
            await fetch(url);

        const data =
            await response.json();


        if (data.error) {

            console.log(data.error);

            results.innerHTML =
                "<p style='color:red;margin-top:20px'>" +
                "YouTube API Error: " +
                data.error.message +
                "</p>";

            return;
        }


        displayResults(data.items);


    } catch (error) {

        console.log(error);

        results.innerHTML =
            "<p style='color:red;margin-top:20px'>" +
            "Search failed. Check your internet connection." +
            "</p>";

    }

}


// ==========================================
// DISPLAY SEARCH RESULTS
// ==========================================

function displayResults(items) {

    const results =
        document.getElementById("results");

    results.innerHTML = "";


    if (!items || items.length === 0) {

        results.innerHTML =
            "<p style='color:#888;margin-top:20px'>" +
            "No results found." +
            "</p>";

        return;
    }


    items.forEach(item => {

        const videoId =
            item.id.videoId;

        const title =
            item.snippet.title;

        const channel =
            item.snippet.channelTitle;

        const thumbnail =
            item.snippet.thumbnails.medium.url;


        const song =
            document.createElement("div");

        song.className = "song";


        song.innerHTML = `

            <img src="${thumbnail}">

            <div class="song-info">

                <strong>
                    ${cleanText(title)}
                </strong>

                <span>
                    ${cleanText(channel)}
                </span>

            </div>

            <button
                class="add-btn"
                onclick='addToPlaylist(${JSON.stringify({
                    videoId: videoId,
                    title: title,
                    artist: channel,
                    thumbnail: thumbnail
                })})'>

                ＋

            </button>

            <button
                class="play-btn"
                onclick='playVideo(${JSON.stringify({
                    videoId: videoId,
                    title: title,
                    artist: channel,
                    thumbnail: thumbnail
                })})'>

                ▶

            </button>

        `;


        results.appendChild(song);

    });

}


// ==========================================
// PLAY VIDEO
// ==========================================

function playVideo(song) {

    if (!playerReady) {

        alert("Player is still loading. Try again.");

        return;
    }


    currentIndex =
        playlist.findIndex(
            item => item.videoId === song.videoId
        );


    document.getElementById("currentTitle")
        .textContent = song.title;

    document.getElementById("currentArtist")
        .textContent = song.artist;

    document.getElementById("currentImage")
        .src = song.thumbnail;


    player.loadVideoById(song.videoId);

}


// ==========================================
// PLAYLIST
// ==========================================

function addToPlaylist(song) {

    const exists =
        playlist.some(
            item => item.videoId === song.videoId
        );


    if (exists) {

        alert("Already in your playlist ❤️");

        return;
    }


    playlist.push(song);


    savePlaylist();

    displayPlaylist();

}


// ==========================================
// SAVE PLAYLIST
// ==========================================

function savePlaylist() {

    localStorage.setItem(
        "myMusicPlaylist",
        JSON.stringify(playlist)
    );

}


// ==========================================
// DISPLAY PLAYLIST
// ==========================================

function displayPlaylist() {

    const container =
        document.getElementById("playlist");

    container.innerHTML = "";


    if (playlist.length === 0) {

        container.innerHTML =
            "<p style='color:#777;margin-top:20px'>" +
            "Your playlist is empty ❤️" +
            "</p>";

        return;
    }


    playlist.forEach((song, index) => {

        const item =
            document.createElement("div");

        item.className =
            "playlist-item";


        item.innerHTML = `

            <img src="${song.thumbnail}">

            <div class="playlist-info">

                <strong>
                    ${cleanText(song.title)}
                </strong>

                <br>

                <small style="color:#888">
                    ${cleanText(song.artist)}
                </small>

            </div>

            <button
                class="play-btn"
                onclick="playPlaylistSong(${index})">

                ▶

            </button>

            <button
                class="remove-btn"
                onclick="removeFromPlaylist(${index})">

                Remove

            </button>

        `;


        container.appendChild(item);

    });

}


// ==========================================
// PLAY PLAYLIST SONG
// ==========================================

function playPlaylistSong(index) {

    if (!playlist[index]) return;

    currentIndex = index;

    playVideo(playlist[index]);

}


// ==========================================
// REMOVE
// ==========================================

function removeFromPlaylist(index) {

    playlist.splice(index, 1);

    savePlaylist();

    displayPlaylist();

}


// ==========================================
// PLAY / PAUSE
// ==========================================

function togglePlay() {

    if (!playerReady) return;


    const state =
        player.getPlayerState();


    if (state === YT.PlayerState.PLAYING) {

        player.pauseVideo();

    }

    else {

        player.playVideo();

    }

}


// ==========================================
// NEXT
// ==========================================

function nextSong() {

    if (playlist.length === 0) return;


    let next =
        currentIndex + 1;


    if (next >= playlist.length) {

        next = 0;

    }


    playPlaylistSong(next);

}


// ==========================================
// PREVIOUS
// ==========================================

function previousSong() {

    if (playlist.length === 0) return;


    let previous =
        currentIndex - 1;


    if (previous < 0) {

        previous = playlist.length - 1;

    }


    playPlaylistSong(previous);

}


// ==========================================
// SKIP
// ==========================================

function skip(seconds) {

    if (!playerReady) return;


    const current =
        player.getCurrentTime();


    player.seekTo(
        Math.max(0, current + seconds),
        true
    );

}


// ==========================================
// VOLUME
// ==========================================

function changeVolume() {

    if (!playerReady) return;


    const value =
        document.getElementById("volume").value;


    player.setVolume(
        Number(value)
    );

}


// ==========================================
// PROGRESS
// ==========================================

function startProgress() {

    stopProgress();


    progressTimer =
        setInterval(() => {

            if (!playerReady) return;


            const current =
                player.getCurrentTime();

            const duration =
                player.getDuration();


            if (!duration) return;


            const percentage =
                (current / duration) * 100;


            document.getElementById("progress")
                .value = percentage;


            document.getElementById("currentTime")
                .textContent =
                formatTime(current);


            document.getElementById("duration")
                .textContent =
                formatTime(duration);


        }, 500);

}


function stopProgress() {

    if (progressTimer) {

        clearInterval(progressTimer);

        progressTimer = null;

    }

}


// ==========================================
// PROGRESS CLICK
// ==========================================

document.getElementById("progress")
    .addEventListener("input", function () {

        if (!playerReady) return;


        const duration =
            player.getDuration();


        if (!duration) return;


        const time =
            (this.value / 100) * duration;


        player.seekTo(time, true);

    });


// ==========================================
// TIME FORMAT
// ==========================================

function formatTime(seconds) {

    if (!seconds || isNaN(seconds)) {

        return "0:00";

    }


    const minutes =
        Math.floor(seconds / 60);


    const secs =
        Math.floor(seconds % 60)
            .toString()
            .padStart(2, "0");


    return minutes + ":" + secs;

}


// ==========================================
// HOME
// ==========================================

function showHome() {

    document.getElementById("homeSection")
        .style.display = "block";

    document.getElementById("playlistSection")
        .style.display = "none";

}


// ==========================================
// PLAYLIST PAGE
// ==========================================

function showPlaylist() {

    document.getElementById("homeSection")
        .style.display = "none";

    document.getElementById("playlistSection")
        .style.display = "block";

}


// ==========================================
// CLEAN TEXT
// ==========================================

function cleanText(text) {

    const div =
        document.createElement("div");

    div.textContent = text;

    return div.innerHTML;

}