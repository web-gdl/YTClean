package com.webgdl.ytclean.download

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.OutputStream
import java.nio.ByteOrder

/**
 * Convierte el audio descargado (M4A/AAC o WebM/Opus) a MP3 en el propio teléfono:
 * MediaCodec lo decodifica a PCM y LAME lo codifica en CBR. Sin FFmpeg.
 */
object Mp3Converter {
    /** Calidad del algoritmo de LAME (0 = mejor y más lento, 9 = peor). 5 va bien en equipos lentos como el 8227L. */
    private const val LAME_QUALITY = 5

    fun convert(input: File, out: OutputStream, kbps: Int, onProgress: (Float) -> Unit) {
        val ex = MediaExtractor()
        ex.setDataSource(input.path)
        var codec: MediaCodec? = null
        var enc = 0L
        try {
            val track = (0 until ex.trackCount).firstOrNull {
                ex.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
            } ?: error("El archivo no tiene audio")
            ex.selectTrack(track)
            val format = ex.getTrackFormat(track)
            val durationUs = if (format.containsKey(MediaFormat.KEY_DURATION)) format.getLong(MediaFormat.KEY_DURATION) else 0L
            val dec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
            codec = dec
            dec.configure(format, null, null, 0)
            dec.start()

            var channels = 0
            var outChannels = 0
            var isFloat = false
            var pcm = ShortArray(0)
            var mp3 = ByteArray(0)
            val info = MediaCodec.BufferInfo()
            var inputDone = false
            var lastPercent = -1

            while (true) {
                if (!inputDone) {
                    val i = dec.dequeueInputBuffer(10_000)
                    if (i >= 0) {
                        val buf = dec.getInputBuffer(i)!!
                        val n = ex.readSampleData(buf, 0)
                        if (n < 0) {
                            dec.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            inputDone = true
                        } else {
                            dec.queueInputBuffer(i, 0, n, ex.sampleTime, 0)
                            ex.advance()
                        }
                    }
                }
                val o = dec.dequeueOutputBuffer(info, 10_000)
                if (o < 0) continue
                if (enc == 0L) {
                    val f = dec.outputFormat
                    channels = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                    outChannels = minOf(channels, 2)
                    isFloat = f.containsKey(MediaFormat.KEY_PCM_ENCODING) &&
                        f.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT
                    enc = Mp3Encoder.nativeInit(f.getInteger(MediaFormat.KEY_SAMPLE_RATE), outChannels, kbps, LAME_QUALITY)
                    if (enc == 0L) error("No se pudo iniciar el codificador MP3")
                }
                if (info.size > 0) {
                    val buf = dec.getOutputBuffer(o)!!
                    buf.position(info.offset)
                    buf.limit(info.offset + info.size)
                    buf.order(ByteOrder.nativeOrder())
                    val samples = if (isFloat) info.size / 4 else info.size / 2
                    val frames = samples / channels
                    if (pcm.size < frames * outChannels) pcm = ShortArray(frames * outChannels)
                    if (isFloat) {
                        val fb = buf.asFloatBuffer()
                        for (fr in 0 until frames) for (c in 0 until outChannels) {
                            pcm[fr * outChannels + c] = (fb.get(fr * channels + c).coerceIn(-1f, 1f) * 32767f).toInt().toShort()
                        }
                    } else {
                        val sb = buf.asShortBuffer()
                        if (channels == outChannels) {
                            sb.get(pcm, 0, frames * channels)
                        } else {
                            // Más de 2 canales: se toman los dos frontales.
                            for (fr in 0 until frames) for (c in 0 until outChannels) pcm[fr * outChannels + c] = sb.get(fr * channels + c)
                        }
                    }
                    val need = Mp3Encoder.outputSize(frames)
                    if (mp3.size < need) mp3 = ByteArray(need)
                    val n = Mp3Encoder.nativeEncode(enc, pcm, frames, mp3)
                    if (n < 0) error("Error del codificador MP3 ($n)")
                    out.write(mp3, 0, n)
                    if (durationUs > 0) {
                        val percent = (info.presentationTimeUs * 100 / durationUs).toInt().coerceIn(0, 100)
                        if (percent != lastPercent) {
                            lastPercent = percent
                            onProgress(percent / 100f)
                        }
                    }
                }
                dec.releaseOutputBuffer(o, false)
                if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
            }
            if (enc == 0L) error("El audio está vacío")
            if (mp3.size < 7200) mp3 = ByteArray(7200)
            val n = Mp3Encoder.nativeFlush(enc, mp3)
            if (n > 0) out.write(mp3, 0, n)
        } finally {
            runCatching { codec?.stop() }
            runCatching { codec?.release() }
            ex.release()
            if (enc != 0L) Mp3Encoder.nativeClose(enc)
        }
    }

    /**
     * Etiqueta ID3v2.3 (la versión que leen casi todos los reproductores y autoestéreos):
     * título, artista, álbum y portada JPEG. Textos en UTF-16 con BOM.
     */
    fun id3(title: String, artist: String?, album: String?, coverJpeg: ByteArray?): ByteArray {
        val frames = ByteArrayOutputStream()
        fun frame(id: String, data: ByteArray) {
            frames.write(id.toByteArray(Charsets.ISO_8859_1))
            val n = data.size
            frames.write(byteArrayOf((n ushr 24).toByte(), (n ushr 16).toByte(), (n ushr 8).toByte(), n.toByte(), 0, 0))
            frames.write(data)
        }
        fun text(id: String, value: String?) {
            if (value.isNullOrBlank()) return
            frame(id, byteArrayOf(1, 0xFF.toByte(), 0xFE.toByte()) + value.trim().toByteArray(Charsets.UTF_16LE))
        }
        text("TIT2", title)
        text("TPE1", artist)
        text("TALB", album)
        if (coverJpeg != null) {
            // codificación 0, MIME, tipo 3 (portada), descripción vacía, imagen.
            frame("APIC", byteArrayOf(0) + "image/jpeg".toByteArray(Charsets.ISO_8859_1) + byteArrayOf(0, 3, 0) + coverJpeg)
        }
        val body = frames.toByteArray()
        val size = body.size
        val header = byteArrayOf(
            'I'.code.toByte(), 'D'.code.toByte(), '3'.code.toByte(), 3, 0, 0,
            ((size ushr 21) and 0x7F).toByte(), ((size ushr 14) and 0x7F).toByte(),
            ((size ushr 7) and 0x7F).toByte(), (size and 0x7F).toByte(),
        )
        return header + body
    }
}
