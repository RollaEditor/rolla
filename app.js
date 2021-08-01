let createFFmpeg, fetchFile
let ffmpeg;

window.onload = load()

async function load() {
    if (typeof SharedArrayBuffer === "undefined") {
        document.getElementById('message').innerHTML = "Error: Please use latest Chrome/Firefox/Edge"
    }
    createFFmpeg = FFmpeg.createFFmpeg;  // FFmpeg is exported from ffmpeg script
    fetchFile = FFmpeg.fetchFile;
    ffmpeg = createFFmpeg({log: true});
    await ffmpeg.load();  // key line: loading wasm
}

const trim = async ({target: {files}}) => {
    const message = document.getElementById('message');
    const videoFile = files[0];
    const {name} = videoFile;

    message.innerHTML = 'Loading ffmpeg-core.js';
    if (!ffmpeg.isLoaded()) {
        await ffmpeg.load();
    }
    message.innerHTML = 'Start Extracting Silence Interval';
    ffmpeg.FS('writeFile', name, await fetchFile(files[0]));
    // silence detection
    let noise = -27;
    let pause_duration = 0.5;
    await ffmpeg.run('-i', name, '-af', `silencedetect=n=${noise}dB:d=${pause_duration},ametadata=mode=print:file=plswork.txt`, '-f', 'null', '-');
    message.innerHTML = 'Completed Extraction';

    try {
        let data = ffmpeg.FS('readFile', 'plswork.txt');
        // const objectURL = URL.createObjectURL(new Blob([data.buffer], {type: '.txt'}));
        try {
            const outputBlob = new Blob([data.buffer], {type: '.txt'});
            // const objectURL = URL.createObjectURL(outputBlob); // might not be needed
            // await download(objectURL) // TODO: fix this
            await process(outputBlob, videoFile);
        } catch (error) {
            console.log(error);
        }
    } catch (error) {
        message.innerHTML = 'Input File has no audio track';
        await new Promise(r => setTimeout(r, 1000)); // sleep for 1 sec
    }
    message.innerHTML = 'Choose a Clip';
}

