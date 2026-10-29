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
        if (kind == KIND_MP3) return@withContext doMp3(url, notifId)
        val tmp = File(applicationContext.cacheDir, "dl-${System.nanoTime()}").apply { mkdirs() }
        try {
            setForeground(foreground(notifId, "Preparando descarga…", 0, true))
            val info = Yt.stream(url)
            val title = info.name
            val safe = safeName(title)
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

    /**
     * Descarga el audio, lo convierte a MP3 (LAME) con etiqueta ID3 y portada, y lo guarda en
     * Música/YTClean[/lista]. Devuelve siempre éxito para que un vídeo fallido no detenga el
     * resto de la cola de MP3 (el error se avisa en una notificación).
     */
    private suspend fun doMp3(url: String, notifId: Int): Result {
        val folder = inputData.getString(KEY_FOLDER)?.let { safeName(it) }?.ifBlank { null }
        val position = inputData.getString(KEY_POSITION)
        val kbps = inputData.getInt(KEY_KBPS, 192)
        val tmp = File(applicationContext.cacheDir, "mp3-${System.nanoTime()}").apply { mkdirs() }
        var title = url
        try {
            setForeground(foreground(notifId, "Preparando MP3…", 0, true, "MP3"))
            val info = Yt.stream(url)
            title = info.name
            val label = if (position != null) "($position) $title" else title
            val a = YtMedia.downloadAudio(info) ?: error("No hay audio descargable")
            val audio = File(tmp, "audio")
            fetch(a.content, audio) { p -> progress(notifId, label, p * 0.5f, "Descargando audio") }
            val artist = info.uploaderName?.removeSuffix(" - Topic")
            val cover = runCatching { coverJpeg(Yt.bestImage(info.thumbnails, 720)) }.getOrNull()
            val mp3 = File(tmp, "out.mp3")
            mp3.outputStream().buffered().use { os ->
                os.write(Mp3Converter.id3(title, artist, folder, cover))
                Mp3Converter.convert(audio, os, kbps) { p ->
                    val percent = 50 + (p * 50).toInt()
                    if (percent != lastPercent) {
                        lastPercent = percent
                        // Se actualiza la notificación en primer plano (mismo ID) sin suspender.
                        runCatching {
                            applicationContext.getSystemService(NotificationManager::class.java)
                                .notify(notifId, progressNotification(label, percent, false, "Convirtiendo a MP3"))
                        }
                    }
                }
            }
            audio.delete()
            val uri = publishMusic(mp3, "${safeName(title)}.mp3", folder)
            Library(applicationContext).addDownload(DownloadRecord(title, uri.toString(), "audio/mpeg", mp3.length(), System.currentTimeMillis()))
            notify(notifId, "MP3 listo: $title", folder?.let { "Música/YTClean/$it" } ?: "Música/YTClean")
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            notify(notifId, "No se pudo crear el MP3: $title", errorMessage(e))
        } finally {
            tmp.deleteRecursively()
        }
        return Result.success()
    }

    /** Miniatura como JPEG de hasta 640 px (lo que mejor leen reproductores y autoestéreos). */
    private fun coverJpeg(url: String?): ByteArray? {
        if (url == null) return null
        val bytes = DownloaderImpl.getInstance().client.newCall(Request.Builder().url(url).build()).execute().use { r ->
            if (!r.isSuccessful) return null
            r.body.bytes()
        }
        val bmp = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
        val scale = minOf(1f, 640f / maxOf(bmp.width, bmp.height))
        val scaled = if (scale < 1f) android.graphics.Bitmap.createScaledBitmap(bmp, (bmp.width * scale).toInt(), (bmp.height * scale).toInt(), true) else bmp
        val out = java.io.ByteArrayOutputStream()
        scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, out)
        if (scaled !== bmp) scaled.recycle()
        bmp.recycle()
        return out.toByteArray()
    }

    /**
     * Guarda el MP3 en Música/YTClean (visible para los reproductores de música). En Android 9
     * o anterior se usa la carpeta pública si se concedió el permiso de almacenamiento; si no,
     * la carpeta de la app.
     */
    private fun publishMusic(file: File, name: String, folder: String?): Uri {
        val sub = Environment.DIRECTORY_MUSIC + "/YTClean" + (folder?.let { "/$it" } ?: "")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = applicationContext.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, "audio/mpeg")
                put(MediaStore.MediaColumns.RELATIVE_PATH, sub)
                put(MediaStore.Audio.Media.IS_MUSIC, 1)
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values) ?: error("No se pudo crear el archivo")
            try {
                resolver.openOutputStream(uri)?.use { os -> file.inputStream().use { it.copyTo(os) } } ?: error("No se pudo escribir el archivo")
            } catch (e: Exception) {
                resolver.delete(uri, null, null)
                throw e
            }
            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            return uri
        }
        val granted = androidx.core.content.ContextCompat.checkSelfPermission(
            applicationContext, android.Manifest.permission.WRITE_EXTERNAL_STORAGE,
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        @Suppress("DEPRECATION")
        val base = if (granted) Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC)
        else applicationContext.getExternalFilesDir(Environment.DIRECTORY_MUSIC)!!
        val dir = File(base, "YTClean" + (folder?.let { "/$it" } ?: "")).apply { mkdirs() }
        val dest = File(dir, name)
        file.copyTo(dest, overwrite = true)
        android.media.MediaScannerConnection.scanFile(applicationContext, arrayOf(dest.path), arrayOf("audio/mpeg"), null)
        return Uri.fromFile(dest)
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

    private suspend fun progress(id: Int, title: String, fraction: Float, status: String = "Descargando") {
        val percent = (fraction * 100).toInt()
        if (percent == lastPercent) return
        lastPercent = percent
        setForeground(foreground(id, title, percent, false, status))
    }

    private fun foreground(id: Int, text: String, percent: Int, indeterminate: Boolean, status: String = "Descargando"): ForegroundInfo {
        val n = progressNotification(text, percent, indeterminate, status)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(id, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(id, n)
        }
    }

    private fun progressNotification(text: String, percent: Int, indeterminate: Boolean, status: String): android.app.Notification {
        ensureChannel(applicationContext)
        return NotificationCompat.Builder(applicationContext, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(status)
            .setContentText(text)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setProgress(100, percent, indeterminate)
            .build()
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

        const val KIND_MP3 = "mp3"
        const val KEY_FOLDER = "folder"
        const val KEY_POSITION = "position"
        const val KEY_KBPS = "kbps"
        private const val MP3_QUEUE = "mp3-queue"

        fun safeName(name: String): String = name.replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_").trim().trimEnd('.').take(120)

        /**
         * Pone en cola la conversión a MP3 de uno o varios vídeos. Se procesan de uno en uno
         * (cola única que se va ampliando), para no saturar teléfonos o autoestéreos con poca RAM.
         * [folder] = subcarpeta y álbum (nombre de la lista).
         */
        fun enqueueMp3(context: Context, urls: List<String>, folder: String? = null, kbps: Int = 192) {
            if (urls.isEmpty()) return
            val requests = urls.mapIndexed { i, url ->
                OneTimeWorkRequestBuilder<DownloadWorker>()
                    .setInputData(
                        workDataOf(
                            KEY_URL to url, KEY_KIND to KIND_MP3, KEY_FOLDER to folder, KEY_KBPS to kbps,
                            KEY_POSITION to if (urls.size > 1) "${i + 1}/${urls.size}" else null,
                        ),
                    )
                    .build()
            }
            var chain = WorkManager.getInstance(context).beginUniqueWork(MP3_QUEUE, ExistingWorkPolicy.APPEND_OR_REPLACE, requests.first())
            for (r in requests.drop(1)) chain = chain.then(r)
            chain.enqueue()
        }

        fun enqueue(context: Context, url: String, kind: String, height: Int = 720) {
            val request = OneTimeWorkRequestBuilder<DownloadWorker>()
                .setInputData(workDataOf(KEY_URL to url, KEY_KIND to kind, KEY_HEIGHT to height))
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork("dl-$kind-$url", ExistingWorkPolicy.KEEP, request)
        }
    }
}
