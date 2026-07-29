/* ===========================
   ENTER BUTTON
=========================== */
const loader = document.getElementById("loader");

const website = document.getElementById("website");

const enter = document.getElementById("enter");


const music = document.getElementById("music");


enter.addEventListener("click", () => {


    loader.style.opacity = "0";

    setTimeout(() => {

        loader.style.display = "none";

        website.style.display = "block";

        document.body.style.overflowY = "auto";

        const player = document.getElementById("player");

        const playBtn = document.getElementById("playBtn");

        player.play().then(() => {

            playBtn.innerHTML = "❚❚";

        }).catch(err => console.log(err));

    },700);

}); 

/* ===========================
   NAVBAR SCROLL
=========================== */

const header = document.querySelector("header");

window.addEventListener("scroll", () => {

    if (window.scrollY > 50) {

        header.classList.add("scrolled");

    } else {

        header.classList.remove("scrolled");

    }

});

/* ===========================
   FADE ANIMATION
=========================== */

const observer = new IntersectionObserver((entries) => {

    entries.forEach(entry => {

        if (entry.isIntersecting) {

            entry.target.classList.add("show");

        }

    });

});

document.querySelectorAll("section").forEach(section => {

    section.classList.add("fade");

    observer.observe(section);

});

/* ===========================
   CURSOR GLOW
=========================== */

const glow = document.createElement("div");

glow.className = "cursor-glow";

document.body.appendChild(glow);

document.addEventListener("mousemove", e => {

    glow.style.left = e.clientX + "px";

    glow.style.top = e.clientY + "px";

});

/* ===========================
   SMOOTH BUTTONS
=========================== */

document.querySelectorAll("a").forEach(link => {

    link.addEventListener("click", e => {

        const href = link.getAttribute("href");

        if (href.startsWith("#")) {

            e.preventDefault();

            document.querySelector(href).scrollIntoView({

                behavior: "smooth"

            });

        }

    });

});

/* ===========================
   CARD HOVER
=========================== */

document.querySelectorAll(".card").forEach(card => {

    card.addEventListener("mousemove", e => {

        const rect = card.getBoundingClientRect();

        const x = e.clientX - rect.left;

        const y = e.clientY - rect.top;

        card.style.background = `
        radial-gradient(circle at ${x}px ${y}px,
        rgba(255,123,0,.18),
        rgba(255,255,255,.05))
        `;

    });

    card.addEventListener("mouseleave", () => {

        card.style.background = "rgba(255,255,255,.05)";

    });

});
//
/* ===========================
   DISCORD PROFILE CARD
=========================== */

const discordID = "1194074826571259944";

async function loadDiscordProfile(){

    try{

        const res = await fetch(
        `https://api.lanyard.rest/v1/users/${discordID}`);

        const json = await res.json();

        if(!json.success) return;

        const data = json.data;

        /* Avatar */

        document.getElementById("discord-avatar").src =
        `https://cdn.discordapp.com/avatars/${data.discord_user.id}/${data.discord_user.avatar}.png?size=512`;
const decoration = document.getElementById("avatar-decoration");

if(data.discord_user.avatar_decoration_data){

    decoration.style.display = "block";

    decoration.src =
    `https://cdn.discordapp.com/avatar-decoration-presets/${data.discord_user.avatar_decoration_data.asset}.png`;

}else{

    decoration.style.display = "none";

}
        /* Display Name */

        document.getElementById("discord-display-name").innerHTML =
        data.discord_user.display_name ||
        data.discord_user.global_name ||
        data.discord_user.username;
//

        /* Username */

        document.getElementById("discord-username").innerHTML =
        "@" + data.discord_user.username;

        /* Status */

        const status =
        document.getElementById("discord-status");

        const dot =
        document.getElementById("discord-status-dot");

        switch(data.discord_status){

            case "online":

                status.innerHTML="🟢 Online";

                dot.style.background="#23a55a";

            break;

            case "idle":

                status.innerHTML="🌙 Idle";

                dot.style.background="#f0b232";

            break;

            case "dnd":

                status.innerHTML="⛔ Do Not Disturb";

                dot.style.background="#f23f43";

            break;

            default:

                status.innerHTML="⚫ Offline";

                dot.style.background="#80848e";

        }
        //
     /* Activity (VS Code, Roblox...) */

const activityCard = document.getElementById("activity-card");
const spotifyCard = document.getElementById("spotify-card");

const activity = data.activities.find(a => a.type === 0);

if(activity){

    activityCard.style.display = "flex";

    document.getElementById("activity-name").textContent =
    activity.name;

    document.getElementById("activity-details").textContent =
    activity.details || "";

    document.getElementById("activity-state").textContent =
    activity.state || "";

    if(activity.assets?.large_image){

        document.getElementById("activity-image").src =
        `https://cdn.discordapp.com/app-assets/${activity.application_id}/${activity.assets.large_image}.png`;

    }

}else{

    activityCard.style.display = "none";

}

/* Spotify */

if(data.listening_to_spotify){

    spotifyCard.style.display = "flex";

    document.getElementById("spotify-cover").src =
    data.spotify.album_art_url;

    document.getElementById("spotify-song").textContent =
    data.spotify.song;

    document.getElementById("spotify-artist").textContent =
    data.spotify.artist;

}else{

    spotifyCard.style.display = "none";

}
    }

    catch(err){

        console.log(err);

    }

}

