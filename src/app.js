(() => {
  // src/fcpxml.ts
  function rationalize(value) {
    return math.format(math.fraction(value), { fraction: "ratio" }) + "s";
  }
  function createXMLElement(tagName) {
    return document.implementation.createDocument(null, tagName).documentElement;
  }
  var AssetClip = class {
    constructor(start, duration, offset, fileName) {
      this.assetClip = createXMLElement("asset-clip");
      this.start = start;
      this.duration = duration;
      this.offset = offset;
      setAttributes(this.assetClip, {
        "offset": rationalize(this.offset),
        "name": fileName,
        "format": "r1",
        "tcFormat": "NDF",
        "start": rationalize(this.start),
        "ref": "r2",
        "enabled": "1",
        "duration": rationalize(this.duration)
      });
    }
  };
  var Cut = class {
    constructor(start, end) {
      this.start = start;
      this.end = end;
    }
  };
  var FCPXML = class {
    constructor(media, cuts = []) {
      this.xmlParser = new DOMParser();
      this.xml = this.xmlParser.parseFromString('<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE fcpxml><fcpxml version="1.9"><resources><format id="r0" width="1920" name="FFVideoFormat1080p30" height="1080" frameDuration="1/30s"/><format id="r1" width="1280" name="FFVideoFormat720p30" height="720" frameDuration="1/30s"/></resources><library><event name="output"><project name="output"><sequence format="r0" duration="271/15s" tcFormat="NDF" tcStart="3600/1s"><spine></spine></sequence></project></event></library></fcpxml>', "text/xml");
      this.cuts = [];
      this.media = media;
      this.cuts = cuts;
    }
    async write() {
      await this.setDuration();
      this.setAsset();
      this.setAssetClips();
    }
    setAssetClips() {
      let durationAfterCuts = this.duration;
      for (let cut of this.cuts) {
        durationAfterCuts -= cut.end - cut.start;
      }
      const sequence = this.xml.querySelector("sequence");
      if (sequence == null) {
        console.error("Either Default xml preset or selection is flawed");
        return;
      }
      sequence.setAttribute("duration", rationalize(durationAfterCuts));
      const spine = this.xml.querySelector("spine");
      if (spine == null) {
        console.error("Either Default xml preset or selection is flawed");
        return;
      }
      let num_of_clips = this.cuts.length + 1;
      let splits, starts, durations, offsets;
      [splits, starts, durations, offsets] = [[], [], [], []];
      splits.push(0, this.duration);
      for (let cut of this.cuts) {
        if (cut.start < 1 / 30) {
          splits.push(cut.end);
          splits.shift();
          num_of_clips--;
        } else if (cut.end > this.duration - 1 / 30) {
          splits.push(cut.start);
          splits.pop();
          num_of_clips--;
        } else if (cut.end - cut.start < 2 / 30) {
          num_of_clips--;
        } else
          splits.push(cut.start, cut.end);
      }
      splits.sort((a, b) => a - b);
      for (let i = 0; i < splits.length; i += 2) {
        if (splits[i + 1] - splits[i] > 2 / 30) {
          starts.push(splits[i]);
          durations.push(splits[i + 1] - splits[i]);
        } else
          num_of_clips--;
      }
      offsets.push(3600);
      for (let i = 1; i < num_of_clips; i++) {
        offsets[i] = offsets[i - 1] + durations[i - 1];
      }
      for (let i = 0; i < num_of_clips; i++) {
        const assetClip = new AssetClip(starts[i], durations[i], offsets[i], this.media.name);
        spine.appendChild(assetClip.assetClip);
      }
    }
    setAsset() {
      const resources = this.xml.querySelector("resources");
      const asset = createXMLElement("asset");
      setAttributes(asset, {
        "hasVideo": "1",
        "audioSources": "1",
        "hasAudio": "1",
        "name": this.media.name,
        "format": "r1",
        "start": "0/1s",
        "audioChannels": "2",
        "id": "r2",
        "duration": rationalize(this.duration)
      });
      const media_rep = createXMLElement("media-rep");
      setAttributes(media_rep, {
        kind: "original-media",
        src: ""
      });
      asset.appendChild(media_rep);
      if (resources == null) {
        console.error("Either Default xml preset or selection is flawed");
        return;
      }
      resources.appendChild(asset);
    }
    async setDuration() {
      let video = document.createElement("video");
      video.src = URL.createObjectURL(this.media);
      video.load();
      await new Promise((resolve) => video.ondurationchange = () => resolve());
      this.duration = video.duration;
      video.remove();
    }
    async addCut(cut) {
      this.cuts.push(cut);
    }
    async addCuts(cuts) {
      this.cuts.concat(cuts);
    }
    async download() {
      let link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([this.serialize()], { type: "text/xml" }));
      link.download = `result.fcpxml`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    serialize() {
      const xmlSerializer = new XMLSerializer();
      return xmlSerializer.serializeToString(this.xml).replaceAll('xmlns="http://www.w3.org/1999/xhtml"', "");
    }
  };
  function setAttributes(element, Attrs) {
    for (let key in Attrs) {
      element.setAttribute(key, Attrs[key]);
    }
  }
  var FFmpegOutputParser = class {
    static async getCuts(ffmpeg_out) {
      const cuts = [];
      const out = await ffmpeg_out.text();
      const split = out.split("\n");
      const startString = "silence_start";
      let endString = "silence_end";
      let times = [-1, -1];
      for (let line of split) {
        if (line.includes(startString)) {
          times[0] = parseFloat(line.split("=")[1]);
        } else if (line.includes(endString)) {
          times[1] = parseFloat(line.split("=")[1]);
        }
        if (!times.includes(-1)) {
          cuts.push(new Cut(times[0], times[1]));
          times[0] = -1;
          times[1] = -1;
        }
      }
      return cuts;
    }
  };

  // src/app.ts
  var createFFmpeg;
  var fetchFile;
  var ffmpeg;
  window.onload = () => load();
  async function load() {
    if (typeof SharedArrayBuffer === "undefined") {
      document.getElementById("message").innerHTML = "Error: Please use latest Chrome/Firefox/Edge";
      return -1;
    }
    createFFmpeg = FFmpeg.createFFmpeg;
    fetchFile = FFmpeg.fetchFile;
    ffmpeg = createFFmpeg({ log: true });
    await ffmpeg.load();
  }
  var main = async (event) => {
    const message = document.getElementById("message");
    if (event.target.files == null) {
      document.getElementById("message").innerHTML = "Error: You did not select any files!";
      return -1;
    }
    let videoFile = event.target.files[0];
    const { name } = videoFile;
    message.innerHTML = "Loading ffmpeg-core.js";
    if (!ffmpeg.isLoaded()) {
      await ffmpeg.load();
    }
    message.innerHTML = "Start Extracting Silence Interval";
    ffmpeg.FS("writeFile", name, await fetchFile(videoFile));
    let noise = -27;
    let pause_duration = 0.5;
    await ffmpeg.run("-i", name, "-af", `silencedetect=n=${noise}dB:d=${pause_duration},ametadata=mode=print:file=plswork.txt`, "-f", "null", "-");
    message.innerHTML = "Completed Extraction";
    try {
      let data = ffmpeg.FS("readFile", "plswork.txt");
      try {
        const output = new Blob([data.buffer], { type: ".txt" });
        const cuts = await FFmpegOutputParser.getCuts(output);
        if (cuts.length === 0) {
          message.innerHTML = "No intervals are detected!";
          return 0;
        }
        const fcpxml = new FCPXML(videoFile, cuts);
        await fcpxml.write();
        await fcpxml.download();
      } catch (error) {
        console.log(error);
      }
    } catch (error) {
      message.innerHTML = "Input File has no audio track";
      await new Promise((r) => setTimeout(r, 1e3));
    }
    message.innerHTML = "Choose a Clip";
  };
  var elm = document.getElementById("media-upload");
  elm.addEventListener("change", main);
})();
