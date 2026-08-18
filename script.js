let playlist = [];

let currentSongIndex = -1;

let isPlaying = false;

const audio = document.getElementById("audioPlayer");


// ================================
// SONGS
// ================================

const songs = [
    {
        title: "Song 1",
        artist: "My Artist",
        file: "https://res.cloudinary.com/dxpyotnwm/video/upload/v1784811312/Stormy_-_Camembert_.._MP3_x22qmy.mp3"
    }
];


// ================================
// PLAY SONG
// ================================

function playSong(index) {

    if (!songs[index]) return;

    currentSongIndex = index;

    const song = songs[index];

    audio.src = song.file;

    document.getElementById("currentTitle").textContent =
        song.title;

    document.getElementById("currentArtist").textContent =
        song.artist;

    audio.play();

    isPlaying = true;

    document.getElementById("mainPlay").textContent = "⏸";
}


// ================================
// PLAY / PAUSE
// ================================

function togglePlay() {

    if (!audio.src) {

        playSong(0);

        return;
    }

    if (audio.paused) {

        audio.play();

        isPlaying = true;

        document.getElementById("mainPlay").textContent = "⏸";

    } else {

        audio.pause();

        isPlaying = false;

        document.getElementById("mainPlay").textContent = "▶";
    }
}


// ================================
// NEXT
// ================================

function nextSong() {

    if (songs.length === 0) return;

    let next = currentSongIndex + 1;

    if (next >= songs.length) {
        next = 0;
    }

    playSong(next);
}


// ================================
// PREVIOUS
// ================================

function previousSong() {

    if (songs.length === 0) return;

    let previous = currentSongIndex - 1;

    if (previous < 0) {
        previous = songs.length - 1;
    }

    playSong(previous);
}


// ================================
// SKIP 10 SECONDS
// ================================

function skip(seconds) {

    audio.currentTime += seconds;
}


// ================================
// VOLUME
// ================================

document.getElementById("volume").addEventListener(
    "input",
    function () {

        audio.volume = this.value / 100;

    }
);


// ================================
// PROGRESS BAR
// ================================

audio.addEventListener("timeupdate", function () {

    const progress =
        document.getElementById("progress");

    if (!audio.duration) return;

    progress.value =
        (audio.currentTime / audio.duration) * 100;

    document.getElementById("currentTime").textContent =
        formatTime(audio.currentTime);

    document.getElementById("duration").textContent =
        formatTime(audio.duration);
});


// ================================
// CLICK PROGRESS BAR
// ================================

document.getElementById("progress").addEventListener(
    "input",
    function () {

        if (!audio.duration) return;

        audio.currentTime =
            (this.value / 100) * audio.duration;
    }
);


// ================================
// AUTO NEXT
// ================================

audio.addEventListener("ended", function () {

    nextSong();

});


// ================================
// TIME FORMAT
// ================================

function formatTime(seconds) {

    if (isNaN(seconds)) return "0:00";

    const minutes =
        Math.floor(seconds / 60);

    const secs =
        Math.floor(seconds % 60)
        .toString()
        .padStart(2, "0");

    return `${minutes}:${secs}`;
}