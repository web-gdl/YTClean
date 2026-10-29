package com.webgdl.ytclean.player

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.exoplayer.dash.DashMediaSource
import androidx.media3.exoplayer.dash.manifest.DashManifestParser
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.exoplayer.source.SingleSampleMediaSource
import com.webgdl.ytclean.data.Yt
import com.webgdl.ytclean.net.DownloaderImpl
import org.schabi.newpipe.extractor.MediaFormat
import org.schabi.newpipe.extractor.services.youtube.YoutubeParsingHelper
import org.schabi.newpipe.extractor.services.youtube.dashmanifestcreators.YoutubeOtfDashManifestCreator
import org.schabi.newpipe.extractor.services.youtube.dashmanifestcreators.YoutubeProgressiveDashManifestCreator
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.AudioTrackType
import org.schabi.newpipe.extractor.stream.DeliveryMethod
import org.schabi.newpipe.extractor.stream.Stream
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.StreamType
import org.schabi.newpipe.extractor.stream.SubtitlesStream
import org.schabi.newpipe.extractor.stream.VideoStream
import java.io.ByteArrayInputStream
import java.util.concurrent.atomic.AtomicInteger

/**
 * Construcción de las fuentes de ExoPlayer a partir de lo que devuelve el
 * extractor. Reproduce el comportamiento de NewPipe (PlaybackResolver y
 * YoutubeHttpDataSource): manifiestos DASH generados localmente para los
 * flujos adaptativos y peticiones POST con el parámetro `rn` a /videoplayback.
 */
object YtMedia {

    private val POST_BODY = byteArrayOf(0x78, 0)
    private const val YOUTUBE = "https://www.youtube.com"
    private val requestNumber = AtomicInteger(0)

    val dataSourceFactory: DataSource.Factory by lazy {
        val http = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setKeepPostFor302Redirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(30_000)
        ResolvingDataSource.Factory(http) { spec -> resolve(spec) }
    }

    private fun resolve(spec: DataSpec): DataSpec {
        var url = spec.uri.toString()
        val headers = HashMap(spec.httpRequestHeaders)
        val isPlayback = spec.uri.path?.startsWith("/videoplayback") == true
        headers["User-Agent"] = if (isPlayback && YoutubeParsingHelper.isVisionOsStreamingUrl(url)) {
            YoutubeParsingHelper.getVisionOsUserAgent(null)
        } else {
            DownloaderImpl.USER_AGENT
        }
        if (!isPlayback) return spec.buildUpon().setHttpRequestHeaders(headers).build()

        if (!url.contains("&rn=")) url += "&rn=" + requestNumber.getAndIncrement()
        if (YoutubeParsingHelper.isWebStreamingUrl(url)) {
            headers["Origin"] = YOUTUBE
            headers["Referer"] = YOUTUBE
            headers["Sec-Fetch-Dest"] = "empty"
            headers["Sec-Fetch-Mode"] = "cors"
            headers["Sec-Fetch-Site"] = "cross-site"
        }
        return spec.buildUpon()
            .setUri(Uri.parse(url))
            .setHttpMethod(DataSpec.HTTP_METHOD_POST)
            .setHttpBody(POST_BODY)
            .setHttpRequestHeaders(headers)
            .build()
    }

    /** Alturas disponibles, de mayor a menor. */
    fun qualities(info: StreamInfo): List<Int> =
        (info.videoOnlyStreams + info.videoStreams).map { heightOf(it) }.filter { it > 0 }.distinct().sortedDescending()

    fun isLive(info: StreamInfo) =
        info.streamType == StreamType.LIVE_STREAM || info.streamType == StreamType.AUDIO_LIVE_STREAM

    /**
     * Fuente para reproducir. [maxHeight] limita la calidad; [audioOnly] reproduce
     * solo la pista de audio. Devuelve también la altura elegida (0 = solo audio).
     */
    fun build(info: StreamInfo, maxHeight: Int, audioOnly: Boolean): Pair<MediaSource, Int> {
        val meta = MediaMetadata.Builder()
            .setTitle(info.name)
            .setArtist(info.uploaderName)
            .setArtworkUri(Yt.bestImage(info.thumbnails, 720)?.let { Uri.parse(it) })
            .build()
        val (main, height) = buildMain(info, maxHeight, audioOnly, meta)
        if (audioOnly || isLive(info)) return main to height
        val subs = subtitleSources(info.subtitles)
        return (if (subs.isEmpty()) main else MergingMediaSource(main, *subs.toTypedArray())) to height
    }

    /** Subtítulos (VTT preferido; si no, TTML). Se eligen desde el botón del reproductor. */
    private fun subtitleSources(list: List<SubtitlesStream>): List<MediaSource> {
        val vtt = list.filter { it.isUrl && it.format == MediaFormat.VTT }
        val chosen = vtt.ifEmpty { list.filter { it.isUrl && it.format == MediaFormat.TTML } }
        val factory = SingleSampleMediaSource.Factory(dataSourceFactory)
        return chosen.take(12).map { s ->
            val config = MediaItem.SubtitleConfiguration.Builder(Uri.parse(s.content))
                .setMimeType(if (s.format == MediaFormat.VTT) MimeTypes.TEXT_VTT else MimeTypes.APPLICATION_TTML)
                .setLanguage(s.languageTag)
                .setLabel(s.displayLanguageName + if (s.isAutoGenerated) " (automáticos)" else "")
                .build()
            factory.createMediaSource(config, C.TIME_UNSET)
        }
    }

