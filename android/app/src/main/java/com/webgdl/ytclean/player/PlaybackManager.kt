package com.webgdl.ytclean.player

import android.content.ComponentName
import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.Renderer
import androidx.media3.exoplayer.text.TextOutput
import androidx.media3.exoplayer.text.TextRenderer
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.webgdl.ytclean.data.Library
import com.webgdl.ytclean.data.Segment
import com.webgdl.ytclean.data.SponsorBlock
import com.webgdl.ytclean.data.VideoItem
import com.webgdl.ytclean.data.Yt
import com.webgdl.ytclean.ui.errorMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.schabi.newpipe.extractor.stream.StreamInfo
import java.util.Locale

/** Estado visible del reproductor. */
data class PlaybackState(
    val queue: List<VideoItem> = emptyList(),
    val index: Int = -1,
    val info: StreamInfo? = null,
    val loading: Boolean = false,
    val error: String? = null,
    val height: Int = 0,
    val audioOnly: Boolean = false,
    val maxHeight: Int = 720,
    /** Último aviso de SponsorBlock («Se omitió un patrocinio»). */
    val notice: String? = null,
) {
    val current: VideoItem? get() = queue.getOrNull(index)
    val hasNext: Boolean get() = index in 0 until queue.size - 1
    val hasPrevious: Boolean get() = index > 0
}

/**
 * Reproductor único de la app (como LibreTube/NewPipe): vive mientras la app
 * está en marcha, lo comparten la pantalla del reproductor y el servicio de
 * segundo plano, y gestiona la cola local, SponsorBlock y el historial.
 */
class PlaybackManager private constructor(context: Context) {
    private val app = context.applicationContext
    private val library = Library(app)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val handler = Handler(Looper.getMainLooper())
    private var loadJob: Job? = null
    private var segments: List<Segment> = emptyList()
    private val skipped = mutableSetOf<Long>()
    private var controllerFuture: ListenableFuture<MediaController>? = null

    private val _state = MutableStateFlow(PlaybackState(maxHeight = library.quality, audioOnly = library.audioOnly))
    val state: StateFlow<PlaybackState> = _state

    /** ExoPlayer con decodificación de subtítulos externos (VTT/TTML) activada. */
    val exo: ExoPlayer = ExoPlayer.Builder(app, SubtitleRenderersFactory(app))
        .setAudioAttributes(
            AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(),
            true,
        )
        .setHandleAudioBecomingNoisy(true)
        .setWakeMode(C.WAKE_MODE_NETWORK)
        .build()

    /** Reproductor expuesto a la interfaz y a la notificación: añade siguiente/anterior de la cola. */
    val player: Player = QueuePlayer(exo)

