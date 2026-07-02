import { toBuffer } from 'bwip-js/node'

// Server-side CODE128 barcode as a data URL — usable directly as an
// <Image src> in react-pdf. bwip-js is pure JS (no DOM/canvas), so it is
// safe in serverless runtimes.
export async function code128DataUrl(text: string): Promise<string> {
  const png = await toBuffer({
    bcid: 'code128',
    text,
    scale: 3,
    height: 14, // bar height in mm
    includetext: false,
  })
  return `data:image/png;base64,${png.toString('base64')}`
}
