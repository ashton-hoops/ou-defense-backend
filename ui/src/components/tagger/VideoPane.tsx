import { useEffect, useRef, useState } from 'react'

type VideoPaneProps = {
  videoSrc: string | null
  onVideoLoaded: (video: HTMLVideoElement) => void
}

export const VideoPane = ({ videoSrc, onVideoLoaded }: VideoPaneProps) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showOverlay, setShowOverlay] = useState(true)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handlePlay = () => {
      setIsPlaying(true)
      setShowOverlay(false)
    }
    const handlePause = () => {
      setIsPlaying(false)
      setShowOverlay(true)
    }
    const handleLoadedMetadata = () => {
      setShowOverlay(true)
      onVideoLoaded(video)
    }

    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('loadedmetadata', handleLoadedMetadata)

    return () => {
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [onVideoLoaded])

  useEffect(() => {
    if (videoSrc && videoRef.current) {
      videoRef.current.load()
    }
  }, [videoSrc])

  const handleOverlayClick = () => {
    if (videoRef.current) {
      videoRef.current.play()
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[10px] bg-black">
        <video
          ref={videoRef}
          controls
          preload="metadata"
          playsInline
          className="block h-full w-full bg-black object-contain"
        >
          {videoSrc && <source src={videoSrc} type="video/mp4" />}
        </video>
        <div
          className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
            showOverlay ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <button
            className="pointer-events-auto flex h-[72px] w-[72px] items-center justify-center rounded-full border border-[#841617] bg-[rgba(17,21,25,0.88)]"
            onClick={handleOverlayClick}
            aria-label="Play"
          >
            <div className="ml-1 h-0 w-0 border-b-[12px] border-l-[18px] border-t-[12px] border-b-transparent border-l-[#e5e7eb] border-t-transparent"></div>
          </button>
        </div>
      </div>
    </div>
  )
}