loadDiscordProfile();

setInterval(loadDiscordProfile,5000);
/* ===========================
   ACTIVITY IMAGE
=========================== */

async function updateActivity(data){

    const image =
    document.getElementById("activity-image");

    if(data.listening_to_spotify){

        image.src=data.spotify.album_art_url;

        return;

    }

    if(data.activities.length){

        image.src=
        "https://cdn.discordapp.com/embed/avatars/0.png";

    }

}

/* ===========================
   UPDATE PROFILE
=========================== */

async function refreshProfile(){

    try{

        const res=
        await fetch(
        `https://api.lanyard.rest/v1/users/${discordID}`);

        const json=
        await res.json();

        if(!json.success) return;

        const data=json.data;

        if(data.discord_user.public_flags){

            loadBadges(
            data.discord_user.public_flags);

        }

        updateActivity(data);

    }

    catch(e){

        console.log(e);

    }

}

refreshProfile();

setInterval(refreshProfile,5000);
/* ===========================
   DISCORD BUTTON
=========================== */

const discordLink =
"https://discord.com/users/1194074826571259944";

document.querySelectorAll(".fa-discord").forEach(icon=>{

    icon.parentElement.addEventListener("click",()=>{

        window.open(discordLink,"_blank");

    });

});

/* ===========================
   PROFILE IMAGE EFFECT
=========================== */

const avatar=document.querySelector(".right img");

if(avatar){

avatar.addEventListener("mousemove",()=>{

avatar.style.transform="scale(1.05) rotate(-2deg)";

});

avatar.addEventListener("mouseleave",()=>{

avatar.style.transform="scale(1)";

});

}

/* ===========================
   RANDOM GLOW
=========================== */

setInterval(()=>{

const glow=document.querySelector(".cursor-glow");

if(glow){

glow.style.opacity=Math.random()*0.3+0.15;

}

},800);

/* ===========================
   PAGE TITLE
=========================== */

const titles=[

"Anw4aar",

"Discord Developer",

"Welcome 👋"

];

let titleIndex=0;

setInterval(()=>{

document.title=titles[titleIndex];

titleIndex++;

if(titleIndex>=titles.length){

titleIndex=0;

}

},2500);
//
/* ===========================
   SPOTIFY WIDGET
=========================== */

/*
خاصك Discord ID ديالك فوق
باش Lanyard يجيب معلومات Spotify
*/



/* ===========================
   TYPE WRITER
=========================== */

const texts = [

    "Discord Developer",
    "Bot Engineer",
    "JavaScript Developer",
    "Anime Lover"

];

let index = 0;
let char = 0;

const heroText = document.querySelector(".left p");

function typing(){

    if(!heroText) return;

    heroText.innerHTML = texts[index].slice(0,char);

    char++;

    if(char > texts[index].length){

        setTimeout(()=>{

            char = 0;

            index++;

            if(index >= texts.length){

                index = 0;

            }

        },1500);

    }

}

setInterval(typing,100);

/* ===========================
   COUNTER
=========================== */

document.querySelectorAll(".project").forEach((card,i)=>{

    card.style.animationDelay=`${i*0.2}s`;

});

/* ===========================
   BUTTON RIPPLE
=========================== */

document.querySelectorAll("button").forEach(btn=>{

btn.addEventListener("click",function(e){

const circle=document.createElement("span");

const d=Math.max(this.clientWidth,this.clientHeight);

circle.style.width=d+"px";

circle.style.height=d+"px";

circle.style.left=e.offsetX-d/2+"px";

circle.style.top=e.offsetY-d/2+"px";

circle.classList.add("ripple");

this.appendChild(circle);

setTimeout(()=>{

circle.remove();

},600);

});

});

