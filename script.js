let playlist = [];

let currentSongIndex = -1;

let isPlaying = false;


// ================================
// ADD TO PLAYLIST
// ================================

function addToPlaylist(title, artist) {

    const exists = playlist.some(
        song => song.title === title
    );

    if (exists) {
        alert("Already in your playlist ❤️");
        return;
    }

    playlist.push({
        title: title,
        artist: artist
    });

    savePlaylist();

    displayPlaylist();
}


// ================================
// DISPLAY PLAYLIST
// ================================

function displayPlaylist() {

    const playlistElement =
        document.getElementById("playlist");

    playlistElement.innerHTML = "";

    if (playlist.length === 0) {

        playlistElement.innerHTML =
            "<p style='color:#777'>Your playlist is empty.</p>";

        return;
    }


    playlist.forEach((song, index) => {

        const item =
            document.createElement("div");

        item.className = "playlist-item";

        item.innerHTML = `

            <div>
                <strong>${song.title}</strong>
                <br>
                <small style="color:#888">
                    ${song.artist}
                </small>
            </div>

            <button
                class="play-btn"
                onclick="playPlaylistSong(${index})">
                ▶
            </button>

            <button
                class="remove-btn"
                onclick="removeSong(${index})">
                Remove
            </button>

        `;

        playlistElement.appendChild(item);
    });
}


// ================================
// REMOVE
// ================================

function removeSong(index) {

    playlist.splice(index, 1);

    savePlaylist();

    displayPlaylist();
}


// ================================
// SAVE
// ================================

function savePlaylist() {

    localStorage.setItem(
        "myPlaylist",
        JSON.stringify(playlist)
    );
}


// ================================
// LOAD
// ================================

function loadPlaylist() {

    const saved =
        localStorage.getItem("myPlaylist");

    if (saved) {

        playlist = JSON.parse(saved);

    }

    displayPlaylist();
}


// ================================
// PLAY SONG
// ================================

function playSong(title, artist) {

    document.getElementById("currentTitle")
        .textContent = title;

    document.getElementById("currentArtist")
        .textContent = artist;

    isPlaying = true;

    document.getElementById("mainPlay")
        .textContent = "⏸";
}


// ================================
// PLAY PLAYLIST SONG
// ================================

function playPlaylistSong(index) {

    currentSongIndex = index;

    const song = playlist[index];

    playSong(
        song.title,
        song.artist
    );
}


// ================================
// PLAY / PAUSE
// ================================

function togglePlay() {

    if (currentSongIndex === -1 &&
        playlist.length === 0) {

        return;
    }

    isPlaying = !isPlaying;

    document.getElementById("mainPlay")
        .textContent =
        isPlaying ? "⏸" : "▶";
}


// ================================
// NEXT
// ================================

function nextSong() {

    if (playlist.length === 0) return;

    currentSongIndex++;

    if (currentSongIndex >= playlist.length) {
        currentSongIndex = 0;
    }

    playPlaylistSong(currentSongIndex);
}


// ================================
// PREVIOUS
// ================================

function previousSong() {

    if (playlist.length === 0) return;

    currentSongIndex--;

    if (currentSongIndex < 0) {
        currentSongIndex = playlist.length - 1;
    }

    playPlaylistSong(currentSongIndex);
}


// ================================
// SKIP
// ================================

function skip(seconds) {

    console.log(
        "Skip:",
        seconds,
        "seconds"
    );

}


// ================================
// VOLUME
// ================================

document.getElementById("volume")
    .addEventListener("input", function () {

        console.log(
            "Volume:",
            this.value
        );

    });


// ================================
// START
// ================================

loadPlaylist();