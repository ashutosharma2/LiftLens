import { describe, expect, it } from 'vitest'
import { fittedSize, MAX_PHOTO_SIDE } from './photo'

describe('fittedSize', () => {
  it('shrinks a large phone photo so its long side is MAX_PHOTO_SIDE, keeping the shape', () => {
    expect(fittedSize(4284, 5712)).toEqual({ width: 1536, height: MAX_PHOTO_SIDE })
    expect(fittedSize(5712, 4284)).toEqual({ width: MAX_PHOTO_SIDE, height: 1536 })
  })

  it('never enlarges a small photo', () => {
    expect(fittedSize(963, 1441)).toEqual({ width: 963, height: 1441 })
  })
})