/* ===========================
   IMAGE PARALLAX
=========================== */

window.addEventListener("mousemove",e=>{

const img=document.querySelector(".right img");

if(!img) return;

const x=(window.innerWidth/2-e.clientX)/40;

const y=(window.innerHeight/2-e.clientY)/40;

img.style.transform=
`translate(${x}px,${y}px)`;

});

/* ===========================
   PAGE LOADED
=========================== */

window.addEventListener("load",()=>{

console.log("Portfolio Loaded Successfully");

});
//
/* ===========================
   PART 4
=========================== */

/* ========= CLOCK ========= */

function updateClock(){

    const now = new Date();

    const h = String(now.getHours()).padStart(2,"0");
    const m = String(now.getMinutes()).padStart(2,"0");

    const clock = document.getElementById("clock");

    if(clock){

        clock.innerHTML = `${h}:${m}`;

    }

}

updateClock();

setInterval(updateClock,1000);

/* ========= RANDOM QUOTES ========= */

const quotes=[

"Never Give Up ⚔️",

"King Of Pirates 👑",

"Code • Create • Repeat",

"Welcome To My Portfolio",

"JavaScript Developer"

];

const quote=document.getElementById("quote");

if(quote){

let i=0;

setInterval(()=>{

quote.innerHTML=quotes[i];

i++;

if(i>=quotes.length){

i=0;

}

},3000);

}

/* ========= SCROLL TO TOP ========= */

const topBtn=document.createElement("button");

topBtn.innerHTML="↑";

topBtn.id="topBtn";

document.body.appendChild(topBtn);

window.addEventListener("scroll",()=>{

if(window.scrollY>400){

topBtn.style.display="block";

}else{

topBtn.style.display="none";

}

});

topBtn.onclick=()=>{

window.scrollTo({

top:0,

behavior:"smooth"

});

};

/* ========= PROJECT HOVER ========= */

document.querySelectorAll(".project").forEach(project=>{

project.addEventListener("mouseenter",()=>{

project.style.boxShadow="0 0 30px rgba(255,123,0,.5)";

});

project.addEventListener("mouseleave",()=>{

project.style.boxShadow="none";

});

});

/* ========= RANDOM BACKGROUND ========= */

const colors=[

"#ff7b00",

"#ff5500",

"#ff9500"

];

setInterval(()=>{

const glow=document.querySelector(".cursor-glow");

if(glow){

const color=colors[Math.floor(Math.random()*colors.length)];

glow.style.background=

`radial-gradient(circle,${color}55,transparent 70%)`;

}

},5000);

/* ========= SOCIAL LINKS ========= */

const github="https://github.com/YOUR_GITHUB";

const instagram="https://www.instagram.com/anw4aar_77?igsh=b3VubWR5M3cyNGM1";

const spotify="https://open.spotify.com/user/31b4y7r5bdgig2q2saldvwjgj2h4";

document.querySelector(".fa-github")?.parentElement.addEventListener("click",()=>{

window.open(github);

});

document.querySelector(".fa-instagram")?.parentElement.addEventListener("click",()=>{

window.open(instagram);

});

document.querySelector(".fa-spotify")?.parentElement.addEventListener("click",()=>{

window.open(spotify);

});
//
/*=========================
MUSIC PLAYER
=========================*/

