import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/** The iOS home-screen icon. Apple ignores transparency, so it is filled. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#6d5efc',
          color: '#ffffff',
          fontSize: 116,
          fontWeight: 700,
          fontFamily: 'sans-serif',
        }}
      >
        U
      </div>
    ),
    size,
  )
}
