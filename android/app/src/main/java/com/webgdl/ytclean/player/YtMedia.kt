package com.webgdl.ytclean.player

import android.net.Uri
import androidx.media3.common.MediaItem
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
        if (isLive(info)) {
            val hls = info.hlsUrl
            if (!hls.isNullOrEmpty()) {
                return HlsMediaSource.Factory(dataSourceFactory).createMediaSource(MediaItem.fromUri(hls)) to 0
            }
            val dash = info.dashMpdUrl
            if (!dash.isNullOrEmpty()) {
                return DashMediaSource.Factory(dataSourceFactory).createMediaSource(MediaItem.fromUri(dash)) to 0
            }
            throw IllegalStateException("Directo sin manifiesto reproducible")
        }

        val audio = pickAudio(info.audioStreams)
        if (audioOnly && audio != null) return sourceFor(audio, info) to 0

        val videoOnly = pickVideo(info.videoOnlyStreams, maxHeight)
        if (videoOnly != null && audio != null) {
            return MergingMediaSource(sourceFor(videoOnly, info), sourceFor(audio, info)) to heightOf(videoOnly)
        }
        val muxed = pickVideo(info.videoStreams, maxHeight)
        if (muxed != null) return progressive(muxed.content) to heightOf(muxed)
        if (audio != null) return sourceFor(audio, info) to 0
        throw IllegalStateException("No hay formatos reproducibles para este vídeo")
    }

    private fun sourceFor(stream: Stream, info: StreamInfo): MediaSource {
        val itag = stream.itagItem
        try {
            when (stream.deliveryMethod) {
                DeliveryMethod.PROGRESSIVE_HTTP -> if (itag != null) {
                    val manifest = YoutubeProgressiveDashManifestCreator
                        .fromProgressiveStreamingUrl(stream.content, itag, info.duration)
                    return dash(manifest, stream)
                }
                DeliveryMethod.DASH -> if (itag != null) {
                    val manifest = YoutubeOtfDashManifestCreator
                        .fromOtfStreamingUrl(stream.content, itag, info.duration)
                    return dash(manifest, stream)
                }
                DeliveryMethod.HLS ->
                    return HlsMediaSource.Factory(dataSourceFactory).createMediaSource(MediaItem.fromUri(stream.content))
                else -> Unit
            }
        } catch (_: Exception) {
            // Igual que NewPipe: si el manifiesto falla, reproducción progresiva.
        }
        return progressive(stream.content)
    }

    private fun dash(manifest: String, stream: Stream): MediaSource {
        val parsed = DashManifestParser().parse(
            Uri.parse(stream.manifestUrl ?: ""),
            ByteArrayInputStream(manifest.toByteArray(Charsets.UTF_8)),
        )
        return DashMediaSource.Factory(dataSourceFactory)
            .createMediaSource(parsed, MediaItem.Builder().setUri(Uri.parse(stream.content)).build())
    }

    private fun progressive(url: String): MediaSource =
        ProgressiveMediaSource.Factory(dataSourceFactory).createMediaSource(MediaItem.fromUri(url))

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
