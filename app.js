
// --- stars --- //

let getRand = (min, max) => {return Math.random() * (max - min) + min}

let stars = []
let starsGroupSize = 75
let starMinSize = 2
let starMaxSize = 3

//  responsive in base a quante stelle ci sono

function test() {
    starsGroupSize = starsGroupSize*2
    starMaxSize = starSize*2

    removeStarsH(0)
    removeStarsW(0)
    createStars(0, 0)
}

function createStars(initH, initW) {
    for (let h = initH; h < Math.ceil(window.innerHeight/starsGroupSize); h++) {
        if (stars[h] == undefined) stars[h] = []
        for (let w = initW; w < Math.ceil(window.innerWidth/starsGroupSize); w++) {
            if (stars[h][w] != undefined) continue

            let starsGroup = document.createElement("div");
    
            starsGroup.classList.add("stars-group");
            starsGroup.style.top = `${h*starsGroupSize}px`;
            starsGroup.style.left = `${w*starsGroupSize}px`;

            starsGroup.style.width = `${starsGroupSize}px`
            starsGroup.style.height = `${starsGroupSize}px`
    
    
            stars[h][w] = starsGroup
    
            for (let i = 0; i < 2; i++) {
                for (let j = 0; j < 2; j++) {
                    let star = document.createElement("div");
    
                    star.classList.add("star");
                    star.style.top = `${getRand(0, starsGroupSize/2) + i * starsGroupSize/2}px`;
                    star.style.left = `${getRand(0, starsGroupSize/2) + j * starsGroupSize/2}px`;
            
                    let starSize = getRand(starMinSize, starMaxSize)
                    star.style.width = `${starSize}px`
                    star.style.height = `${starSize}px`

                    star.style.backgroundColor = `rgba(255, 255, 255, ${getRand(0.1, 0.6)})`;

                    starsGroup.appendChild(star);
                }
            }
    
            document.getElementById("stars-container").appendChild(starsGroup);
        }
    }
} createStars(0, 0)

function removeStarsH(fromH) {
    for (let i = 0; i < stars.length; i++)
        if (i >= fromH)
            for (let j = 0; j < stars[i].length; j++)
                document.getElementById("stars-container").removeChild(stars[i][j])

    stars.length = fromH
}

function removeStarsW(fromW) {
    for (let i = 0; i < stars.length; i++) {
        for (let j = 0; j < stars[i].length; j++)
            if (j >= fromW)
                document.getElementById("stars-container").removeChild(stars[i][j])
            
        stars[i].length = fromW
    }
}

let oldScreenSize = {w: window.innerWidth, h: window.innerHeight}

addEventListener('resize', () => {

    return
    if (Math.ceil(oldScreenSize.h/starsGroupSize) < Math.ceil(window.innerHeight/starsGroupSize))
        createStars(Math.ceil(oldScreenSize.h/starsGroupSize), 0)
    if (Math.ceil(oldScreenSize.w/starsGroupSize) < Math.ceil(window.innerWidth/starsGroupSize))
        createStars(0, Math.ceil(oldScreenSize.w/starsGroupSize))

    if (Math.ceil(oldScreenSize.h/starsGroupSize) > Math.ceil(window.innerHeight/starsGroupSize))
        removeStarsH(stars.length - (Math.ceil(oldScreenSize.h/starsGroupSize) - Math.ceil(window.innerHeight/starsGroupSize)))
    if (Math.ceil(oldScreenSize.w/starsGroupSize) > Math.ceil(window.innerWidth/starsGroupSize))
        removeStarsW(stars[0].length - (Math.ceil(oldScreenSize.w/starsGroupSize) - Math.ceil(window.innerWidth/starsGroupSize)))

    oldScreenSize = {w: window.innerWidth, h: window.innerHeight}
});


function starShine() {
    let starShining = stars[Math.floor(getRand(0, stars.length))][Math.floor(getRand(0, stars[0].length))].childNodes[Math.floor(getRand(0, 4))]
    starShining.classList.add("shine")
    setTimeout(() => starShining.classList.remove("shine"), 1000);
}

let starShineInterval = setInterval(starShine, 15);


// //                       /\
// //                       ||
// //                       ||
// //                       ||
// //                       ||

// //  responsive in base a quante stelle ci sono

let h = document.documentElement, 
    b = document.body,
    st = 'scrollTop',
    sh = 'scrollHeight';


let getScrollPercent = () => { return (h[st]||b[st]) / ((h[sh]||b[sh]) - h.clientHeight) * 100 }

let getScrollFirstPagePercent = () => { return (h[st]||b[st])/h.clientHeight * 100 }


let starOnScreen = true

addEventListener('scroll', () => {
    if (getScrollFirstPagePercent() > 100) {
        if (starOnScreen) clearInterval(starShineInterval)
        if (starOnScreen) console.log("stop star shine")
        starOnScreen = false
    }
    else {
        if (!starOnScreen) starShineInterval = setInterval(starShine, 15)
        if (!starOnScreen) console.log("start star shine")
        starOnScreen = true
    }

    if (starOnScreen) {
        document.getElementById("stars-container").style.top = `-${(h[st]||b[st])/h.clientHeight * 30}vh`
    }
})

document.getElementById("about-img-bg").addEventListener('mouseover', () => {
    document.getElementById("about-img").classList.add("hover")
    document.getElementById("about-img-bg").classList.add("hover")
});

document.getElementById("about-img-bg").addEventListener('mouseout', () => {
    document.getElementById("about-img").classList.remove("hover")
    document.getElementById("about-img-bg").classList.remove("hover")
});

addEventListener('scroll', () => {
    let scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    //console.log(scrollTop - window.innerHeight)

    let divScroll = scrollTop - (414 + window.innerHeight)
    if (divScroll < 221) {
        document.getElementById("projects-status").style.backgroundImage = "url('svg/0.svg')";
    } else if (divScroll < 503) {
        document.getElementById("projects-status").style.backgroundImage = "url('svg/1.svg')";
    } else if (divScroll < 806) {
        document.getElementById("projects-status").style.backgroundImage = "url('svg/2.svg')";
    } else if (divScroll < 1086.5) {
        document.getElementById("projects-status").style.backgroundImage = "url('svg/3.svg')";
    } else {
        document.getElementById("projects-status").style.backgroundImage = "url('svg/4.svg')";
    }

    document.getElementById("projects-content-container").scrollTo(0, scrollTop - (414 + window.innerHeight));
    


    // document.body.style.backgroundImage = "url('img_tree.png')";
})

//414 + window.innerHeight = 0


