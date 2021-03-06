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
      this.#initialOffset = mediaInfo.frameRate * 3600 // Davinci default 1hr
    } else {
      this.#tcMultiplier = 1001 // for videos that use drop-frame (ex. 29.97)
      this.#initialOffset = mediaInfo.frameRate * 3603.6
    }
    this.#tcDenominator = mediaInfo.frameRate * this.#tcMultiplier
    this.#startStr =
      `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE fcpxml>` +
      `<fcpxml version="1.9"><resources><format id="r0" ` +
      `frameDuration="${this.toTimecodeStr(1)}"/><asset id="r1" ` +
      `duration="${this.toTimecodeStr(mediaInfo.frameCount)}" ` +
      `hasVideo="${(mediaInfo.hasVideo === true ? 1 : 0).toString()}" ` +
      `hasAudio="1"><media-rep kind="original-media" ` +
      `src="${mediaInfo.fileName}"/></asset></resources><library>` +
      `<event name="Timeline 1"><project name="Timeline 1">` +
      `<sequence format="r0"><spine>`
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
    this.#assetClipStr +=
      `<asset-clip ref="r1" ` +
      `start="${this.toTimecodeStr(startFrame)}" ` +
      `duration="${this.toTimecodeStr(clipDuration)}" ` +
      `offset="${this.toTimecodeStr(this.#currentOffset)}"/>`
    this.#currentOffset += clipDuration
  }
  stringify () {
    return this.#startStr + this.#assetClipStr + this.#endStr
  }
} // class FCPXML

let ffmpeg

async function initialize () {
  if (typeof SharedArrayBuffer === 'undefined') {
    alert('Incompatible browser: please use latest Chrome/Edge/Firefox')
  }
  ffmpeg = FFmpeg.createFFmpeg({ log: true })
  await ffmpeg.load()
}

async function getMediaInfo (mediaFile) {
  let mediaInfo = {
    fileName: mediaFile.name,
    hasVideo: false,
    hasAudio: false,
    frameRate: 24,
    frameCount: 0 // duration in frames
  } // default values
  let logMsgs = []
  ffmpeg.setLogger(({ message }) => {
    if (message.startsWith('Duration', 2) || message.startsWith('Stream', 4)) {
      logMsgs.push(message)
    }
  }) // start logging after this line
  await ffmpeg.run('-i', mediaFile.name)
  for (let msg of logMsgs) {
    if (msg.includes('Video')) {
      mediaInfo.hasVideo = true
      mediaInfo.frameRate = parseFloat(msg.split(',').reverse()[3])
      break
    }
  }
  for (let msg of logMsgs) {
    if (msg.includes('Audio')) {
      mediaInfo.hasAudio = true
      break
    }
  }
  if (!Number.isInteger(mediaInfo.frameRate)) {
    mediaInfo.frameRate = (Math.ceil(mediaInfo.frameRate) * 1000) / 1001
  } // get exact frame rate in case of drop-frame (ex. 29.97 -> 30000/1001)
  let hrs = parseInt(logMsgs[0].split(':')[1]) // duration timecode
  let mins = parseInt(logMsgs[0].split(':')[2])
  let secs = parseFloat(logMsgs[0].split(':')[3])
  mediaInfo.frameCount = Math.floor(
    ((hrs * 60 + mins) * 60 + secs) * mediaInfo.frameRate
  )
  return mediaInfo
} // function getMediaInfo

async function decodeAudio (mediaFile) {
  if (mediaFile.name.endsWith('.wav')) {
    return mediaFile.name
  }
  let audioDir = mediaFile.name + '.wav'
  await ffmpeg.run('-i', mediaFile.name, audioDir)

  return audioDir
}

async function getMeanVolume (audioDir) {
  let volumeStatMsgs = []
  ffmpeg.setLogger(({ message }) => {
    if (message.startsWith('[Parsed_volumedetect')) {
      volumeStatMsgs.push(message)
    }
  })
  await ffmpeg.run('-i', audioDir, '-filter', 'volumedetect', '-f', 'null', '-')

  let meanVolume = -24 // dB
  for (let msg of volumeStatMsgs) {
    if (msg.includes('mean_volume')) {
      meanVolume = parseFloat(msg.split('mean_volume:')[1])
      break
    }
  }
  return meanVolume
}

async function detectSilence (mediaInfo, editList, audioDir) {
  let silenceStartMsgs = []
  let silenceEndMsgs = []
  let threshold = await getMeanVolume(audioDir)
  const minSilenceDuration = 1 // sec
  ffmpeg.setLogger(({ message }) => {
    if (message.includes('silence_start')) {
      silenceStartMsgs.push(message)
    } else if (message.includes('silence_end')) {
      silenceEndMsgs.push(message)
    }
  })
  await ffmpeg.run(
    '-i',
    audioDir,
    '-filter',
    'silencedetect=' +
      `n=${threshold.toString()}dB:` +
      `d=${minSilenceDuration.toString()}`,
    '-f',
    'null',
    '-'
  )
  const endOffset = mediaInfo.frameRate / 6 // 1/6 sec
  const startOffset = mediaInfo.frameRate / -30 // -1/30 sec
  const minClipDuration = mediaInfo.frameRate // 1 sec
  editList.push(0) // start the first clip with frame 0
  for (let i = 0; i < silenceStartMsgs.length; i++) {
    let clipEnd = Math.round(
      parseFloat(silenceStartMsgs[i].split('silence_start:')[1]) *
        mediaInfo.frameRate +
        endOffset
    )
    let clipStart = Math.round(
      parseFloat(silenceEndMsgs[i].split('silence_end:')[1]) *
        mediaInfo.frameRate +
        startOffset
    )
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
} // function detectSilence

function generateOutput (mediaInfo, editList, format) {
  let output
  if (format === 'fcpxml') {
    output = new FCPXML(mediaInfo)
  } // add formats here
  for (let i = 0; i < editList.length; i += 2) {
    output.addClip(editList[i], editList[i + 1])
  }
  let link = document.createElement('a')
  link.href = URL.createObjectURL(
    new Blob([output.stringify()], { type: 'text/plain' })
  )
  link.download = mediaInfo.fileName + '.' + format
  document.body.appendChild(link)
  link.click()
  link.remove()
}

async function run (event) {
  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load()
  }
  let mediaFile = event.target.files[0]
  ffmpeg.FS('writeFile', mediaFile.name, await FFmpeg.fetchFile(mediaFile))

  let mediaInfo = await getMediaInfo(mediaFile)
  if (mediaInfo.hasAudio) {
    const outputFormat = 'fcpxml' // should be user-defined in future versions
    let editList = []
    let audioDir = await decodeAudio(mediaFile)
    await detectSilence(mediaInfo, editList, audioDir)
    generateOutput(mediaInfo, editList, outputFormat)
  } else {
    alert('Cannot process media: input file has no audio track')
  }
}

window.addEventListener('load', initialize)

document.getElementById('media-upload').addEventListener('change', run)
