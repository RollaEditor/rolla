class FCPXML {
  #tcMultiplier
  #tcDenominator
  #startStr
  #assetClipStr
  #endStr
  #initialOffset
  #currentOffset

  constructor (mediaInfo) {
    if (Number.isInteger(mediaInfo.frameRate)) {
      this.#tcMultiplier = 1
      this.#initialOffset = mediaInfo.frameRate * 3600 // davinci default 1hr
    } else {
      this.#tcMultiplier = 1001 // for videos that use drop-frame (e.g., 29.97)
      this.#initialOffset = mediaInfo.frameRate * 3603.6
    }
    this.#tcDenominator = mediaInfo.frameRate * this.#tcMultiplier
    this.#startStr = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE fcpxml><fcpxml version="1.9"><resources><asset id="r0" duration="${this.toTimecodeStr(mediaInfo.frameCount)}" hasVideo="${(mediaInfo.hasVideo === true ? 1 : 0).toString()}" hasAudio="1"><media-rep kind="original-media" src="${mediaInfo.fileName}"/></asset></resources><library><event name="Timeline 1"><project name="Timeline 1"><sequence><spine>`
    this.#assetClipStr = ''
    this.#endStr = '</spine></sequence></project></event></library></fcpxml>'
    this.#currentOffset = this.#initialOffset
  }
  gcd (a, b) {
    let temp
    while (b !== 0) {
      temp = a % b
      a = b
      b = temp
    }
    return a
  }
  toTimecodeStr (frameNumber) {
    let tcNumerator = frameNumber * this.#tcMultiplier
    let divisor = this.gcd(tcNumerator, this.#tcDenominator)
    return (
      (tcNumerator / divisor).toString() +
      '/' +
      (this.#tcDenominator / divisor).toString() +
      's'
    )
  }
  addClip (startFrame, endFrame) {
    let clipDuration = endFrame - startFrame
    this.#assetClipStr += `<asset-clip ref="r0" start="${this.toTimecodeStr(startFrame)}" duration="${this.toTimecodeStr(clipDuration)}" offset="${this.toTimecodeStr(this.#currentOffset)}"/>`
    this.#currentOffset += clipDuration
  }
  stringify () {
    return this.#startStr + this.#assetClipStr + this.#endStr
  }
} // class FCPXML

let ffmpeg

// Check browser support and load libraries
async function initialize () {
  if (typeof SharedArrayBuffer === 'undefined') {
    document.getElementById('message').innerHTML =
      'Error: Please use latest Chrome/Firefox/Edge'
  }
  ffmpeg = FFmpeg.createFFmpeg({ log: true })
  await ffmpeg.load()
}

function download (url, fileName) {
  let link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function generateOutput (mediaInfo, editList, format) {
  let output
  if (format === 'fcpxml') {
    output = new FCPXML(mediaInfo)
  } // add formats here
  for (let i = 0; i < editList.length; i += 2) {
    output.addClip(editList[i], editList[i + 1])
  }
  let blob = new Blob([output.stringify()], { type: 'text/plain' })

  return window.URL.createObjectURL(blob)
}

async function edit (mediaInfo) {
  let editList = [] // [clipStart, clipEnd, ... ]: clip means segment to keep
  let silenceStartMsgs = []
  let silenceEndMsgs = []
  ffmpeg.setLogger(({ message }) => {
    if (message.includes('silence_start')) {
      silenceStartMsgs.push(message)
    } else if (message.includes('silence_end')) {
      silenceEndMsgs.push(message)
    }
  }) // start logging after this line
  const minSilenceDuration = 1 // seconds
  await ffmpeg.run(
    '-i',
    mediaInfo.fileName,
    '-af',
    `silencedetect=n=${mediaInfo.audioRMS.toString()}dB:d=${minSilenceDuration.toString()}`,
    '-f',
    'null',
    '-'
  )
  const endOffset = 4 // frames
  const startOffset = -1
  const minClipDuration = mediaInfo.frameRate // 1s
  editList.push(0) // start the first clip with frame 0
  for (let i = 0; i < silenceStartMsgs.length; i++) {
    let clipEnd =
      Math.round(
        parseFloat(silenceStartMsgs[i].split('silence_start:')[1]) *
          mediaInfo.frameRate
      ) + endOffset
    let clipStart =
      Math.round(
        parseFloat(silenceEndMsgs[i].split('silence_end:')[1]) *
          mediaInfo.frameRate
      ) + startOffset
    if (clipEnd - editList[editList.length - 1] < minClipDuration) {
      editList.pop() // clip is too short, pop clipStart and do not push end
    } else {
      editList.push(clipEnd)
    }
    editList.push(clipStart)
  }
  let finalClipEnd = mediaInfo.frameCount
  if (finalClipEnd - editList[editList.length - 1] < minClipDuration) {
    editList.pop()
  } else {
    editList.push(finalClipEnd) // end the final clip with final frame
  }
  return editList
} // function edit

async function getMediaInfo (mediaFile) {
  let mediaInfo = {
    // default values
    fileName: mediaFile.name,
    hasVideo: false,
    hasAudio: false,
    audioRMS: -20, // dB
    frameRate: 24,
    frameCount: 0 // duration in frames
  }
  let rawLogMsgs = []
  ffmpeg.setLogger(({ message }) => {
    if (
      message.startsWith('Duration', 2) ||
      message.startsWith('Stream', 4) ||
      message.startsWith('[Parsed_astats')
    ) {
      rawLogMsgs.push(message)
    }
  })
  await ffmpeg.run(
    '-i',
    mediaFile.name,
    '-filter_complex',
    'astats=measure_perchannel=none',
    '-f',
    'null',
    '-'
  )
  for (let logMsg of rawLogMsgs) {
    if (logMsg.includes('Video')) {
      mediaInfo.hasVideo = true
      mediaInfo.frameRate = parseFloat(logMsg.split(',').reverse()[3])
      break
    }
  }
  for (let logMsg of rawLogMsgs) {
    if (logMsg.includes('RMS level dB')) {
      mediaInfo.hasAudio = true
      mediaInfo.audioRMS = parseFloat(logMsg.split('RMS level dB:')[1])
      break
    }
  }
  if (!Number.isInteger(mediaInfo.frameRate)) {
    // get exact drop-frame frame rate e.g. 29.97 fps -> 30000/1001 fps
    mediaInfo.frameRate = (Math.ceil(mediaInfo.frameRate) * 1000) / 1001
  }
  let hrs = parseInt(rawLogMsgs[0].split(':')[1]) // duration
  let mins = parseInt(rawLogMsgs[0].split(':')[2])
  let secs = parseFloat(rawLogMsgs[0].split(':')[3])
  mediaInfo.frameCount = Math.floor(
    ((hrs * 60 + mins) * 60 + secs) * mediaInfo.frameRate
  )
  return mediaInfo
} // function getMediaInfo

async function run (event) {
  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load()
  }
  let mediaFile = event.target.files[0]
  ffmpeg.FS('writeFile', mediaFile.name, await FFmpeg.fetchFile(mediaFile))
  document.getElementById('message').innerHTML = 'Processing...'

  let mediaInfo = await getMediaInfo(mediaFile)
  if (mediaInfo.hasAudio) {
    let editList = await edit(mediaInfo)
    const format = 'fcpxml' // should be user-defined in future versions
    let outputURL = generateOutput(mediaInfo, editList, format)
    download(outputURL, mediaFile.name + '.' + format)
  } else {
    alert('Unable to process: audio track not found')
  }
  document.getElementById('message').innerHTML = 'Choose a Clip'
}

document.getElementById('media-upload').addEventListener('change', run)

window.addEventListener('load', initialize)
