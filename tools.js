function kxpb(k, b) {
  return x => k * x + b
}

function timeNowDecompose() {
  const DateObj = new Date()
  const year = DateObj.getFullYear()
  const month = DateObj.getMonth() + 1
  const day = DateObj.getDate()
  const hour = DateObj.getHours()
  const hour12 = hour > 12 ? hour - 12 : hour
  const minute = DateObj.getMinutes()
  const second = DateObj.getSeconds()
  const msecond = DateObj.getMilliseconds()
  return [year, month, day, hour12, minute, second, msecond, hour]
}

function fromPointAndDegreeToDestination(x, y, dg, length) {
  const Tx = Math.cos(dg) * length
  const Ty = Math.sin(dg) * length
  return [x + Tx, y - Ty]
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} dgree
 * @param {number} fromPointX
 * @param {number} fromPointY
 * @param {number} length
 * @param {number} width
 * @param {string} color
 */
function drawPointer(ctx, degree, fromPointX, fromPointY, length, width, color) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(fromPointX, fromPointY)

  const [X, Y] = fromPointAndDegreeToDestination(fromPointX, fromPointY, degree, length)
  ctx.lineTo(X, Y)
  ctx.stroke()
}