async function download(objectURL) {
    // Credit to Aidan
    // only downloads xml file
    let link = document.createElement('a');
    link.href = objectURL;
    link.download = `result.fcpxml`;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

async function process(blob, file) {
    // Input: objectURL for txt file
    // Output: None
    // Effects:
    //  - converts txt to xml
    //  - creates a download window that downloads the xml

    // Get Durations:
    let video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.onloadedmetadata = function() {
        console.log('metadata loaded!');
        console.log(`video duration: ${this.duration}`);//this refers to myVideo
        currentDuration = this.duration;
        fractionString = DecimalToFraction(currentDuration);
    };
    video.remove();

    // Proceed:
    SetFileType(true);  // TODO: fix to support both video and audio
    ConvertSilencesBlobToCuts(blob);
    SaveCuts();
    await DownloadFile(xmlDoc, "fcpxml", true)
}

const elm = document.getElementById('media-upload');
elm.addEventListener('change', trim);

// Aidan's works:

const xmlStringStart = '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE fcpxml><fcpxml version="1.9"><resources>' +
    '<format name="FFVideoFormat1080p24" id="r0" width="1920" frameDuration="1/24s" height="1080"/>' +
    '</resources><library>' + '<event name="testing timeline (Resolve)">' + '<project name="testing timeline (Resolve)">' +
    '<sequence tcStart="3600/1s" tcFormat="NDF" duration="2251/8s" format="r0">' + '<spine>' +
    '</spine></sequence></project></event></library></fcpxml>'; //this is the base format string for the fpcxml thing (for audio)
const xmlStringStartVideo = '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE fcpxml><fcpxml version="1.9"><resources>' +
    '<format id="r0" width="1920" name="FFVideoFormat1080p30" height="1080" frameDuration="1/30s"/>' +
    '<format id="r1" width="1280" name="FFVideoFormat720p30" height="720" frameDuration="1/30s"/>' +
    '</resources><library>' + '<event name="testing timeline (Resolve)">' + '<project name="testing timeline (Resolve)">' +
    '<sequence format="r0" duration="271/15s" tcFormat="NDF" tcStart="3600/1s">' + '<spine>' +
    '</spine></sequence></project></event></library></fcpxml>';
const MAX_CUT_TO_SAVE = 50
let fractionString
let currentDuration //the duration of the audio MUST SET THIS BEFORE SAVING THE CUTS
let currentFile //for audio file may not be needed for you people
let cuts = [] //cuts array (where they are stored) (note you dont need to make the other clips as this program already handles that)
let xmlDoc
let isVideo
function ConvertSilencesBlobToCuts(blob) { //tales a blob (in this case the selected output.txt file) and converts it to cuts
    let reader = new FileReader();
    reader.onload = function (e) {
        ConvertToCuts(e.target.result)
    }
    reader.readAsText(blob)
}

function SetFileType(isVideoTrue) { //sets the xmldoc var depending on if you want video or audio (must be done before anything is used in this code)
    let parser = new DOMParser(); //used for the xml making
    xmlDoc = isVideoTrue ? parser.parseFromString(xmlStringStartVideo, "text/xml") : parser.parseFromString(xmlStringStart, "text/xml")
    isVideo = isVideoTrue
}

function ConvertToCuts(blobResult) { //takes the text, splits by each new line, then grabs the start and end times to then add each cut
    let split = blobResult.split('\n')
    let startString = "silence_start"
    let endString = "silence_end"
    let times = [-1.0, -1.0]
    for (let line of split) {
        if (line.includes(startString)) {
            times[0] = parseFloat(line.split("=")[1])
        } else if (line.includes(endString)) {
            times[1] = parseFloat(line.split("=")[1])
        }
        if (times.indexOf(-1.0) === -1) {
            //AddCut(times[0], times[1]) //here is where cut is actually added. i commented it out to output the grabbed cuts to console to test
            console.log(`${times[0]} ${times[1]}`)
            times[0] = -1.0
            times[1] = -1.0
        }
    }
}

function SaveCuts() { //saves each clip into the xml var MAKE SURE SetFileType IS RUN BEFORE THIS OR ERROR WILL OCCUR
    let adder = isVideo ? 2 : 1
    cuts = AddExtraClips()
    if (isVideo) AddExtraAssets(); else AddGapNode(); //if issue arises here just properly have an if else
    for (let i = 0; i < cuts.length; i++) {
        AddSplit(cuts[i].start, cuts[i].end - cuts[i].start, i + adder, cuts[i].enabled, cuts[i].offset)
    }
}

function AddExtraClips() { //adds the parts that aren't cut (based from the cuts) and returns the added clips and cuts as new array
    let cutsToAdd = []
    if (cuts[0].start !== 0) cutsToAdd.push({"start": 0, "end": cuts[0].start, "enabled": true, "offset": "3600/1"})
    for (i = 0; i < cuts.length; i++) {
        if (i - 1 > -1) {
            cutsToAdd.push({
                "start": cuts[i - 1].end,
                "end": cuts[i].start,
                "enabled": true,
                "offset": cuts[i - 1].offset
            })
        }
    }
    if (cuts[cuts.length - 1].end !== currentDuration) cutsToAdd.push({
        "start": cuts[cuts.length - 1].end,
        "end": currentDuration,
        "enabled": true,
        "offset": cuts[cuts.length - 1].offset
    })
    cutsToAdd = ShiftAllItems(cutsToAdd)
    for (let cut of cuts) {
        if (cut.end - cut.start < MAX_CUT_TO_SAVE && !isVideo) {
            cutsToAdd.push(cut)
        }
    }
    return cutsToAdd
}

function ShiftAllItems(cutsToAdd){ //shifts all the clips and cuts properly
    let subAll = 0
    let frac
    for (let i = 1; i < cutsToAdd.length; i++){
        if (cutsToAdd[i - 1].end !== cutsToAdd[i].start){
            subAll += cutsToAdd[i].start - cutsToAdd[i - 1].end
        }
        frac = DecimalToFraction(3600 + (cutsToAdd[i].start - subAll))
        cutsToAdd[i].offset = frac
        if (i - 1 < cuts.length) cuts[i - 1].offset = frac
    }
    return cutsToAdd
}

function AddGapNode() { //adds the gap node for xml (only done for audio files)
    let gapNode = xmlDoc.createElement("gap")
    let spineNode = xmlDoc.getElementsByTagName("spine")[0];
    gapNode.setAttribute("offset", "3600/1s")
    gapNode.setAttribute("name", "Gap")
    gapNode.setAttribute("start", "3600/1s")
    gapNode.setAttribute("duration", "752/3s")
    spineNode.appendChild(gapNode)
}

function AddExtraAssets() { //adds the extra assets (formats) for a video (note each asset-clip uses one format which is currently the 720p one)
    // let resourceNode = xmlDoc.getElementsByTagName("resources")[0];
    let newFormats = [xmlDoc.createElement("format"), xmlDoc.createElement("format")]
    let vals = [{"width": "1920", "name": "FFVideoFormat1080p30", "height": "1080"}, {
        "width": "1280",
        "name": "FFVideoFormat720p30",
        "height": "720"
    }]
    for (let i = 0; i < newFormats.length; i++) { //somehow these formats are automatically added which is stupid
        newFormats[i].setAttribute("id", `r${i}`)
        newFormats[i].setAttribute("width", vals[i].width)
        newFormats[i].setAttribute("name", vals[i].name)
        newFormats[i].setAttribute("height", vals[i].height)
        newFormats[i].setAttribute("frameDuration", "1/30s")
    }
}

function AddSplit(start, duration, num, enabled, offset) { //sets the resource and asset part of each clip (perameters are all needed)
    AddResource(num);
    if (!isVideo) {
        AddAsset(start, duration, num, enabled, offset);
    } else {
        AddAssetVideo(start, duration, num, enabled, offset);
    }
}

function AddResource(num) { //adds a new child node to resources that has its own child
    let resourceNode = xmlDoc.getElementsByTagName("resources")[0];
    let newAsset = xmlDoc.createElement("asset");
    let newMedia = xmlDoc.createElement("media-rep");
    newAsset.setAttribute("audioChannels", "2");
    newAsset.setAttribute("name", currentFile.name);
    newAsset.setAttribute("audioSources", "1");
    newAsset.setAttribute("id", `r${num}`);
    newAsset.setAttribute("hasAudio", "1");
    newAsset.setAttribute("start", "0/1s");
    newAsset.setAttribute("duration", `${fractionString}s`);
    newMedia.setAttribute("kind", "original-media");
    newMedia.setAttribute("src", "");
    if (isVideo) {
        newAsset.setAttribute("format", "r1")
        newAsset.setAttribute("hasVideo", "1")
    }
    newAsset.appendChild(newMedia);
    resourceNode.appendChild(newAsset);
}

function AddAsset(start, duration, num, enabled, offset) { //creates a new child node in gap with perameters
    let gapNode = xmlDoc.getElementsByTagName("gap")[0];
    let newAssetClip = xmlDoc.createElement("asset-clip")
    newAssetClip.setAttribute("enabled", `${enabled ? "1" : "0"}`)
    newAssetClip.setAttribute("offset", `${offset}s`)
    newAssetClip.setAttribute("name", currentFile.name)
    newAssetClip.setAttribute("lane", "1")
    newAssetClip.setAttribute("start", `${DecimalToFraction(start)}s`)
    newAssetClip.setAttribute("duration", `${DecimalToFraction(duration)}s`)
    newAssetClip.setAttribute("ref", `r${num}`)
    gapNode.appendChild(newAssetClip);

}

function AddAssetVideo(start, duration, num, enabled, offset) { //adds asset-clips but for the video (ramade as asset-clips also have a child)
    let spine = xmlDoc.getElementsByTagName("spine")[0];
    let assetClip = xmlDoc.createElement("asset-clip")
    let transAdjust = xmlDoc.createElement("adjust-transform")
    assetClip.setAttribute("format", "r1")
    assetClip.setAttribute("enabled", `${enabled ? "1" : "0"}`)
    assetClip.setAttribute("offset", `${offset}s`)
    assetClip.setAttribute("name", currentFile.name)
    assetClip.setAttribute("lane", "1")
    assetClip.setAttribute("start", `${DecimalToFraction(start)}s`)
    assetClip.setAttribute("duration", `${DecimalToFraction(duration)}s`)
    assetClip.setAttribute("ref", `r${num}`)
    assetClip.setAttribute("tcFormat", "NDF")
    transAdjust.setAttribute("scale", "1 1")
    transAdjust.setAttribute("anchor", "0 0")
    transAdjust.setAttribute("position", "0 0")
    assetClip.appendChild(transAdjust)
    spine.appendChild(assetClip)
}

function DecimalToFraction(amount) { //converts an amount (number) into a fraction string (comments within not mine)
    if (parseFloat(amount) === parseInt(amount)) {
        return `${amount}/1`;
    }
    // Next 12 lines are cribbed from https://stackoverflow.com/a/23575406.
    const gcd = function (a, b) {
        if (b < 0.0000001) {
            return a;
        }
        return gcd(b, Math.floor(a % b));
    };
    const len = amount.toString().length - 2;
    let denominator = Math.pow(10, len);
    let numerator = amount * denominator;
    const divisor = gcd(numerator, denominator);
    numerator /= divisor;
    denominator /= divisor;
    // const base = 0;
    // In a scenario like 3/2, convert to 1 1/2
    // by pulling out the base number and reducing the numerator.
    amount = Math.floor(numerator) + '/' + Math.floor(denominator);
    return amount;
}

/*function gcd(a, b) { //gets the common denominator
    return (b) ? gcd(b, a % b) : a;
}*/

async function DownloadFile(file, extension, isXML = false) { //converts the xml var into a string to then write that string to a file which is automatically downloaded
    let fr = new FileReader();
    let serializer = new XMLSerializer()
    if (!isXML) fr.readAsDataURL(file);
    let blob = !isXML ? new Blob([file], {type: `application/${extension}`}) :
        new Blob([serializer.serializeToString(file)], {type: 'text/plain'})
    let objectURL = window.URL.createObjectURL(blob);
    await download(objectURL);
}