    private fun buildMain(info: StreamInfo, maxHeight: Int, audioOnly: Boolean, meta: MediaMetadata): Pair<MediaSource, Int> {
        if (isLive(info)) {
            val hls = info.hlsUrl
            if (!hls.isNullOrEmpty()) {
                return HlsMediaSource.Factory(dataSourceFactory).createMediaSource(item(hls, meta)) to 0
            }
            val dash = info.dashMpdUrl
            if (!dash.isNullOrEmpty()) {
                return DashMediaSource.Factory(dataSourceFactory).createMediaSource(item(dash, meta)) to 0
            }
            throw IllegalStateException("Directo sin manifiesto reproducible")
        }

        val audio = pickAudio(info.audioStreams)
        if (audioOnly && audio != null) return sourceFor(audio, info, meta) to 0

        val videoOnly = pickVideo(info.videoOnlyStreams, maxHeight)
        if (videoOnly != null && audio != null) {
            return MergingMediaSource(sourceFor(videoOnly, info, meta), sourceFor(audio, info, meta)) to heightOf(videoOnly)
        }
        val muxed = pickVideo(info.videoStreams, maxHeight)
        if (muxed != null) return progressive(muxed.content, meta) to heightOf(muxed)
        if (audio != null) return sourceFor(audio, info, meta) to 0
        throw IllegalStateException("No hay formatos reproducibles para este vídeo")
    }

    private fun sourceFor(stream: Stream, info: StreamInfo, meta: MediaMetadata): MediaSource {
        val itag = stream.itagItem
        try {
            when (stream.deliveryMethod) {
                DeliveryMethod.PROGRESSIVE_HTTP -> if (itag != null) {
                    val manifest = YoutubeProgressiveDashManifestCreator
                        .fromProgressiveStreamingUrl(stream.content, itag, info.duration)
                    return dash(manifest, stream, meta)
                }
                DeliveryMethod.DASH -> if (itag != null) {
                    val manifest = YoutubeOtfDashManifestCreator
                        .fromOtfStreamingUrl(stream.content, itag, info.duration)
                    return dash(manifest, stream, meta)
                }
                DeliveryMethod.HLS ->
                    return HlsMediaSource.Factory(dataSourceFactory).createMediaSource(item(stream.content, meta))
                else -> Unit
            }
        } catch (_: Exception) {
            // Igual que NewPipe: si el manifiesto falla, reproducción progresiva.
        }
        return progressive(stream.content, meta)
    }

    private fun dash(manifest: String, stream: Stream, meta: MediaMetadata): MediaSource {
        val parsed = DashManifestParser().parse(
            Uri.parse(stream.manifestUrl ?: ""),
            ByteArrayInputStream(manifest.toByteArray(Charsets.UTF_8)),
        )
        return DashMediaSource.Factory(dataSourceFactory)
            .createMediaSource(parsed, item(stream.content, meta))
    }

    private fun progressive(url: String, meta: MediaMetadata): MediaSource =
        ProgressiveMediaSource.Factory(dataSourceFactory).createMediaSource(item(url, meta))

    private fun item(url: String, meta: MediaMetadata): MediaItem =
        MediaItem.Builder().setUri(Uri.parse(url)).setMediaMetadata(meta).build()

    /** Flujo de audio y de vídeo (MP4) que usarían las descargas. */
    fun downloadAudio(info: StreamInfo): AudioStream? = pickAudio(info.audioStreams.filter { it.format == MediaFormat.M4A }) ?: pickAudio(info.audioStreams)
    fun downloadVideo(info: StreamInfo, maxHeight: Int): VideoStream? = pickVideo(info.videoOnlyStreams.filter { it.format == MediaFormat.MPEG_4 }, maxHeight)
    fun downloadMuxed(info: StreamInfo): VideoStream? = pickVideo(info.videoStreams.filter { it.format == MediaFormat.MPEG_4 }, 1080)
    fun downloadHeights(info: StreamInfo): List<Int> =
        info.videoOnlyStreams.filter { it.format == MediaFormat.MPEG_4 && it.isUrl }.map { heightOf(it) }.filter { it > 0 }.distinct().sortedDescending()

    fun heightOf(v: VideoStream): Int {
        if (v.height > 0) return v.height
        return Regex("(\\d{3,4})p").find(v.getResolution())?.groupValues?.get(1)?.toIntOrNull() ?: 0
    }

    /** MP4 (H.264) primero por compatibilidad; la mayor altura que no supere [maxHeight]. */
    private fun pickVideo(streams: List<VideoStream>, maxHeight: Int): VideoStream? {
        val usable = streams.filter { it.isUrl && it.format != null }
        if (usable.isEmpty()) return null
        fun rank(v: VideoStream) = when (v.format) {
            MediaFormat.MPEG_4 -> 0
            MediaFormat.WEBM -> 1
            else -> 2
        }
        val fitting = usable.filter { heightOf(it) in 1..maxHeight }
        val pool = fitting.ifEmpty { listOf(usable.minBy { heightOf(it) }) }
        val best = pool.maxOf { heightOf(it) }
        return pool.filter { heightOf(it) == best }.minWith(compareBy<VideoStream>({ rank(it) }, { -it.fps }))
    }

    /** Pista original (no doblada ni descriptiva), AAC primero, mayor bitrate. */
    private fun pickAudio(streams: List<AudioStream>): AudioStream? {
        val usable = streams.filter { it.isUrl }
        if (usable.isEmpty()) return null
        val original = usable.filter { it.audioTrackType == null || it.audioTrackType == AudioTrackType.ORIGINAL }.ifEmpty { usable }
        return original.maxWith(
            compareBy<AudioStream>({ if (it.format == MediaFormat.M4A) 1 else 0 }, { it.averageBitrate }),
        )
    }
}
