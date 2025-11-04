const ReactTagger = () => {
  return (
    <div className="flex h-full flex-col bg-black">
      <header className="border-b border-white/10 px-6 py-4 text-white">
        <p className="text-xs uppercase tracking-[0.4em] text-white/60">Clip Tagger (React)</p>
        <h1 className="text-lg font-semibold">OU WBB Defensive Clip Tagger</h1>
        <p className="text-sm text-white/50">This view mirrors the legacy interface for a consistent workflow.</p>
      </header>
      <div className="flex-1">
        <iframe
          title="Clip Tagger"
          src="/legacy/clip_tagger_copy.html"
          className="h-full w-full border-0"
        />
      </div>
    </div>
  )
}

export default ReactTagger
