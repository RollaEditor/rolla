// Let Typescript && IDE to access type info from fcpxml.ts
/// <reference path="fcpxml.ts"/>

// Show TypeScript that:
//  - Constant FFmpeg does exist
//  - It exists as a module
import * as _FFmpeg from '@ffmpeg/ffmpeg' // Hope this line doesn't cause any issue
import { FCPXML, FFmpegOutputParser } from './fcpxml'

declare global {
  const FFmpeg: typeof _FFmpeg // eslint-disable-line no-unused-vars
}

// Key components for ffmpeg library, declared to be initialized later in load()
let createFFmpeg, fetchFile: { (data: string | File | Blob): Promise<Uint8Array> }, ffmpeg: _FFmpeg.FFmpeg

// Execute load() when window (main page) loaded
window.onload = () => load()

// Loads FFmpeg library if browser is supported
// Otherwise display error and return -1 prematurely
async function load () {
  if (typeof SharedArrayBuffer === 'undefined') {
    document.getElementById('message')!.innerHTML =
      'Error: Please use latest Chrome/Firefox/Edge'
    return -1 // TODO: determine if it does break execution
  }
  createFFmpeg = FFmpeg.createFFmpeg // ffmpeg is exported from ffmpeg script
  fetchFile = FFmpeg.fetchFile
  ffmpeg = createFFmpeg({ log: true })
  await ffmpeg.load() // key line: loading wasm
}

// Workaround for TypeScript's limitation of detecting
// that file can be a attribute of target
// Credit for StackOverflow
interface HTMLInputEvent extends Event {
  target: HTMLInputElement & EventTarget
}

// Called after user uploaded a video/audio file
// Detects the silent interval
// and displays an fcpxml download prompt (for which contains the silent intervals)
const main = async (event: Event) => {
  const message = document.getElementById('message')!

  // Check if user didn't select any files
  // hopefully a redundant check (if upload event is called after user select valid file)
  if ((<HTMLInputEvent>event).target.files == null) {
    document.getElementById('message')!.innerHTML =
      'Error: You did not select any files!'
    return -1 // TODO: determine if it does break execution
  }

  // Select the file user uploaded
  const videoFile = (<HTMLInputEvent>event).target.files![0]
  const { name } = videoFile

  message.innerHTML = 'Loading ffmpeg-core.js'
  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load()
  }
  message.innerHTML = 'Start Extracting Silence Interval'
  ffmpeg.FS('writeFile', name, await fetchFile(videoFile))
  // silence detection
  const noise = -27
  const pauseDuration = 0.5
  await ffmpeg.run(
    '-i',
    name,
    '-af',
    `silencedetect=n=${noise}dB:d=${pauseDuration},ametadata=mode=print:file=plswork.txt`,
    '-f',
    'null',
    '-'
  )
  message.innerHTML = 'Completed Extraction'

  try {
    const data = ffmpeg.FS('readFile', 'plswork.txt')
    // const objectURL = URL.createObjectURL(new Blob([data.buffer], {type: '.txt'}));
    try {
      const output = new Blob([data.buffer], { type: '.txt' })
      // const objectURL = URL.createObjectURL(output); // might not be needed
      // await download(objectURL)

      // Parse output to cuts
      const cuts = await FFmpegOutputParser.getCuts(output)
      if (cuts.length === 0) {
        message.innerHTML = 'No intervals are detected!'
        return 0
      }
      const fcpxml = new FCPXML(videoFile, cuts)
      await fcpxml.write()
      await fcpxml.download()
    } catch (error) {
      console.log(error)
    }
  } catch (error) {
    message.innerHTML = 'Input File has no audio track'
    // eslint-disable-next-line promise/param-names
    await new Promise(r => setTimeout(r, 1000)) // sleep for 1 sec
  }
  message.innerHTML = 'Choose a Clip'
}

// Execute main when user finishes uploading
const elm = document.getElementById('media-upload')
elm!.addEventListener('change', main)