const player = document.getElementById("player");
const playBtn = document.getElementById("playBtn");
const rewindBtn = document.getElementById("rewindBtn");
const forwardBtn = document.getElementById("forwardBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const progress = document.getElementById("progress");
const volume = document.getElementById("volume");

// عناصر الواجهة اللي غايتغيرو
const coverImg = document.getElementById("cover");
const songTitle = document.querySelector(".music-card h3");
const songArtist = document.querySelector(".music-card p");
const musicCard = document.querySelector(".music-card");

// قائمة الأغاني (تقدر تزيد فيها أغانٍ أخرين بنفس الطريقة)
const songs = [
    {
        title: "Fi Hwak",
        artist: "Didine Canon",
        cover: "https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/01/99/c9/0199c9ea-010a-391c-689e-86e077dbb9e9/cover.jpg/316x316bb.webp",
        src: "https://res.cloudinary.com/dxpyotnwm/video/upload/v1784811074/Didine_canine_16_fyp__bejaia__canon__16_MP3_g3itub.mp3",
        themeColor: "#000000" // لون الثيم الخاص بالأغنية الأولى
    },
    {
        title: "GHALAT",
        artist: "Najm",
        cover: "https://t2.genius.com/unsafe/344x344/https%3A%2F%2Fimages.genius.com%2Faf5ac4b7fea8cc8cf9f13eb1611c0be5.1000x1000x1.png", // بدّل رابط التصويرة
        src: "https://res.cloudinary.com/dxpyotnwm/video/upload/v1784811254/Ghalat__songs__music__viral__song_MP3_mhjpa2.mp3", // بدّل رابط الأغنية
        themeColor: "#d18136" // لون الثيم للأغنية الثانية
    },
    {
        title: "CAMEMBERT",
        artist: "Stormy",
        cover: "https://t2.genius.com/unsafe/344x344/https%3A%2F%2Fimages.genius.com%2Fdb169e619eeb584226e4508d4c8dbbb9.1000x1000x1.png", // بدّل رابط التصويرة
        src: "https://res.cloudinary.com/dxpyotnwm/video/upload/v1784811312/Stormy_-_Camembert_.._MP3_x22qmy.mp3", // بدّل رابط الأغنية
        themeColor: "#e11d1d" // لون الثيم للأغنية الثالثة
    }
];

let currentSongIndex = 0;

// دالة لتحديث بيانات الأغنية والواجهة
function loadSong(song) {
    songTitle.textContent = song.title;
    songArtist.textContent = song.artist;
    coverImg.src = song.cover;
    player.src = song.src;

    // تغيير الألوان الديناميكية
    playBtn.style.background = song.themeColor;
    progress.style.accentColor = song.themeColor;
    volume.style.accentColor = song.themeColor;
    coverImg.style.borderColor = song.themeColor;
    musicCard.style.boxShadow = `0 0 30px ${song.themeColor}44`;
}

// تشغيل وإيقاف الصوت
playBtn.onclick = () => {
    if (player.paused) {
        player.play();
        playBtn.innerHTML = "❚❚";
    } else {
        player.pause();
        playBtn.innerHTML = "▶";
    }
};

// الأغنية القادمة
nextBtn.onclick = () => {
    currentSongIndex = (currentSongIndex + 1) % songs.length;
    loadSong(songs[currentSongIndex]);
    player.play();
    playBtn.innerHTML = "❚❚";
};

// الأغنية السابقة
prevBtn.onclick = () => {
    currentSongIndex = (currentSongIndex - 1 + songs.length) % songs.length;
    loadSong(songs[currentSongIndex]);
    player.play();
    playBtn.innerHTML = "❚❚";
};

// ترجيع 10 ثواني
rewindBtn.onclick = () => {
    player.currentTime = Math.max(0, player.currentTime - 10);
};

// تقديم 10 ثواني
forwardBtn.onclick = () => {
    player.currentTime = Math.min(player.duration, player.currentTime + 10);
};

// إعداد شريط التقدم عند تحميل الأغنية
player.addEventListener("loadedmetadata", () => {
    progress.max = player.duration;
});

// تحديث شريط التقدم أثناء التشغيل
player.addEventListener("timeupdate", () => {
    progress.value = player.currentTime;
});

// تغيير وقت الأغنية عند سحب الشريط
progress.oninput = () => {
    player.currentTime = progress.value;
};

// التحكم في مستوى الصوت
volume.oninput = () => {
    player.volume = volume.value;
};

// الانتقال التلقائي للأغنية التالية عند انتهاء الحالية
player.onended = () => {
    nextBtn.click();
};
//
const githubUsername = "anw4aar77"; // دير سميتك هنا

async function fetchGithubActivity() {
    try {
        const response = await fetch(`https://api.github.com/users/${githubUsername}/events/public`);
        const data = await response.json();
        const pushEvent = data.find(event => event.type === "PushEvent");

        if (pushEvent) {
            const repoName = pushEvent.repo.name;
            const message = pushEvent.payload.commits[0].message;
            document.getElementById("latest-commit").innerHTML = `
                <p>Working on <strong>${repoName}</strong>: <br> 
                <span style="color: #ff7b00">"${message}"</span></p>
            `;
            document.getElementById("github-link").href = `https://github.com/${repoName}`;
        }
    } catch (err) {
        console.log("GitHub Error:", err);
    }
}
fetchGithubActivity();
/* ===========================
   SERVER CLONER LOGIC
=========================== */