    init {
        exo.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED && _state.value.hasNext) next()
            }

            override fun onPlayerError(error: PlaybackException) {
                _state.value = _state.value.copy(
                    loading = false,
                    error = "Error de reproducción (${error.errorCodeName}). Las direcciones de YouTube caducan: pulsa Reintentar.",
                )
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                handler.removeCallbacks(sponsorTick)
                if (isPlaying && segments.isNotEmpty()) handler.post(sponsorTick)
            }
        })
    }

    // ---- cola ----

    fun playQueue(items: List<VideoItem>, index: Int = 0, startMs: Long = -1) {
        if (items.isEmpty()) return
        ensureService()
        _state.value = _state.value.copy(queue = items, index = index.coerceIn(0, items.size - 1))
        load(startMs)
    }

    fun playUrl(url: String) {
        val cur = _state.value.current
        if (cur?.url == url && _state.value.error == null) return // ya se está reproduciendo
        playQueue(listOf(VideoItem(url)))
    }

    fun playNext(item: VideoItem) {
        val s = _state.value
        if (s.current == null) return playQueue(listOf(item))
        val q = s.queue.toMutableList().apply { add(s.index + 1, item) }
        _state.value = s.copy(queue = q)
    }

    fun enqueue(item: VideoItem) {
        val s = _state.value
        if (s.current == null) return playQueue(listOf(item))
        _state.value = s.copy(queue = s.queue + item)
    }

    fun jumpTo(index: Int) {
        if (index !in _state.value.queue.indices) return
        _state.value = _state.value.copy(index = index)
        load(-1)
    }

    fun next() {
        if (_state.value.hasNext) jumpTo(_state.value.index + 1)
    }

    fun previous() {
        if (exo.currentPosition > 5_000 || !_state.value.hasPrevious) exo.seekTo(0) else jumpTo(_state.value.index - 1)
    }

    // ---- calidad / audio ----

    fun setMaxHeight(h: Int) {
        _state.value = _state.value.copy(maxHeight = h, audioOnly = false)
        rebuild()
    }

    fun setAudioOnly(on: Boolean) {
        _state.value = _state.value.copy(audioOnly = on)
        rebuild()
    }

    fun retry() = load(exo.currentPosition.takeIf { it > 0 } ?: -1)

    fun stop() {
        loadJob?.cancel()
        exo.stop()
        exo.clearMediaItems()
        _state.value = PlaybackState(maxHeight = library.quality, audioOnly = library.audioOnly)
    }

    // ---- carga ----

    private fun load(startMs: Long) {
        val s = _state.value
        val item = s.current ?: return
        loadJob?.cancel()
        segments = emptyList()
        skipped.clear()
        _state.value = s.copy(loading = true, error = null, info = null, notice = null)
        exo.stop()
        loadJob = scope.launch {
            try {
                val info = withContext(Dispatchers.IO) { Yt.stream(item.url) }
                val full = item.copy(
                    title = info.name,
                    channel = info.uploaderName ?: item.channel,
                    channelUrl = info.uploaderUrl ?: item.channelUrl,
                    thumbnail = Yt.bestImage(info.thumbnails) ?: item.thumbnail,
                    durationSeconds = info.duration,
                )
                val q = _state.value.queue.toMutableList()
                if (_state.value.index in q.indices) q[_state.value.index] = full
                _state.value = _state.value.copy(queue = q, info = info)
                val start = if (startMs >= 0) startMs else info.startPosition * 1000
                prepare(info, start)
                library.addHistory(full)
                if (library.sponsorBlock && !YtMedia.isLive(info)) fetchSegments(info.id)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                _state.value = _state.value.copy(loading = false, error = errorMessage(e))
            }
        }
    }

    private fun rebuild() {
        val info = _state.value.info ?: return
        val pos = exo.currentPosition
        scope.launch {
            try {
                prepare(info, pos)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                _state.value = _state.value.copy(error = errorMessage(e))
            }
        }
    }

    private suspend fun prepare(info: StreamInfo, positionMs: Long) {
        val s = _state.value
        val (source, height) = withContext(Dispatchers.IO) { YtMedia.build(info, s.maxHeight, s.audioOnly) }
        exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon()
            .setPreferredTextLanguage(if (library.captions) Locale.getDefault().language else null)
            .setSelectUndeterminedTextLanguage(library.captions)
            .build()
        exo.setMediaSource(source, positionMs.coerceAtLeast(0))
        exo.prepare()
        exo.playWhenReady = true
        _state.value = _state.value.copy(loading = false, height = height)
    }

    // ---- SponsorBlock ----

    private fun fetchSegments(videoId: String) {
        scope.launch {
            val segs = withContext(Dispatchers.IO) { SponsorBlock.segments(videoId) }
            if (_state.value.info?.id != videoId) return@launch
            segments = segs
            if (segs.isNotEmpty() && exo.isPlaying) {
                handler.removeCallbacks(sponsorTick)
                handler.post(sponsorTick)
            }
        }
    }

    private val sponsorTick = object : Runnable {
        override fun run() {
            val pos = exo.currentPosition
            val seg = segments.firstOrNull { pos >= it.startMs && pos < it.endMs - 500 }
            if (seg != null && skipped.add(seg.startMs)) {
                exo.seekTo(seg.endMs)
                _state.value = _state.value.copy(notice = "Se omitió: ${SponsorBlock.label(seg.category)}")
            }
            if (exo.isPlaying) handler.postDelayed(this, 500)
        }
    }

    // ---- servicio ----

    /** Conecta un controlador al servicio para que arranque y muestre la notificación. */
    private fun ensureService() {
        if (controllerFuture != null) return
        val token = SessionToken(app, ComponentName(app, PlaybackService::class.java))
        controllerFuture = MediaController.Builder(app, token).buildAsync()
    }

    /** Añade siguiente/anterior de la cola local a la notificación y a los controles. */
    private inner class QueuePlayer(p: ExoPlayer) : ForwardingPlayer(p) {
        private val extra = intArrayOf(
            Player.COMMAND_SEEK_TO_NEXT,
            Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
            Player.COMMAND_SEEK_TO_PREVIOUS,
            Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
        )

        override fun getAvailableCommands(): Player.Commands =
            super.getAvailableCommands().buildUpon().addAll(*extra).build()

        override fun isCommandAvailable(command: Int): Boolean = command in extra || super.isCommandAvailable(command)

        override fun hasNextMediaItem(): Boolean = _state.value.hasNext
        override fun hasPreviousMediaItem(): Boolean = true
        override fun seekToNext() = next()
        override fun seekToNextMediaItem() = next()
        override fun seekToPrevious() = previous()
        override fun seekToPreviousMediaItem() = previous()
    }

    /** Activa la decodificación de subtítulos cargados aparte (SingleSampleMediaSource). */
    private class SubtitleRenderersFactory(context: Context) : DefaultRenderersFactory(context) {
        override fun buildTextRenderers(
            context: Context,
            output: TextOutput,
            outputLooper: Looper,
            extensionRendererMode: Int,
            out: ArrayList<Renderer>,
        ) {
            val renderer = TextRenderer(output, outputLooper)
            renderer.experimentalSetLegacyDecodingEnabled(true)
            out.add(renderer)
        }
    }

    companion object {
        @Volatile
        private var instance: PlaybackManager? = null

        fun get(context: Context): PlaybackManager =
            instance ?: synchronized(this) { instance ?: PlaybackManager(context).also { instance = it } }
    }
}
