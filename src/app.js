class FCPXML {
  #mediaInfo
  #tcMultiplier
  #tcDenominator
  #initialOffset
  #startStr
  #assetList
  #eventStr
  #sequenceStr
  #clipList
  #endStr
  #currentAssetID
  #currentOffset

  constructor (mediaInfo) {
    this.#mediaInfo = mediaInfo
    let formatNameAttr
    if (Number.isInteger(this.#mediaInfo.frameRate)) {
      this.#tcMultiplier = 1
      this.#tcDenominator = this.#mediaInfo.frameRate
      this.#initialOffset = this.#mediaInfo.frameRate * 3600 // davinci default
      formatNameAttr =
        'FFVideoFormat1080p' + this.#mediaInfo.frameRate.toString()
    } else {
      // for videos that use drop-frame e.g. 29.97 fps (30000/1001 fps)
      this.#tcMultiplier = 1001 // e.g. 29.97 * 1001 = 30000
      this.#tcDenominator = this.#mediaInfo.frameRate * this.#tcMultiplier
      this.#initialOffset = this.#mediaInfo.frameRate * 3603.6
      formatNameAttr =
        'FFVideoFormat1080p' +
        this.#mediaInfo.frameRate
          .toFixed(2)
          .toString()
          .replace('.', '')
    }
    let formatFrameDurationAttr = this.toTimecodeStr(1) // 1/frameRate
    let formatWidthAttr = this.#mediaInfo.width
    let formatHeightAttr = this.#mediaInfo.height
    if (this.#mediaInfo.hasVideo) {
      this.#startStr = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE fcpxml><fcpxml version="1.9"><resources><format id="r0" name="${formatNameAttr}" width="1920" height="1080" frameDuration="${formatFrameDurationAttr}"/><format id="r1" name="FFVideoFormatRateUndefined" width="${formatWidthAttr}" height="${formatHeightAttr}" frameDuration="${formatFrameDurationAttr}"/>`
      this.#endStr = `</spine></sequence></project></event></library></fcpxml>`
      this.#currentAssetID = 2 // 0 and 1 are reserved for <format>
    } else {
      this.#startStr = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE fcpxml><fcpxml version="1.9"><resources><format id="r0" name="FFVideoFormat1080p24" width="1920" height="1080" frameDuration="1/24s"/>`
      this.#endStr = `</gap></spine></sequence></project></event></library></fcpxml>`
      this.#currentAssetID = 1 // 0 is reserved for <format>
    }
    this.#assetList = []
    this.#eventStr = `</resources><library><event name="Timeline 1"><project name="Timeline 1">`
    this.#sequenceStr = ''
    this.#clipList = []
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
    let asset = ''
    let clip = ''
    let assetIDAttr = 'r' + this.#currentAssetID.toString()
    let assetNameAttr = this.#mediaInfo.fileName
    let assetDurationAttr = this.toTimecodeStr(this.#mediaInfo.frameCount)
    let clipStartAttr = this.toTimecodeStr(startFrame)
    let clipDuration = endFrame - startFrame
    let clipDurationAttr = this.toTimecodeStr(clipDuration)
    let clipOffsetAttr = this.toTimecodeStr(this.#currentOffset)
    if (this.#mediaInfo.hasVideo) {
      asset = `<asset id="${assetIDAttr}" format="r1" name="${assetNameAttr}" start="0/1s" duration="${assetDurationAttr}" hasVideo="1" hasAudio="1" audioSources="1"><media-rep kind="original-media" src="${assetNameAttr}"/></asset>`
      clip = `<asset-clip ref="${assetIDAttr}" format="r1" tcFormat="NDF" name="${assetNameAttr}" start="${clipStartAttr}" duration="${clipDurationAttr}" offset="${clipOffsetAttr}" enabled="1"><adjust-transform scale="1 1" anchor="0 0" position="0 0"/></asset-clip>`
    } else {
      asset = `<asset id="${assetIDAttr}" name="${assetNameAttr}" start="0/1s" duration="${assetDurationAttr}" hasAudio="1" audioSources="1"><media-rep kind="original-media" src="${assetNameAttr}"/></asset>`
      clip = `<asset-clip ref="${assetIDAttr}" name="${assetNameAttr}" start="${clipStartAttr}" duration="${clipDurationAttr}" offset="${clipOffsetAttr}" lane="2" enabled="1"/>`
    }
    this.#assetList.push(asset)
    this.#clipList.push(clip)
    this.#currentAssetID++
    this.#currentOffset += clipDuration
  }
  stringify () {
    let sequenceTCStartAttr = this.toTimecodeStr(this.#initialOffset)
    let sequenceDurationAttr = this.toTimecodeStr(
      this.#currentOffset - this.#initialOffset
    )
    if (this.#mediaInfo.hasVideo) {
      this.#sequenceStr = `<sequence format="r0" tcFormat="NDF" tcStart="${sequenceTCStartAttr}" duration="${sequenceDurationAttr}"><spine>`
    } else {
      this.#sequenceStr = `<sequence format="r0" tcFormat="NDF" tcStart="${sequenceTCStartAttr}" duration="${sequenceDurationAttr}"><spine><gap name="Gap" start="${sequenceTCStartAttr}" duration="${sequenceDurationAttr}" offset="${sequenceTCStartAttr}">`
    }
    return (
      this.#startStr +
      this.#assetList.join('') +
      this.#eventStr +
      this.#sequenceStr +
      this.#clipList.join('') +
      this.#endStr
    )
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
  await ffmpeg.run(
    '-i',
    mediaInfo.fileName,
    '-af',
    `silencedetect=n=${mediaInfo.audioRMS.toString()}dB:d=1`,
    '-f',
    'null',
    '-'
  )
  let minClipLength = mediaInfo.frameRate / 2 // 0.5 s
  editList.push(0) // start the first clip with frame 0
  for (let i = 0; i < silenceStartMsgs.length; i++) {
    let clipEnd = Math.round(
      parseFloat(silenceStartMsgs[i].split('silence_start:')[1]) *
        mediaInfo.frameRate
    )
    let clipStart = Math.round(
      parseFloat(silenceEndMsgs[i].split('silence_end:')[1]) *
        mediaInfo.frameRate
    )
    if (clipEnd - editList[editList.length - 1] < minClipLength) {
      editList.pop() // clip is too short, pop clipStart and do not push end
    } else {
      editList.push(clipEnd)
    }
    editList.push(clipStart)
  }
  let finalClipEnd = mediaInfo.frameCount
  if (finalClipEnd - editList[editList.length - 1] < minClipLength) {
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
    width: 1920,
    height: 1080,
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
      mediaInfo.width = parseInt(
        logMsg
          .split('x')
          .reverse()[1]
          .split(',')
          .reverse()[0]
      )
      mediaInfo.height = parseInt(logMsg.split('x').reverse()[0])
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
