<p align="center">
  <a href="#">
    <img alt="Rolla" width="128px" height="128px" src="https://raw.githubusercontent.com/RollaEditor/rolla/main/src/images/logo-192.png">
  </a>
</p>

# Rolla

[![Netlify Status](https://api.netlify.com/api/v1/badges/8881a061-16f2-47c5-b30e-a1c1f167fe2f/deploy-status)](https://app.netlify.com/sites/rolla/deploys)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

Rolla is a web app that automatically edits video and audio footage. It does
this by scanning the clip for silent segments and outputs the edit timestamps in
an FCPXML file. Rolla runs entirely in the browser and can be installed in one
click for offline use on any platform.

Check it out: [https://rolla.netlify.app](https://rolla.netlify.app)

## How to use

Select the footage you want Rolla to edit, then wait for it to finish
processing. When the edit is ready, it will appear as a download.

The downloaded file contains a timeline. You can import it into Davinci Resolve
for further production.

For those concerned about privacy:
Rolla does not send your footage to a server - your files are processed locally
on your device.

## Browser support

Rolla works on most mainstream browsers, with a notable exception being Safari.
Unfortunately, Safari does not support the SharedArrayBuffer feature that is
required for Rolla to function.

## Editor support

Davinci Resolve
