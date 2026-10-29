package com.webgdl.ytclean.download

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ContentValues
import android.content.Context
import android.content.pm.ServiceInfo
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaMuxer
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.webgdl.ytclean.data.DownloadRecord
import com.webgdl.ytclean.data.Library
import com.webgdl.ytclean.data.Yt
import com.webgdl.ytclean.net.DownloaderImpl
import com.webgdl.ytclean.player.YtMedia
import com.webgdl.ytclean.ui.errorMessage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.schabi.newpipe.extractor.services.youtube.YoutubeParsingHelper
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer

/**
 * Descarga de audio o vídeo al teléfono. Las descargas se hacen por fragmentos
 * con el parámetro `range` (como NewPipe) para evitar la limitación de YouTube;
 * el vídeo en alta calidad se une con su pista de audio usando MediaMuxer (sin
 * recodificar). El resultado va a Descargas/YTClean.
 */
class DownloadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val url = inputData.getString(KEY_URL) ?: return@withContext Result.failure()
        val kind = inputData.getString(KEY_KIND) ?: KIND_AUDIO
        val height = inputData.getInt(KEY_HEIGHT, 720)
        val notifId = url.hashCode()
        val tmp = File(applicationContext.cacheDir, "dl-${System.nanoTime()}").apply { mkdirs() }
        try {
            setForeground(foreground(notifId, "Preparando descarga…", 0, true))
            val info = Yt.stream(url)
            val title = info.name
            val safe = title.replace(Regex("[\\\\/:*?\"<>|]"), "_").take(120)
            val (file, mime, ext) = when (kind) {
                KIND_AUDIO -> {
                    val a = YtMedia.downloadAudio(info) ?: error("No hay audio descargable")
                    val out = File(tmp, "audio")
                    fetch(a.content, out) { p -> progress(notifId, title, p) }
                    val isM4a = a.format?.suffix == "m4a"
                    Triple(out, if (isM4a) "audio/mp4" else "audio/webm", if (isM4a) "m4a" else "webm")
                }
                else -> {
                    val v = YtMedia.downloadVideo(info, height)
                    val a = YtMedia.downloadAudio(info)
                    if (v != null && a != null && a.format?.suffix == "m4a") {
                        val vf = File(tmp, "video")
                        val af = File(tmp, "audio")
                        fetch(v.content, vf) { p -> progress(notifId, title, p * 0.85f) }
                        fetch(a.content, af) { p -> progress(notifId, title, 0.85f + p * 0.13f) }
                        setForeground(foreground(notifId, "Uniendo vídeo y audio: $title", 99, false))
                        val out = File(tmp, "out.mp4")
                        mux(vf, af, out)
                        Triple(out, "video/mp4", "mp4")
                    } else {
                        val m = YtMedia.downloadMuxed(info) ?: error("No hay vídeo descargable en MP4")
                        val out = File(tmp, "video.mp4")
                        fetch(m.content, out) { p -> progress(notifId, title, p) }
                        Triple(out, "video/mp4", "mp4")
                    }
                }
            }
            val name = "$safe.$ext"
            val uri = publish(file, name, mime)
            Library(applicationContext).addDownload(DownloadRecord(title, uri.toString(), mime, file.length(), System.currentTimeMillis()))
            notify(notifId, "Descargado: $title", null)
            Result.success()
        } catch (e: Exception) {
            notify(notifId, "No se pudo descargar", errorMessage(e))
            Result.failure()
        } finally {
            tmp.deleteRecursively()
        }
    }

    /** Descarga por fragmentos de 8 MB con `&range=` (y POST, como el reproductor). */
    private suspend fun fetch(url: String, out: File, onProgress: suspend (Float) -> Unit) {
        val client = DownloaderImpl.getInstance().client
        val total = Uri.parse(url).getQueryParameter("clen")?.toLongOrNull()
        val playback = url.contains("/videoplayback")
        val ua = if (YoutubeParsingHelper.isVisionOsStreamingUrl(url)) YoutubeParsingHelper.getVisionOsUserAgent(null) else DownloaderImpl.USER_AGENT
        FileOutputStream(out).use { os ->
            var pos = 0L
            var rn = 0
            val chunk = 8L * 1024 * 1024
            while (true) {
                val end = if (total != null) minOf(pos + chunk - 1, total - 1) else pos + chunk - 1
                val builder = Request.Builder().header("User-Agent", ua)
                if (playback) {
                    builder.url("$url&range=$pos-$end&rn=${rn++}").post(byteArrayOf(0x78, 0).toRequestBody())
                    if (YoutubeParsingHelper.isWebStreamingUrl(url)) {
                        builder.header("Origin", "https://www.youtube.com").header("Referer", "https://www.youtube.com")
                    }
                } else {
                    builder.url(url).header("Range", "bytes=$pos-$end")
                }
                val bytes = client.newCall(builder.build()).execute().use { r ->
                    if (r.code == 416) return@use 0L
                    if (!r.isSuccessful) throw java.io.IOException("HTTP ${r.code}")
                    r.body.byteStream().copyTo(os)
                }
                pos += bytes
                if (total != null) onProgress((pos.toFloat() / total).coerceIn(0f, 1f))
                if (bytes < chunk || (total != null && pos >= total)) break
            }
            if (pos == 0L) throw java.io.IOException("El servidor no devolvió datos")
        }
    }

    /** Une una pista de vídeo MP4 y una de audio M4A en un MP4, sin recodificar. */
    private fun mux(video: File, audio: File, out: File) {
        val muxer = MediaMuxer(out.path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        val ve = MediaExtractor().apply { setDataSource(video.path) }
        val ae = MediaExtractor().apply { setDataSource(audio.path) }
        try {
            val vt = selectTrack(ve, "video/")
            val at = selectTrack(ae, "audio/")
            val vOut = muxer.addTrack(ve.getTrackFormat(vt))
            val aOut = muxer.addTrack(ae.getTrackFormat(at))
            muxer.start()
            copySamples(ve, muxer, vOut)
            copySamples(ae, muxer, aOut)
            muxer.stop()
        } finally {
            ve.release()
            ae.release()
            runCatching { muxer.release() }
        }
    }

    private fun selectTrack(ex: MediaExtractor, prefix: String): Int {
        for (i in 0 until ex.trackCount) {
            val mime = ex.getTrackFormat(i).getString(android.media.MediaFormat.KEY_MIME) ?: continue
            if (mime.startsWith(prefix)) {
                ex.selectTrack(i)
                return i
            }
        }
        error("Pista $prefix no encontrada")
    }

    private fun copySamples(ex: MediaExtractor, muxer: MediaMuxer, track: Int) {
        val buffer = ByteBuffer.allocate(4 * 1024 * 1024)
        val info = MediaCodec.BufferInfo()
        while (true) {
            val size = ex.readSampleData(buffer, 0)
            if (size < 0) break
            val flags = if (ex.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0
            info.set(0, size, ex.sampleTime, flags)
            muxer.writeSampleData(track, buffer, info)
            ex.advance()
        }
    }

    /** Copia el archivo a Descargas/YTClean (Android 10+) o a la carpeta de la app. */
    private fun publish(file: File, name: String, mime: String): Uri {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = applicationContext.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, mime)
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/YTClean")
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: error("No se pudo crear el archivo")
            resolver.openOutputStream(uri)?.use { os -> file.inputStream().use { it.copyTo(os) } }
            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            return uri
        }
        val dir = File(applicationContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "YTClean").apply { mkdirs() }
        val dest = File(dir, name)
        file.copyTo(dest, overwrite = true)
        return Uri.fromFile(dest)
    }

    // ---- notificaciones ----

    private var lastPercent = -1

    private suspend fun progress(id: Int, title: String, fraction: Float) {
        val percent = (fraction * 100).toInt()
        if (percent == lastPercent) return
        lastPercent = percent
        setForeground(foreground(id, title, percent, false))
    }

    private fun foreground(id: Int, text: String, percent: Int, indeterminate: Boolean): ForegroundInfo {
        ensureChannel(applicationContext)
        val n = NotificationCompat.Builder(applicationContext, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Descargando")
            .setContentText(text)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setProgress(100, percent, indeterminate)
            .build()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(id, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(id, n)
        }
    }

    private fun notify(id: Int, title: String, text: String?) {
        ensureChannel(applicationContext)
        val n = NotificationCompat.Builder(applicationContext, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle(title)
            .setContentText(text)
            .setAutoCancel(true)
            .build()
        runCatching { applicationContext.getSystemService(NotificationManager::class.java).notify(id + 1, n) }
    }

    companion object {
        private const val CHANNEL = "downloads"
        const val KEY_URL = "url"
        const val KEY_KIND = "kind"
        const val KEY_HEIGHT = "height"
        const val KIND_AUDIO = "audio"
        const val KIND_VIDEO = "video"

        fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val nm = context.getSystemService(NotificationManager::class.java)
            if (nm.getNotificationChannel(CHANNEL) == null) {
                nm.createNotificationChannel(NotificationChannel(CHANNEL, "Descargas", NotificationManager.IMPORTANCE_LOW))
            }
        }

        fun enqueue(context: Context, url: String, kind: String, height: Int = 720) {
            val request = OneTimeWorkRequestBuilder<DownloadWorker>()
                .setInputData(workDataOf(KEY_URL to url, KEY_KIND to kind, KEY_HEIGHT to height))
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork("dl-$kind-$url", ExistingWorkPolicy.KEEP, request)
        }
    }
}
