/**
 * Helpers for drawing saved fingertip trails.
 *
 * Saved points are raw MediaPipe coordinates: x, y in 0..1 of the camera frame,
 * NOT mirrored. To show what the patient drew from their point of view we flip
 * x and multiply it by the frame aspect (MediaPipe scales x by width and y by
 * height, so without this a circle looks like an oval). Same maths as
 * ml/airscribe_ml/preprocess.py webcam_to_user().
 */
export const DEFAULT_ASPECT = 16 / 9

export function videoAspect(video) {
  if (video && video.videoWidth && video.videoHeight) return video.videoWidth / video.videoHeight
  return DEFAULT_ASPECT
}

export function toUserView(points, aspect = DEFAULT_ASPECT) {
  return points.map(p => [(1 - p[0]) * aspect, p[1]])
}

/** Returns a function mapping [x, y] into a size x size box, centred, aspect kept. */
export function fitToBox(xy, size, margin = 0.12) {
  if (!xy.length) return () => [size / 2, size / 2]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of xy) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const span = Math.max(maxX - minX, maxY - minY) || 1
  const scale = (size * (1 - 2 * margin)) / span
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  return ([x, y]) => [size / 2 + (x - cx) * scale, size / 2 + (y - cy) * scale]
}
