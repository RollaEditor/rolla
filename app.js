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
  const {name} = files[0];
  message.innerHTML = 'Loading ffmpeg-core.js';
  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load();
  }
  message.innerHTML = 'Start Extracting Silence Interval';
  ffmpeg.FS('writeFile', name, await fetchFile(files[0]));
  await ffmpeg.run('-i', name, '-af', 'silencedetect=n=-50dB:d=0.5,ametadata=mode=print:file=plswork.txt', '-f', 'null', '-');
  message.innerHTML = 'Completed Extraction';

  let data;
  try {
    data = ffmpeg.FS('readFile', 'plswork.txt');
    // const objectURL = URL.createObjectURL(new Blob([data.buffer], {type: '.txt'}));
    const objectURL = URL.createObjectURL(new Blob([data.buffer], {type: '.txt'}));
    await download(objectURL)
  } catch (error) {
    message.innerHTML = 'Input File has no audio track';
    await new Promise(r => setTimeout(r, 1000)); // sleep for 1 sec
  }
  message.innerHTML = 'Choose a Clip';
}

async function download(objectURL) {
  // Credit to Aidan
  let link
  link = document.createElement('a');
  link.href = objectURL;
  link.download = `output.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

const elm = document.getElementById('media-upload');
elm.addEventListener('change', trim);
